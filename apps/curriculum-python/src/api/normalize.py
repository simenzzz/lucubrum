"""Topic normalization API endpoint."""

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
from ..utils.prompts import load_prompt
from ..utils.retry import RetryConfig, retry_llm_with_validation

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
    staleness_policy: Literal["never", "7d", "14d", "30d", "90d", "annual"] = Field(
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
        prompt_template = load_prompt("normalize", "v1")

        # Get policies with descriptions for the prompt
        policy_descriptions = await policy_service.get_policy_descriptions()
        policies_list = [
            f"- {cat}: {desc}" for cat, desc in sorted(policy_descriptions.items())
        ]
        policies_text = "\n".join(policies_list)
        categories_list = sorted(policy_descriptions.keys())

        # Pre-format the template with injected policies (static per-request)
        prompt_with_policies = prompt_template.replace("{policies}", policies_text)
        prompt_with_policies = prompt_with_policies.replace(
            "{categories}", ", ".join(categories_list)
        )
        # Replace {{topic}} with {topic} so retry_llm_with_validation can format it
        prompt_with_policies = prompt_with_policies.replace("{{topic}}", "{topic}")

        # Get LLM provider
        provider = get_provider()

        # Define generation function
        async def generate_fn(prompt: str) -> str:
            temperature = float(os.getenv("LLM_TEMPERATURE_NORMALIZE", 0.3))
            return await provider.generate(prompt, temperature=temperature, max_tokens=2048)

        # Prepare prompt kwargs
        prompt_kwargs = {
            "topic": request.topic,
        }

        # Configure retry
        config = RetryConfig(include_errors_in_prompt=True)

        # Call LLM with retry
        result = await retry_llm_with_validation(
            generate_fn=generate_fn,
            prompt_template=prompt_with_policies,
            prompt_kwargs=prompt_kwargs,
            model_class=RawNormalizeOutput,
            config=config,
        )

        if not result.success or result.value is None:
            logger.error(
                "Normalization failed after %d attempts. Errors: %s",
                result.total_attempts,
                result.final_errors,
            )
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "VALIDATION_FAILED",
                    "message": "Failed to generate valid normalization after retries",
                    "validation_errors": result.final_errors,
                    "attempts": result.total_attempts,
                    "request_id": str(request.request_id),
                },
            )

        # Compute hashes
        raw_output_hash = compute_sha256(result.raw_output)
        artifact_hash = compute_sha256(result.value.model_dump_json())

        # Create metadata
        metadata = ArtifactMetadata(
            request_id=request.request_id,
            prompt_version=prompt_version,
            provider=provider.provider_name,
            model=provider.model_name,
            created_at=datetime.now(timezone.utc),
            raw_output_hash=raw_output_hash,
            artifact_hash=artifact_hash,
            validation_retry_count=result.retry_count,
        )

        logger.info(
            "Topic normalized. request_id=%s topic=%s normalized=%s domain=%s policy=%s retries=%d",
            request.request_id,
            request.topic,
            result.value.topic_normalized,
            result.value.domain_category,
            result.value.staleness_policy,
            result.retry_count,
        )

        return NormalizeTopicResponse(
            topic_normalized=result.value.topic_normalized,
            domain_category=result.value.domain_category,
            staleness_policy=result.value.staleness_policy,
            metadata=metadata,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Unexpected error in topic normalization. request_id=%s topic=%s error=%s",
            request.request_id,
            request.topic,
            str(e),
        )
        raise HTTPException(
            status_code=500,
            detail={
                "error": "INTERNAL_ERROR",
                "message": "An unexpected error occurred",
                "details": {},
                "request_id": str(request.request_id),
                "timestamp": datetime.now(timezone.utc)
                .isoformat()
                .replace("+00:00", "Z"),
            },
        )
