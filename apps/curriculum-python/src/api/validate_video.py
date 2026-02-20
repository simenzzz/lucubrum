"""Video validation API endpoint."""

import json
import logging
import os
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..models.metadata import ArtifactMetadata
from ..models.transcript import VideoValidation
from ..providers import get_provider
from ..utils.hashing import compute_sha256
from ..utils.prompts import load_prompt
from ..utils.retry import RetryConfig, retry_llm_with_validation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/llm", tags=["validation"])


class ValidateVideoRequest(BaseModel):
    """Request body for video validation."""

    video_id: str = Field(
        ..., min_length=11, max_length=11, description="YouTube video ID"
    )
    plan_id: UUID = Field(..., description="Plan UUID")
    node_id: str = Field(..., min_length=1, max_length=255, description="Node ID within the plan")
    node_title: str = Field(..., min_length=3, max_length=500, description="Title of the learning node")
    node_objectives: list[str] = Field(
        ..., min_length=1, max_length=20, description="Learning objectives for the node"
    )
    content_text: str = Field(
        ..., min_length=10, max_length=10_000, description="Video content text (description) to validate"
    )
    video_title: str | None = Field(None, max_length=500, description="Video title")
    channel_name: str | None = Field(None, max_length=255, description="Channel name")
    request_id: UUID = Field(..., description="Request ID for tracing")


class ValidateVideoResponse(BaseModel):
    """Response body for video validation."""

    validation: VideoValidation


class RawVideoValidationOutput(BaseModel):
    """Validate raw LLM output before adding metadata."""

    is_relevant: bool
    relevance_score: float = Field(..., ge=0.0, le=1.0)
    matched_objectives: list[str] = Field(default_factory=list)
    rejection_reason: str | None = None


@router.post("/validate-video", response_model=ValidateVideoResponse)
async def validate_video(request: ValidateVideoRequest) -> ValidateVideoResponse:
    """Validate that a video matches a learning node.

    Uses LLM to compare video metadata (title, channel, description) against:
    - Node title
    - Node objectives
    - Expected topic coverage

    Args:
        request: Request containing video and node details.

    Returns:
        ValidateVideoResponse containing the validation result.

    Raises:
        HTTPException(422): If LLM output validation fails after retries.
        HTTPException(500): On LLM or unexpected errors.
    """
    try:
        # Load prompt template
        prompt_template = load_prompt("validate_video", "v2")

        # Get LLM provider
        provider = get_provider()

        # Define generation function
        async def generate_fn(prompt: str) -> str:
            temperature = float(os.getenv("LLM_TEMPERATURE_VALIDATE", "0.3"))
            return await provider.generate(
                prompt=prompt, temperature=temperature, max_tokens=2048
            )

        # Prepare prompt kwargs
        prompt_kwargs = {
            "node_title": request.node_title,
            "node_objectives": "\n".join(f"- {obj}" for obj in request.node_objectives),
            "video_title": request.video_title or "Unknown",
            "channel_name": request.channel_name or "Unknown",
            "description_text": request.content_text,
        }

        # Configure retry
        config = RetryConfig(include_errors_in_prompt=True)

        # Call LLM with retry and validation
        result = await retry_llm_with_validation(
            generate_fn=generate_fn,
            prompt_template=prompt_template,
            prompt_kwargs=prompt_kwargs,
            model_class=RawVideoValidationOutput,
            config=config,
        )

        if not result.success or result.value is None:
            logger.error(
                f"Video validation failed after {result.total_attempts} attempts. "
                f"Error count: {len(result.final_errors)}"
            )
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "VALIDATION_FAILED",
                    "message": "Failed to validate video after retries",
                    "validation_errors": [f"Attempt {i+1}: validation failed" for i in range(len(result.final_errors))],
                    "attempts": result.total_attempts,
                    "request_id": str(request.request_id),
                },
            )

        # Compute hashes
        raw_output_hash = compute_sha256(result.raw_output)
        artifact_hash = compute_sha256(result.value.model_dump_json())

        # Build the validation result
        validation = VideoValidation(
            video_id=request.video_id,
            plan_id=request.plan_id,
            node_id=request.node_id,
            is_relevant=result.value.is_relevant,
            relevance_score=result.value.relevance_score,
            matched_objectives=result.value.matched_objectives,
            rejection_reason=result.value.rejection_reason,
            metadata=ArtifactMetadata(
                provider=provider.provider_name,
                model=provider.model_name,
                prompt_version="validate_video/v2",
                created_at=datetime.now(timezone.utc),
                request_id=request.request_id,
                raw_output_hash=raw_output_hash,
                artifact_hash=artifact_hash,
                validation_retry_count=result.retry_count,
            ),
        )

        return ValidateVideoResponse(validation=validation)

    except HTTPException:
        raise
    except FileNotFoundError as e:
        logger.error(f"Prompt file not found: request_id={request.request_id} error={e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "PROMPT_NOT_FOUND",
                "message": "Prompt template not found",
            },
        )
    except Exception as e:
        logger.error(f"Unexpected validation error: request_id={request.request_id} error={e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "INTERNAL_ERROR",
                "message": "Internal server error during validation",
            },
        )
