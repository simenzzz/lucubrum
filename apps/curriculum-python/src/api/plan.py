"""Plan generation API endpoint."""

import logging
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..models.metadata import ArtifactMetadata
from ..models.plan import Node, Plan, PlanSize, ScheduleItem
from ..providers import get_provider
from ..utils.hashing import compute_sha256
from ..utils.prompts import load_prompt
from ..utils.retry import RetryConfig, retry_llm_with_validation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/llm", tags=["plan"])


class GeneratePlanRequest(BaseModel):
    """Request body for plan generation."""

    topic: str = Field(..., min_length=3, max_length=100, description="Learning topic")
    user_level: Literal["beginner", "intermediate", "advanced"] = Field(
        ..., description="User's current level"
    )
    plan_size: PlanSize = Field(
        default=PlanSize.MODERATE, description="Desired plan size"
    )
    request_id: UUID = Field(..., description="Request ID for tracing")


class GeneratePlanResponse(BaseModel):
    """Response body for plan generation."""

    plan: Plan


class RawPlanOutput(BaseModel):
    """Model for validating raw LLM output (without metadata).

    This model validates the structure the LLM is expected to produce,
    before we add our own metadata.
    """

    topic: str = Field(..., min_length=3, max_length=500)
    user_level: Literal["beginner", "intermediate", "advanced"]
    plan_size: PlanSize = Field(default=PlanSize.MODERATE)
    nodes: list[Node]
    schedule: list[ScheduleItem]


@router.post("/plan", response_model=GeneratePlanResponse)
async def generate_plan(request: GeneratePlanRequest) -> GeneratePlanResponse:
    """Generate a learning plan for the given topic.

    Uses LLM to generate a structured learning plan with nodes and schedule.
    Includes retry logic for validation failures.

    Args:
        request: Request containing topic, user_level, plan_size, and request_id.

    Returns:
        GeneratePlanResponse containing the validated Plan with metadata.

    Raises:
        HTTPException(422): If validation fails after all retries.
        HTTPException(500): On unexpected errors.
    """
    prompt_version = "plan/v1"

    try:
        # Load prompt template
        prompt_template = load_prompt("plan", "v1")

        # Get LLM provider
        provider = get_provider()

        # Define generation function
        async def generate_fn(prompt: str) -> str:
            return await provider.generate(prompt, temperature=0.7, max_tokens=8192)

        # Prepare prompt kwargs
        prompt_kwargs = {
            "topic": request.topic,
            "user_level": request.user_level,
            "plan_size": request.plan_size.value,
        }

        # Configure retry
        config = RetryConfig(max_retries=2, include_errors_in_prompt=True)

        # Call LLM with retry
        result = await retry_llm_with_validation(
            generate_fn=generate_fn,
            prompt_template=prompt_template,
            prompt_kwargs=prompt_kwargs,
            model_class=RawPlanOutput,
            config=config,
        )

        if not result.success or result.value is None:
            logger.error(
                f"Plan generation failed after {result.total_attempts} attempts. "
                f"Errors: {result.final_errors}"
            )
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "VALIDATION_FAILED",
                    "message": "Failed to generate valid plan after retries",
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

        # Construct full Plan with metadata
        plan = Plan(
            schema_version="plan.v1",
            topic=result.value.topic,
            user_level=result.value.user_level,
            plan_size=result.value.plan_size,
            nodes=result.value.nodes,
            schedule=result.value.schedule,
            metadata=metadata,
        )

        logger.info(
            f"Plan generated successfully. "
            f"Topic: {request.topic}, "
            f"Nodes: {len(plan.nodes)}, "
            f"Retries: {result.retry_count}"
        )

        return GeneratePlanResponse(plan=plan)

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
        logger.exception(f"Unexpected error in plan generation: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "INTERNAL_ERROR",
                "message": f"Unexpected error generating plan: {str(e)}",
                "request_id": str(request.request_id),
            },
        )
