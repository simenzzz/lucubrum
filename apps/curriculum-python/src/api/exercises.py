"""Exercises generation API endpoint."""

import logging
import os
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..models.exercise import (
    CodingAnswer,
    CodingExercise,
    Exercise,
    ExerciseSet,
    FillBlankAnswer,
    FillBlankExercise,
    FlashcardExercise,
    MCQExercise,
    ShortAnswerExercise,
)
from ..models.metadata import ArtifactMetadata
from ..providers import get_provider
from ..utils.hashing import compute_sha256
from ..utils.prompts import load_prompt
from ..utils.retry import RetryConfig, retry_llm_with_validation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/llm", tags=["exercises"])

# Valid exercise types
ExerciseType = Literal["mcq", "short_answer", "fill_blank", "coding", "flashcard"]


class GenerateExercisesRequest(BaseModel):
    """Request body for exercise generation."""

    plan_id: UUID = Field(..., description="Plan ID the exercises belong to")
    node_id: str = Field(
        ..., pattern=r"^[a-z0-9_]{3,100}$", description="Node ID within the plan"
    )
    topic: str = Field(..., min_length=3, max_length=100, description="Learning topic")
    node_title: str = Field(
        ..., min_length=3, max_length=200, description="Title of the learning node"
    )
    objectives: list[str] = Field(
        ..., min_length=1, max_length=5, description="Learning objectives for this node"
    )
    user_level: Literal["beginner", "intermediate", "advanced"] = Field(
        ..., description="User's current level"
    )
    exercise_types: list[ExerciseType] = Field(
        default=["mcq", "short_answer"],
        min_length=1,
        description="Types of exercises to generate",
    )
    count: int = Field(default=5, ge=1, le=20, description="Number of exercises to generate")
    difficulty_target: int = Field(
        default=3, ge=1, le=5, description="Target difficulty level (1-5)"
    )
    request_id: UUID = Field(..., description="Request ID for tracing")


class GenerateExercisesResponse(BaseModel):
    """Response body for exercise generation."""

    exercise_set: ExerciseSet


class RawExerciseOutput(BaseModel):
    """Model for validating raw LLM output for exercises.

    This model validates the structure the LLM is expected to produce,
    before we add our own metadata.
    """

    exercises: list[Exercise] = Field(..., min_length=1)


@router.post("/exercises", response_model=GenerateExercisesResponse)
async def generate_exercises(
    request: GenerateExercisesRequest,
) -> GenerateExercisesResponse:
    """Generate exercises for a learning node.

    Uses LLM to generate exercises based on the topic, objectives, and constraints.
    Optionally uses web search for inspiration (graceful degradation).
    Includes retry logic for validation failures.

    Args:
        request: Request containing node details and exercise parameters.

    Returns:
        GenerateExercisesResponse containing the validated ExerciseSet with metadata.

    Raises:
        HTTPException(422): If validation fails after all retries.
        HTTPException(500): On unexpected errors.
    """
    prompt_version = "exercises/v1"

    try:
        # Load prompt template
        prompt_template = load_prompt("exercises", "v1")

        # Get LLM provider
        provider = get_provider()

        # Define generation function
        async def generate_fn(prompt: str) -> str:
            temperature = float(os.getenv("LLM_TEMPERATURE_EXERCISES", 0.7))
            return await provider.generate(prompt, temperature=temperature, max_tokens=8192)

        # Prepare prompt kwargs
        prompt_kwargs = {
            "topic": request.topic,
            "node_title": request.node_title,
            "objectives": "\n".join(f"- {obj}" for obj in request.objectives),
            "user_level": request.user_level,
            "difficulty_target": request.difficulty_target,
            "exercise_types": ", ".join(request.exercise_types),
            "count": request.count,
        }

        # Configure retry
        config = RetryConfig(include_errors_in_prompt=True)

        # Call LLM with retry
        result = await retry_llm_with_validation(
            generate_fn=generate_fn,
            prompt_template=prompt_template,
            prompt_kwargs=prompt_kwargs,
            model_class=RawExerciseOutput,
            config=config,
        )

        if not result.success or result.value is None:
            logger.error(
                f"Exercise generation failed after {result.total_attempts} attempts. "
                f"Errors: {result.final_errors}"
            )
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "VALIDATION_FAILED",
                    "message": "Failed to generate valid exercises after retries",
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

        # Construct full ExerciseSet with metadata
        exercise_set = ExerciseSet(
            schema_version="exercise_set.v1",
            plan_id=request.plan_id,
            node_id=request.node_id,
            user_level=request.user_level,
            exercises=result.value.exercises,
            metadata=metadata,
        )

        logger.info(
            f"Exercises generated successfully. "
            f"Topic: {request.topic}, "
            f"Count: {len(exercise_set.exercises)}, "
            f"Types: {[ex.type for ex in exercise_set.exercises]}, "
            f"Retries: {result.retry_count}"
        )

        return GenerateExercisesResponse(exercise_set=exercise_set)

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
        logger.exception(f"Unexpected error in exercise generation: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "INTERNAL_ERROR",
                "message": "An unexpected error occurred while generating exercises",
                "request_id": str(request.request_id),
            },
        )


