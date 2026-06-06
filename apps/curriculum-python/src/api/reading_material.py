"""Reading material API endpoint for LLM-generated learning content."""

import logging
import os
import re
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from .llm_errors import raise_llm_provider_http_exception
from ..models.metadata import ArtifactMetadata
from ..models.reading_material import ReadingMaterial, ReadingMaterialSection
from ..providers import get_provider
from ..utils.hashing import compute_sha256
from ..utils.prompts import load_prompt
from ..utils.retry import NonRetryableLLMError, RetryConfig, retry_llm_with_validation

logger = logging.getLogger(__name__)

# YouTube video ID validation pattern
VIDEO_ID_PATTERN = re.compile(r'^[a-zA-Z0-9_-]{11}$')

router = APIRouter(prefix="/llm", tags=["reading-material"])

# Constants for reading material generation
MAX_TRANSCRIPT_CHARS = 8000


class TranscriptInput(BaseModel):
    """Input transcript for reading material generation."""

    video_id: str = Field(..., min_length=11, max_length=11, description="YouTube video ID")
    title: str = Field(..., min_length=1, max_length=200, description="Video title")
    content_text: str = Field(..., min_length=50, max_length=10_000, description="Content text (truncated)")

    @field_validator('video_id')
    @classmethod
    def validate_video_id_format(cls, v: str) -> str:
        """Validate YouTube video ID format."""
        if not VIDEO_ID_PATTERN.match(v):
            raise ValueError('Invalid YouTube video ID format')
        return v


class GenerateReadingMaterialRequest(BaseModel):
    """Request body for reading material generation."""

    plan_id: UUID = Field(..., description="Plan ID for tracing")
    node_id: str = Field(..., min_length=1, max_length=255, description="Node ID within the plan")
    node_title: str = Field(..., min_length=3, max_length=200, description="Node title")
    node_objectives: list[str] = Field(
        ..., min_length=1, max_length=5, description="Learning objectives for the node"
    )
    transcripts: list[TranscriptInput] = Field(
        ..., min_length=1, max_length=5, description="Transcripts from top videos"
    )
    request_id: UUID = Field(..., description="Request ID for tracing")


class GenerateReadingMaterialResponse(BaseModel):
    """Response body for reading material generation."""

    reading_material: ReadingMaterial


class RawReadingMaterialOutput(BaseModel):
    """Model for validating raw LLM output (without metadata).

    This model validates the structure the LLM is expected to produce,
    before we add our own metadata.
    """

    sections: list[ReadingMaterialSection] = Field(
        ...,
        min_length=1,
        max_length=8,
        description="1-8 sections of reading material",
    )


@router.post("/reading-material", response_model=GenerateReadingMaterialResponse)
async def generate_reading_material(
    request: GenerateReadingMaterialRequest,
) -> GenerateReadingMaterialResponse:
    """Generate reading material from video transcripts.

    Uses LLM to synthesize information from multiple video transcripts
    into a well-structured, self-contained reading guide.

    Args:
        request: Request containing node information, transcripts, and request_id.

    Returns:
        GenerateReadingMaterialResponse containing the validated ReadingMaterial.

    Raises:
        HTTPException(422): If validation fails after all retries.
        HTTPException(500): On unexpected errors.
    """
    prompt_version = "reading_material/v1"

    try:
        # Load prompt template
        prompt_template = load_prompt("reading_material", "v1")

        # Get LLM provider
        provider = get_provider()

        # Define generation function
        async def generate_fn(prompt: str) -> str:
            temperature = float(os.getenv("LLM_TEMPERATURE_READING_MATERIAL", 0.5))
            return await provider.generate(prompt, temperature=temperature, max_tokens=4096)

        # Format transcripts for prompt (truncate each to MAX_TRANSCRIPT_CHARS)
        transcript_chunks = []
        for t in request.transcripts:
            truncated = t.content_text[:MAX_TRANSCRIPT_CHARS]
            if len(t.content_text) > MAX_TRANSCRIPT_CHARS:
                truncated += "..."
            transcript_chunks.append(f"**Video: {t.title}**\n{truncated}\n")

        transcripts_str = "\n".join(transcript_chunks)

        # Prepare prompt kwargs
        prompt_kwargs = {
            "node_title": request.node_title,
            "node_objectives": "\n".join(f"- {obj}" for obj in request.node_objectives),
            "transcripts": transcripts_str,
        }

        # Configure retry
        config = RetryConfig(include_errors_in_prompt=True)

        # Call LLM with retry
        result = await retry_llm_with_validation(
            generate_fn=generate_fn,
            prompt_template=prompt_template,
            prompt_kwargs=prompt_kwargs,
            model_class=RawReadingMaterialOutput,
            config=config,
        )

        if not result.success or result.value is None:
            logger.error(
                f"Reading material generation failed after {result.total_attempts} attempts. "
                f"Error count: {len(result.final_errors)}"
            )
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "VALIDATION_FAILED",
                    "message": "Failed to generate valid reading material after retries",
                    "validation_errors": [f"Attempt {i+1}: validation failed" for i in range(len(result.final_errors))],
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

        # Construct full ReadingMaterial with metadata
        reading_material = ReadingMaterial(
            plan_id=str(request.plan_id),
            node_id=request.node_id,
            sections=result.value.sections,
            metadata=metadata,
        )

        logger.info(
            f"Reading material generated successfully. "
            f"Node: {request.node_title}, "
            f"Sections: {len(reading_material.sections)}, "
            f"Retries: {result.retry_count}"
        )

        return GenerateReadingMaterialResponse(reading_material=reading_material)

    except HTTPException:
        raise
    except NonRetryableLLMError as e:
        raise_llm_provider_http_exception(e, request.request_id, logger, "reading material generation")
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
        logger.exception(f"Unexpected error in reading material generation: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "INTERNAL_ERROR",
                "message": "An unexpected error occurred while generating reading material",
                "request_id": str(request.request_id),
            },
        )
