"""Topic normalization API endpoint."""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel, Field

from ..models.metadata import ArtifactMetadata
from ..models.normalize import (
    NormalizeTopicRequest,
    NormalizeTopicResponse,
)
from ..providers import get_provider
from ..utils.hashing import compute_sha256
from ..utils.logger import get_logger
from ..utils.retry import _extract_json_from_response

logger = get_logger(__name__)

router = APIRouter(prefix="/llm", tags=["normalize"])


class RawNormalizeOutput(BaseModel):
    """Model for validating raw LLM output (without metadata)."""

    topic_normalized: str = Field(
        ..., description="Canonical form of the topic (lowercase with underscores)"
    )
    domain_category: Literal[
        "math", "cs", "networking", "cloud", "web", "ai", "general"
    ] = Field(..., description="The domain category for staleness determination")
    staleness_policy: Literal["never", "7d", "30d", "90d", "annual"] = Field(
        ..., description="How often cached plans should be checked"
    )


@router.post("/normalize-topic", response_model=NormalizeTopicResponse)
async def normalize_topic(
    request: NormalizeTopicRequest, http_request: Request
) -> NormalizeTopicResponse:
    """Normalize a user's free-text topic to canonical form.

    This endpoint:
    1. Loads current staleness policies from the database
    2. Injects them into the prompt template
    3. Calls the LLM to normalize and categorize the topic

    Args:
        request: Request containing the raw topic and request_id
        http_request: FastAPI Request object (for accessing app.state)

    Returns:
        NormalizeTopicResponse with topic_normalized, domain_category, staleness_policy

    Raises:
        HTTPException(422): If validation fails after retries
        HTTPException(500): On unexpected errors
        HTTPException(503): If database/staleness policies service is unavailable
    """
    prompt_version = "normalize/v1"

    # Get staleness policies from app.state
    if not hasattr(http_request.app.state, "staleness_policies"):
        raise HTTPException(
            status_code=503,
            detail="Staleness policies service not initialized. Is database connected?",
        )

    policy_service = http_request.app.state.staleness_policies

    try:
        # Load prompt template
        from ..utils.prompts import load_prompt

        prompt_template = load_prompt("normalize", "v1")

        # Get policies with descriptions for the prompt
        policy_descriptions = await policy_service.get_policy_descriptions()
        policies_list = [
            f"- {cat}: {desc}" for cat, desc in sorted(policy_descriptions.items())
        ]
        policies_text = "\n".join(policies_list)
        categories_list = sorted(policy_descriptions.keys())

        # Format prompt with injected policies
        prompt = prompt_template.replace("{policies}", policies_text)
        prompt = prompt.replace("{categories}", ", ".join(categories_list))
        prompt = prompt.replace("{{topic}}", request.topic)

        # Get LLM provider
        provider = get_provider()

        # Generate response
        start_time = datetime.now(timezone.utc)
        raw_output = await provider.generate(prompt, temperature=0.3)
        duration_ms = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)

        # Parse and validate
        try:
            cleaned = _extract_json_from_response(raw_output)
            data = json.loads(cleaned)
            validated = RawNormalizeOutput.model_validate(data)
        except (json.JSONDecodeError, Exception) as e:
            logger.warning(
                "Normalization validation failed",
                topic=request.topic,
                error=str(e),
                raw_output_hash=compute_sha256(raw_output),
            )
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "VALIDATION_ERROR",
                    "message": f"Failed to validate LLM output: {e}",
                    "details": {"raw_output": raw_output[:500]},
                    "request_id": request.request_id,
                    "timestamp": datetime.now(timezone.utc)
                    .isoformat()
                    .replace("+00:00", "Z"),
                },
            )

        # Create metadata
        metadata = ArtifactMetadata(
            request_id=request.request_id,
            prompt_version=prompt_version,
            provider=provider.provider_name,
            model=provider.model_name,
            created_at=datetime.now(timezone.utc)
            .isoformat()
            .replace("+00:00", "Z"),
            raw_output_hash=compute_sha256(raw_output),
            artifact_hash=compute_sha256(
                json.dumps(validated.model_dump(), sort_keys=True)
            ),
            validation_retry_count=0,
        )

        logger.info(
            "Topic normalized",
            request_id=request.request_id,
            topic=request.topic,
            normalized=validated.topic_normalized,
            domain_category=validated.domain_category,
            staleness_policy=validated.staleness_policy,
        )

        return NormalizeTopicResponse(
            topic_normalized=validated.topic_normalized,
            domain_category=validated.domain_category,
            staleness_policy=validated.staleness_policy,
            metadata=metadata,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Unexpected error in topic normalization",
            request_id=request.request_id,
            topic=request.topic,
            error=str(e),
        )
        raise HTTPException(
            status_code=500,
            detail={
                "error": "INTERNAL_ERROR",
                "message": "An unexpected error occurred",
                "details": {},
                "request_id": request.request_id,
                "timestamp": datetime.now(timezone.utc)
                .isoformat()
                .replace("+00:00", "Z"),
            },
        )
