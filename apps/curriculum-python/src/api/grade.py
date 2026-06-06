"""Grade API endpoint for exercise answer grading."""

import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator

from .llm_errors import raise_llm_provider_http_exception
from ..models.grade import Grade
from ..models.metadata import ArtifactMetadata
from ..providers import get_provider
from ..utils.hashing import compute_sha256
from ..utils.prompts import load_prompt
from ..utils.retry import NonRetryableLLMError, RetryConfig, retry_llm_with_validation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/llm", tags=["grade"])

# Exercise types that use local grading (no LLM call)
LOCAL_GRADING_TYPES = {"mcq", "flashcard"}


class GradeRequest(BaseModel):
    """Request body for grading an answer."""

    plan_id: UUID = Field(..., description="Plan ID")
    node_id: str = Field(
        ..., pattern=r"^[a-z0-9_]{3,100}$", description="Node ID within the plan"
    )
    exercise_id: str = Field(..., description="Exercise ID being graded")
    exercise_type: Literal["mcq", "short_answer", "fill_blank", "coding", "flashcard"] = Field(
        ..., description="Type of exercise"
    )
    prompt: str = Field(..., min_length=10, description="The exercise question/prompt")
    rubric: str = Field(..., min_length=20, max_length=500, description="Grading rubric")
    correct_answer: Any = Field(..., description="The correct answer (type varies by exercise)")
    user_answer: Any = Field(
        ..., description="The user's submitted answer (max 10,000 characters when serialized to string)"
    )
    user_level: Literal["beginner", "intermediate", "advanced"] = Field(
        ..., description="User's level"
    )
    request_id: UUID = Field(..., description="Request ID for tracing")


class GradeResponse(BaseModel):
    """Response body for grading."""

    grade: Grade


class RawGradeOutput(BaseModel):
    """Model for validating raw LLM output for grading.

    This model validates the structure the LLM is expected to produce,
    before we add our own metadata.
    """

    score: float = Field(..., ge=0.0, le=1.0)
    is_correct: bool
    feedback: str = Field(..., min_length=20, max_length=300)
    misconceptions: list[str] | None = None

    @model_validator(mode="after")
    def validate_score_correctness_consistency(self) -> "RawGradeOutput":
        """Ensure is_correct is consistent with score thresholds.

        Matches the Grade model validator so the retry loop feeds
        the error back to the LLM for self-correction.
        """
        if self.score >= 0.7 and not self.is_correct:
            raise ValueError(
                f"Score {self.score} >= 0.7 requires is_correct=True"
            )
        if self.score < 0.5 and self.is_correct:
            raise ValueError(
                f"Score {self.score} < 0.5 requires is_correct=False"
            )
        return self


@router.post("/grade", response_model=GradeResponse)
async def grade_answer(request: GradeRequest) -> GradeResponse:
    """Grade a user's answer to an exercise.

    For MCQ and flashcard types, uses local matching (no LLM call).
    For other types, uses LLM-based grading with rubric.

    Args:
        request: Request containing exercise details and user's answer.

    Returns:
        GradeResponse containing the Grade with feedback and metadata.

    Raises:
        HTTPException(422): If LLM grading validation fails after retries.
        HTTPException(500): On unexpected errors.
    """
    try:
        # Validate user_answer size (serialize and check length)
        user_answer_str = _format_answer_for_prompt(request.user_answer)
        if len(user_answer_str) > 10000:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "ANSWER_TOO_LONG",
                    "message": "User answer exceeds maximum length of 10,000 characters",
                    "request_id": str(request.request_id),
                },
            )

        # Use local grading for MCQ and flashcard
        if request.exercise_type in LOCAL_GRADING_TYPES:
            return _grade_locally(request)

        # Use LLM grading for other types
        return await _grade_with_llm(request)

    except HTTPException:
        raise
    except NonRetryableLLMError as e:
        raise_llm_provider_http_exception(e, request.request_id, logger, "grading")
    except Exception as e:
        logger.exception(f"Unexpected error in grading: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "INTERNAL_ERROR",
                "message": "An unexpected error occurred while grading the answer",
                "request_id": str(request.request_id),
            },
        )


def _grade_locally(request: GradeRequest) -> GradeResponse:
    """Grade MCQ and flashcard exercises locally without LLM.

    Args:
        request: The grading request.

    Returns:
        GradeResponse with local grading result.
    """
    user_answer = _normalize_answer(str(request.user_answer))
    correct_answer = _normalize_answer(str(request.correct_answer))

    is_correct = user_answer == correct_answer

    if is_correct:
        score = 1.0
        feedback = "Correct! You've demonstrated understanding of this concept."
    else:
        score = 0.0
        if request.exercise_type == "mcq":
            feedback = f"Not quite. The correct answer was: {request.correct_answer}. Review this topic and try again."
        else:
            feedback = f"Not quite. Review the concept and try again. The expected answer was different."

    # Create metadata for local grading (provider="local")
    metadata = ArtifactMetadata(
        provider="local",
        model="local_grading",
        prompt_version="grade/local",
        created_at=datetime.now(timezone.utc),
        request_id=request.request_id,
        raw_output_hash=compute_sha256(f"{is_correct}:{score}"),
        artifact_hash=compute_sha256(f"{request.exercise_id}:{user_answer}:{is_correct}"),
        validation_retry_count=0,
    )

    grade = Grade(
        schema_version="grade.v1",
        plan_id=request.plan_id,
        node_id=request.node_id,
        exercise_id=request.exercise_id,
        score=score,
        is_correct=is_correct,
        feedback=feedback,
        misconceptions=None,
        metadata=metadata,
    )

    logger.info(
        f"Local grading complete. "
        f"Exercise: {request.exercise_id}, "
        f"Type: {request.exercise_type}, "
        f"Correct: {is_correct}"
    )

    return GradeResponse(grade=grade)


async def _grade_with_llm(request: GradeRequest) -> GradeResponse:
    """Grade exercise using LLM with rubric-based evaluation.

    Args:
        request: The grading request.

    Returns:
        GradeResponse with LLM grading result.

    Raises:
        HTTPException(422): If validation fails after retries.
    """
    prompt_version = "grade/v1"

    # Load prompt template
    prompt_template = load_prompt("grade", "v1")

    # Get LLM provider
    provider = get_provider()

    # Define generation function
    async def generate_fn(prompt: str) -> str:
        temperature = float(os.getenv("LLM_TEMPERATURE_GRADE", 0.3))
        return await provider.generate(prompt, temperature=temperature, max_tokens=2048)

    # Format correct_answer for prompt
    correct_answer_str = _format_answer_for_prompt(request.correct_answer)
    user_answer_str = _format_answer_for_prompt(request.user_answer)

    # Prepare prompt kwargs
    prompt_kwargs = {
        "exercise_type": request.exercise_type,
        "prompt": request.prompt,
        "rubric": request.rubric,
        "correct_answer": correct_answer_str,
        "user_answer": user_answer_str,
        "user_level": request.user_level,
    }

    # Configure retry
    config = RetryConfig(include_errors_in_prompt=True)

    # Call LLM with retry
    result = await retry_llm_with_validation(
        generate_fn=generate_fn,
        prompt_template=prompt_template,
        prompt_kwargs=prompt_kwargs,
        model_class=RawGradeOutput,
        config=config,
    )

    if not result.success or result.value is None:
        logger.error(
            f"Grading failed after {result.total_attempts} attempts. "
            f"Errors: {result.final_errors}"
        )
        raise HTTPException(
            status_code=422,
            detail={
                "error": "VALIDATION_FAILED",
                "message": "Failed to generate valid grade after retries",
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
        provider=provider.provider_name,
        model=provider.model_name,
        prompt_version=prompt_version,
        created_at=datetime.now(timezone.utc),
        request_id=request.request_id,
        raw_output_hash=raw_output_hash,
        artifact_hash=artifact_hash,
        validation_retry_count=result.retry_count,
    )

    # Construct Grade with metadata
    grade = Grade(
        schema_version="grade.v1",
        plan_id=request.plan_id,
        node_id=request.node_id,
        exercise_id=request.exercise_id,
        score=result.value.score,
        is_correct=result.value.is_correct,
        feedback=result.value.feedback,
        misconceptions=result.value.misconceptions,
        metadata=metadata,
    )

    logger.info(
        f"LLM grading complete. "
        f"Exercise: {request.exercise_id}, "
        f"Type: {request.exercise_type}, "
        f"Score: {grade.score}, "
        f"Retries: {result.retry_count}"
    )

    return GradeResponse(grade=grade)


def _normalize_answer(answer: str) -> str:
    """Normalize an answer for comparison.

    Args:
        answer: The answer string to normalize.

    Returns:
        Normalized lowercase string with trimmed whitespace.
    """
    # Lowercase and strip
    normalized = answer.lower().strip()
    # Collapse multiple whitespace
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized


def _format_answer_for_prompt(answer: Any) -> str:
    """Format an answer value for inclusion in the prompt.

    Args:
        answer: The answer value (could be string, dict, list, etc.)

    Returns:
        Formatted string representation.
    """
    if isinstance(answer, str):
        return answer
    elif isinstance(answer, dict):
        import json
        return json.dumps(answer, indent=2)
    elif isinstance(answer, list):
        import json
        return json.dumps(answer)
    else:
        return str(answer)
