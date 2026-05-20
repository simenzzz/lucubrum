"""Query suggestions API endpoint for YouTube search queries."""

import logging
import os
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..models.metadata import ArtifactMetadata
from ..models.query_suggestions import QuerySuggestions
from ..providers import get_provider
from ..utils.hashing import compute_sha256
from ..utils.prompts import load_prompt
from ..utils.retry import RetryConfig, retry_llm_with_validation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/llm", tags=["queries"])


class GenerateQueriesRequest(BaseModel):
    """Request body for query suggestions generation."""

    plan_id: UUID = Field(..., description="Plan ID for tracing")
    node_id: str = Field(..., min_length=1, description="Node ID within the plan")
    node_title: str = Field(..., min_length=3, max_length=200, description="Node title")
    node_objectives: list[str] = Field(
        ..., min_length=1, max_length=5, description="Learning objectives for the node"
    )
    node_tags: list[str] | None = Field(
        default=None, description="Optional tags for the node"
    )
    request_id: UUID = Field(..., description="Request ID for tracing")


class GenerateQueriesResponse(BaseModel):
    """Response body for query suggestions generation."""

    suggestions: QuerySuggestions


class RawQueriesOutput(BaseModel):
    """Model for validating raw LLM output (without metadata).

    This model validates the structure the LLM is expected to produce,
    before we add our own metadata.
    """

    queries: list[str] = Field(
        ...,
        min_length=1,
        max_length=5,
        description="1-5 search query strings",
    )


@router.post("/queries", response_model=GenerateQueriesResponse)
async def generate_queries(request: GenerateQueriesRequest) -> GenerateQueriesResponse:
    """Generate YouTube search queries for a learning node.

    Uses LLM to generate targeted search queries based on node title,
    objectives, and tags. Includes retry logic for validation failures.

    Args:
        request: Request containing node information and request_id.

    Returns:
        GenerateQueriesResponse containing the validated QuerySuggestions.

    Raises:
        HTTPException(422): If validation fails after all retries.
        HTTPException(500): On unexpected errors.
    """
    prompt_version = "queries/v1"

    try:
        # Load prompt template
        prompt_template = load_prompt("queries", "v1")

        # Get LLM provider
        provider = get_provider()

        # Define generation function
        async def generate_fn(prompt: str) -> str:
            temperature = float(os.getenv("LLM_TEMPERATURE_QUERIES", 0.7))
            return await provider.generate(prompt, temperature=temperature, max_tokens=1024)

        # Format tags as comma-separated string or "none"
        tags_str = ", ".join(request.node_tags) if request.node_tags else "none"

        # Prepare prompt kwargs
        prompt_kwargs = {
            "node_title": request.node_title,
            "node_objectives": "\n".join(f"- {obj}" for obj in request.node_objectives),
            "node_tags": tags_str,
        }

        # Configure retry
        config = RetryConfig(include_errors_in_prompt=True)

        # Call LLM with retry
        result = await retry_llm_with_validation(
            generate_fn=generate_fn,
            prompt_template=prompt_template,
            prompt_kwargs=prompt_kwargs,
            model_class=RawQueriesOutput,
            config=config,
        )

        if not result.success or result.value is None:
            logger.error(
                f"Query generation failed after {result.total_attempts} attempts. "
                f"Errors: {result.final_errors}"
            )
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "VALIDATION_FAILED",
                    "message": "Failed to generate valid queries after retries",
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

        # Construct full QuerySuggestions with metadata
        suggestions = QuerySuggestions(
            plan_id=request.plan_id,
            node_id=request.node_id,
            queries=result.value.queries,
            metadata=metadata,
        )

        logger.info(
            f"Queries generated successfully. "
            f"Node: {request.node_title}, "
            f"Count: {len(suggestions.queries)}, "
            f"Retries: {result.retry_count}"
        )

        return GenerateQueriesResponse(suggestions=suggestions)

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
        logger.exception(f"Unexpected error in query generation: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "INTERNAL_ERROR",
                "message": f"Unexpected error generating queries: {str(e)}",
                "request_id": str(request.request_id),
            },
        )
