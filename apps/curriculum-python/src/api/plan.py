"""Plan generation API endpoint."""

import logging
import os
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator

from .llm_errors import raise_llm_provider_http_exception
from ..models.metadata import ArtifactMetadata
from ..models.plan import Node, Plan, PlanSize, ScheduleItem, PLAN_SIZE_RANGES, _detect_cycle
from ..providers import get_provider
from ..utils.hashing import compute_sha256
from ..utils.prompts import load_prompt
from ..utils.retry import NonRetryableLLMError, RetryConfig, retry_llm_with_validation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/llm", tags=["plan"])

# Max tokens mapping by plan size
_PLAN_MAX_TOKENS: dict[PlanSize, int] = {
    PlanSize.BASIC: 4096,
    PlanSize.MODERATE: 8192,
    PlanSize.LARGE: 16384,
    PlanSize.DYNAMIC: 16384,
}


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

    @model_validator(mode="after")
    def validate_plan_integrity(self) -> "RawPlanOutput":
        """Validate plan-wide constraints: DAG integrity, schedule coverage, node count.

        This validator ensures the LLM receives specific error feedback for integrity
        violations during the retry loop, enabling self-correction.
        """
        node_ids = {node.node_id for node in self.nodes}

        # Check node count matches plan size
        min_nodes, max_nodes = PLAN_SIZE_RANGES[self.plan_size]
        if not (min_nodes <= len(self.nodes) <= max_nodes):
            raise ValueError(
                f"Plan size '{self.plan_size.value}' requires {min_nodes}-{max_nodes} nodes, "
                f"got {len(self.nodes)}"
            )

        # Check schedule covers all nodes exactly once
        schedule_node_ids = [item.node_id for item in self.schedule]
        schedule_set = set(schedule_node_ids)

        if len(schedule_node_ids) != len(schedule_set):
            raise ValueError("Schedule contains duplicate node_ids")

        if schedule_set != node_ids:
            missing = node_ids - schedule_set
            extra = schedule_set - node_ids
            errors = []
            if missing:
                errors.append(f"Nodes not in schedule: {missing}")
            if extra:
                errors.append(f"Schedule references unknown nodes: {extra}")
            raise ValueError("; ".join(errors))

        # Check all prerequisites reference existing nodes and build prereq map
        prereqs: dict[str, list[str]] = {}
        for node in self.nodes:
            prereqs[node.node_id] = node.prerequisites
            for prereq in node.prerequisites:
                if prereq not in node_ids:
                    raise ValueError(
                        f"Node '{node.node_id}' has unknown prerequisite '{prereq}'"
                    )

        # Check for cycles in prerequisite graph
        if _detect_cycle(node_ids, prereqs):
            raise ValueError("Prerequisite graph contains a cycle (not a valid DAG)")

        # Reorder schedule using topological sort (post-validation fixup)
        from ..models.plan import topological_sort
        sorted_node_ids = topological_sort(self.nodes)

        # Rebuild schedule with corrected order (immutable — new ScheduleItem objects)
        self.schedule = [
            ScheduleItem(order=new_order, node_id=node_id)
            for new_order, node_id in enumerate(sorted_node_ids, start=1)
        ]

        return self


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
            temperature = float(os.getenv("LLM_TEMPERATURE_PLAN", 0.7))
            max_tokens_override = os.getenv("LLM_MAX_TOKENS_PLAN")
            if max_tokens_override:
                try:
                    max_tokens = int(max_tokens_override)
                except ValueError:
                    logger.warning(f"Invalid LLM_MAX_TOKENS_PLAN value: {max_tokens_override!r}, using default")
                    max_tokens = _PLAN_MAX_TOKENS.get(request.plan_size, 8192)
            else:
                max_tokens = _PLAN_MAX_TOKENS.get(request.plan_size, 8192)

            return await provider.generate(prompt, temperature=temperature, max_tokens=max_tokens)

        # Prepare prompt kwargs
        prompt_kwargs = {
            "topic": request.topic,
            "user_level": request.user_level,
            "plan_size": request.plan_size.value,
        }

        # Configure retry
        config = RetryConfig(include_errors_in_prompt=True)

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
            provider=provider.provider_name,
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
    except NonRetryableLLMError as e:
        raise_llm_provider_http_exception(e, request.request_id, logger, "plan generation")
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
                "message": "An unexpected error occurred while generating the plan",
                "request_id": str(request.request_id),
            },
        )
