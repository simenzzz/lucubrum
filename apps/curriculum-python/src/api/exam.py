"""Exam generation API endpoint."""

import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..models.exam import ExamExerciseSet, GenerateExamRequest, RawExamOutput
from ..models.metadata import ArtifactMetadata
from ..providers import get_provider
from ..utils.hashing import compute_sha256
from ..utils.prompts import load_prompt
from ..utils.retry import RetryConfig, retry_llm_with_validation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/llm", tags=["exam"])


class GenerateExamResponse(BaseModel):
    """Response body for exam generation."""

    exam_exercise_set: ExamExerciseSet


@router.post("/exam", response_model=GenerateExamResponse)
async def generate_exam(
    request: GenerateExamRequest,
) -> GenerateExamResponse:
    """Generate an exam for a learning node assessment.

    Uses LLM to generate exam exercises based on the topic, objectives, and current mastery.
    Includes retry logic for validation failures.

    Args:
        request: Request containing node details and exam parameters.

    Returns:
        GenerateExamResponse containing the validated ExamExerciseSet with metadata.

    Raises:
        HTTPException(422): If validation fails after all retries.
        HTTPException(500): On unexpected errors.
    """
    prompt_version = "exam/v1"

    try:
        # Calculate target difficulty range based on current mastery
        # Target slightly above current mastery to challenge the user
        target_min = request.current_mastery
        target_max = min(request.current_mastery + 0.2, 1.0)

        # Convert to difficulty level 1-5
        # 0.0-0.2 -> 1, 0.2-0.4 -> 2, 0.4-0.6 -> 3, 0.6-0.8 -> 4, 0.8-1.0 -> 5
        target_difficulty_level = int((target_min + target_max) / 2 * 4) + 1
        target_difficulty_level = max(1, min(5, target_difficulty_level))

        # Load prompt template
        prompt_template = load_prompt("exam", "v1")

        # Get LLM provider
        provider = get_provider()

        # Define generation function
        async def generate_fn(prompt: str) -> str:
            temperature = float(os.getenv("LLM_TEMPERATURE_EXAM", "0.7"))
            return await provider.generate(prompt, temperature=temperature, max_tokens=8192)

        # Prepare prompt kwargs
        prompt_kwargs = {
            "topic": request.topic,
            "node_title": request.node_title,
            "objectives": "\n".join(f"- {obj}" for obj in request.objectives),
            "user_level": request.user_level,
            "current_mastery": request.current_mastery,
            "exercise_count": request.exercise_count,
            "target_difficulty_min": target_min,
            "target_difficulty_max": target_max,
            "target_difficulty_level": target_difficulty_level,
        }

        # Configure retry
        config = RetryConfig(include_errors_in_prompt=True)

        # Call LLM with retry
        result = await retry_llm_with_validation(
            generate_fn=generate_fn,
            prompt_template=prompt_template,
            prompt_kwargs=prompt_kwargs,
            model_class=RawExamOutput,
            config=config,
        )

        if not result.success or result.value is None:
            logger.error(
                f"Exam generation failed after {result.total_attempts} attempts. "
                f"Errors: {result.final_errors}"
            )
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "VALIDATION_FAILED",
                    "message": "Failed to generate valid exam after retries",
                    "validation_errors": result.final_errors,
                    "attempts": result.total_attempts,
                    "request_id": str(request.request_id),
                },
            )

        # Compute hashes
        raw_output_hash = compute_sha256(result.raw_output)
        artifact_hash = compute_sha256(result.value.model_dump_json())

        # Construct metadata
        metadata = ArtifactMetadata(
            provider=provider.provider_name,  # type: ignore[arg-type]
            model=provider.model_name,
            prompt_version=prompt_version,
            created_at=datetime.now(timezone.utc),
            request_id=request.request_id,
            raw_output_hash=raw_output_hash,
            artifact_hash=artifact_hash,
            validation_retry_count=result.retry_count,
        )

        # Construct full ExamExerciseSet with metadata
        exam_exercise_set = ExamExerciseSet(
            schema_version="exam_exercise_set.v1",
            plan_id=request.plan_id,
            node_id=request.node_id,
            user_level=request.user_level,
            exercises=result.value.exercises,
            exam_difficulty=result.value.exam_difficulty,
            metadata=metadata,
        )

        logger.info(
            f"Exam generated successfully. "
            f"Topic: {request.topic}, "
            f"Count: {len(exam_exercise_set.exercises)}, "
            f"Difficulty: {exam_exercise_set.exam_difficulty}, "
            f"Retries: {result.retry_count}"
        )

        return GenerateExamResponse(exam_exercise_set=exam_exercise_set)

    except HTTPException:
        raise
    except FileNotFoundError as e:
        logger.error(f"Prompt file not found: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "CONFIGURATION_ERROR",
                "message": "Prompt template not found",
                "request_id": str(request.request_id),
            },
        )
    except Exception as e:
        logger.exception(f"Unexpected error in exam generation: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "INTERNAL_ERROR",
                "message": "An unexpected error occurred while generating the exam",
                "request_id": str(request.request_id),
            },
        )
