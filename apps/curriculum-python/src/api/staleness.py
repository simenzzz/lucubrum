"""Staleness detection API endpoint."""

import json
import os
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..models.metadata import ArtifactMetadata
from ..models.transcript import StalenessResult
from ..providers import get_provider
from ..utils.hashing import compute_sha256
from ..utils.prompts import load_prompt, format_prompt
from ..utils.logger import get_logger
from ..utils.retry import _extract_json_from_response

logger = get_logger(__name__)

router = APIRouter(prefix="/llm", tags=["staleness"])


class ResourceInfo(BaseModel):
    """Information about a cached resource."""

    video_id: str = Field(..., description="YouTube video ID")
    title: str = Field(..., description="Video title")
    transcript_excerpt: str | None = Field(
        default=None, description="Excerpt from video transcript"
    )


class StalenessCheckRequest(BaseModel):
    """Request body for staleness checking."""

    cache_key: str = Field(..., description="Cache key for the plan")
    topic: str = Field(..., description="The learning topic")
    plan_summary: str = Field(
        ..., description="Summary of the cached plan content"
    )
    resources: list[ResourceInfo] = Field(
        default_factory=list, description="Cached resources to check"
    )
    mcp_facts: list[str] = Field(
        default_factory=list, description="Current facts from MCP sources"
    )
    request_id: UUID = Field(..., description="Request ID for tracing")


class StalenessCheckResponse(BaseModel):
    """Response body for staleness checking."""

    result: StalenessResult


@router.post("/check-staleness", response_model=StalenessCheckResponse)
async def check_staleness(request: StalenessCheckRequest) -> StalenessCheckResponse:
    """Check if cached plan content is stale compared to current sources.

    Compares cached plan and resource content against current facts
    from MCP sources (Context7, web search, etc.) to detect contradictions
    or outdated information.

    Args:
        request: Request containing cached content and current facts.

    Returns:
        StalenessCheckResponse containing the staleness result.

    Raises:
        HTTPException(422): If LLM output validation fails.
        HTTPException(500): On LLM or unexpected errors.
    """
    try:
        # If no MCP facts provided, cannot determine staleness
        if not request.mcp_facts:
            return StalenessCheckResponse(
                result=StalenessResult(
                    cache_key=request.cache_key,
                    is_stale=False,
                    contradiction_rate=0.0,
                    stale_reason=None,
                    sources_checked=[],
                    contradictions_found=[],
                    metadata=ArtifactMetadata(
                        provider="none",
                        model="none",
                        prompt_version="staleness/v1",
                        created_at=datetime.now(timezone.utc),
                        request_id=request.request_id,
                        raw_output_hash=compute_sha256("no_facts"),
                        artifact_hash=compute_sha256("no_facts"),
                        validation_retry_count=0,
                    ),
                )
            )

        # Load and format the prompt
        prompt_template = load_prompt("staleness", "v1")

        # Format resource information
        resources_text = ""
        if request.resources:
            resources_text = "\n".join(
                f"- {r.title}: {r.transcript_excerpt or 'No transcript available'}"
                for r in request.resources[:5]  # Limit to 5 resources
            )
        else:
            resources_text = "No resources cached."

        # Format MCP facts
        facts_text = "\n".join(f"- {fact}" for fact in request.mcp_facts[:20])

        prompt = format_prompt(
            prompt_template,
            topic=request.topic,
            plan_summary=request.plan_summary[:2000],  # Limit plan summary
            resources_text=resources_text,
            mcp_facts=facts_text,
        )

        # Get LLM provider and generate
        provider = get_provider()
        temperature = float(os.getenv("LLM_TEMPERATURE_STALENESS", "0.3"))

        raw_response = await provider.generate(
            prompt=prompt,
            temperature=temperature,
            max_tokens=2048,
        )

        # Parse the JSON response
        try:
            cleaned = _extract_json_from_response(raw_response)
            parsed = json.loads(cleaned)
        except json.JSONDecodeError as e:
            logger.warning("LLM returned invalid JSON", error=str(e), request_id=str(request.request_id))
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "VALIDATION_FAILED",
                    "message": "LLM returned invalid response",
                    "request_id": str(request.request_id),
                },
            )

        # Calculate staleness based on threshold
        contradiction_threshold = float(
            os.getenv("STALENESS_CONTRADICTION_THRESHOLD", "0.10")
        )
        contradictions = parsed.get("contradictions_found", [])
        total_checked = max(len(request.mcp_facts), 1)
        contradiction_rate = len(contradictions) / total_checked

        is_stale = contradiction_rate >= contradiction_threshold

        # Build the result
        result = StalenessResult(
            cache_key=request.cache_key,
            is_stale=is_stale,
            contradiction_rate=min(contradiction_rate, 1.0),
            stale_reason=parsed.get("stale_reason") if is_stale else None,
            sources_checked=parsed.get("sources_checked", []),
            contradictions_found=contradictions,
            metadata=ArtifactMetadata(
                provider=provider.provider_name,
                model=provider.model_name,
                prompt_version="staleness/v1",
                created_at=datetime.now(timezone.utc),
                request_id=request.request_id,
                raw_output_hash=compute_sha256(raw_response),
                artifact_hash=compute_sha256(json.dumps(parsed, sort_keys=True)),
                validation_retry_count=0,
            ),
        )

        return StalenessCheckResponse(result=result)

    except HTTPException:
        raise
    except FileNotFoundError as e:
        logger.error("Staleness prompt template not found", error=str(e), request_id=str(request.request_id))
        raise HTTPException(
            status_code=500,
            detail={
                "error": "PROMPT_NOT_FOUND",
                "message": "Required prompt template could not be loaded",
                "request_id": str(request.request_id),
            },
        )
    except Exception as e:
        logger.exception("Unexpected error during staleness check", error=str(e), request_id=str(request.request_id))
        raise HTTPException(
            status_code=500,
            detail={
                "error": "INTERNAL_ERROR",
                "message": "An unexpected error occurred while checking staleness",
                "request_id": str(request.request_id),
            },
        )
