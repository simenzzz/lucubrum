"""Video validation API endpoint."""

import hashlib
import json
import os
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..models.metadata import ArtifactMetadata
from ..models.transcript import VideoValidation
from ..providers import get_provider
from ..utils.hashing import compute_sha256
from ..utils.prompts import load_prompt, format_prompt

router = APIRouter(prefix="/llm", tags=["validation"])


class ValidateVideoRequest(BaseModel):
    """Request body for video validation."""

    video_id: str = Field(
        ..., min_length=11, max_length=11, description="YouTube video ID"
    )
    plan_id: UUID = Field(..., description="Plan UUID")
    node_id: str = Field(..., description="Node ID within the plan")
    node_title: str = Field(..., description="Title of the learning node")
    node_objectives: list[str] = Field(
        ..., min_length=1, description="Learning objectives for the node"
    )
    transcript_text: str = Field(
        ..., min_length=10, description="Transcript text to validate"
    )
    request_id: UUID = Field(..., description="Request ID for tracing")


class ValidateVideoResponse(BaseModel):
    """Response body for video validation."""

    validation: VideoValidation


@router.post("/validate-video", response_model=ValidateVideoResponse)
async def validate_video(request: ValidateVideoRequest) -> ValidateVideoResponse:
    """Validate that a video's transcript matches a learning node.

    Uses LLM to compare transcript content against:
    - Node title
    - Node objectives
    - Expected topic coverage

    Args:
        request: Request containing video and node details.

    Returns:
        ValidateVideoResponse containing the validation result.

    Raises:
        HTTPException(422): If LLM output validation fails.
        HTTPException(500): On LLM or unexpected errors.
    """
    try:
        # Load and format the prompt
        prompt_template = load_prompt("validate_video", "v1")

        # Truncate transcript if needed (keep to ~8000 chars for context)
        transcript_excerpt = request.transcript_text[:8000]
        if len(request.transcript_text) > 8000:
            transcript_excerpt += "..."

        prompt = format_prompt(
            prompt_template,
            node_title=request.node_title,
            node_objectives="\n".join(f"- {obj}" for obj in request.node_objectives),
            transcript_excerpt=transcript_excerpt,
        )

        # Get LLM provider and generate
        provider = get_provider()
        temperature = float(os.getenv("LLM_TEMPERATURE_VALIDATE", "0.3"))

        raw_response = await provider.generate(
            prompt=prompt,
            temperature=temperature,
            max_tokens=1024,
        )

        # Parse the JSON response
        try:
            # Try to extract JSON from the response
            response_text = raw_response.strip()
            # Handle potential markdown code blocks
            if response_text.startswith("```"):
                lines = response_text.split("\n")
                response_text = "\n".join(lines[1:-1])

            parsed = json.loads(response_text)
        except json.JSONDecodeError as e:
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "VALIDATION_FAILED",
                    "message": f"LLM returned invalid JSON: {str(e)}",
                    "raw_response": raw_response[:500],
                },
            )

        # Build the validation result
        validation = VideoValidation(
            video_id=request.video_id,
            plan_id=request.plan_id,
            node_id=request.node_id,
            is_relevant=parsed.get("is_relevant", False),
            relevance_score=parsed.get("relevance_score", 0.0),
            matched_objectives=parsed.get("matched_objectives", []),
            rejection_reason=parsed.get("rejection_reason"),
            metadata=ArtifactMetadata(
                provider=provider.provider_name,
                model=provider.model_name,
                prompt_version="validate_video/v1",
                created_at=datetime.now(timezone.utc),
                request_id=request.request_id,
                raw_output_hash=compute_sha256(raw_response),
                artifact_hash=compute_sha256(json.dumps(parsed, sort_keys=True)),
                validation_retry_count=0,
            ),
        )

        return ValidateVideoResponse(validation=validation)

    except HTTPException:
        raise
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "PROMPT_NOT_FOUND",
                "message": str(e),
            },
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "INTERNAL_ERROR",
                "message": f"Unexpected error during validation: {str(e)}",
            },
        )
