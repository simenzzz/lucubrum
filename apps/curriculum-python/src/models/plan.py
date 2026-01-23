"""Learning plan models including Node, ScheduleItem, and Plan."""

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from .metadata import ArtifactMetadata


class PlanSize(str, Enum):
    """Plan size options that determine the number of nodes."""

    BASIC = "basic"
    MODERATE = "moderate"
    LARGE = "large"
    DYNAMIC = "dynamic"


# Node count ranges for each plan size
PLAN_SIZE_RANGES: dict[PlanSize, tuple[int, int]] = {
    PlanSize.BASIC: (4, 12),
    PlanSize.MODERATE: (12, 20),
    PlanSize.LARGE: (20, 30),
    PlanSize.DYNAMIC: (4, 30),
}


class Node(BaseModel):
    """A single learning node in the curriculum DAG."""

    node_id: str = Field(
        ...,
        pattern=r"^[a-z0-9_]{3,100}$",
        description="Unique identifier within plan (snake_case)",
    )
    title: str = Field(..., min_length=5, max_length=200)
    objectives: list[str] = Field(
        ..., min_length=1, max_length=5, description="Learning objectives (1-5 items)"
    )
    prerequisites: list[str] = Field(
        default_factory=list, description="List of prerequisite node_ids"
    )
    estimated_minutes: int = Field(..., ge=5, le=240)
    tags: list[str] | None = None

    @field_validator("objectives")
    @classmethod
    def validate_objectives_not_empty(cls, v: list[str]) -> list[str]:
        """Ensure all objectives are non-empty strings."""
        for i, obj in enumerate(v):
            if not obj or not obj.strip():
                raise ValueError(f"Objective at index {i} cannot be empty")
        return v

    @model_validator(mode="after")
    def validate_no_self_prerequisite(self) -> "Node":
        """Ensure a node doesn't list itself as a prerequisite."""
        if self.node_id in self.prerequisites:
            raise ValueError(f"Node '{self.node_id}' cannot be its own prerequisite")
        return self


class ScheduleItem(BaseModel):
    """A single item in the learning schedule (ordered sequence)."""

    order: int = Field(..., ge=1, description="Sequential order starting from 1")
    node_id: str = Field(..., description="Reference to a node in the plan")


class Plan(BaseModel):
    """A complete learning plan with nodes and schedule."""

    schema_version: Literal["plan.v1"] = "plan.v1"
    topic: str = Field(..., min_length=3, max_length=500)
    user_level: Literal["beginner", "intermediate", "advanced"]
    plan_size: PlanSize = Field(
        default=PlanSize.MODERATE,
        description="Plan scope: basic (4-12), moderate (12-20), large (20-30), dynamic (4-30)",
    )
    nodes: list[Node] = Field(..., description="Learning nodes")
    schedule: list[ScheduleItem] = Field(..., description="Ordered learning schedule")
    metadata: ArtifactMetadata

    @model_validator(mode="after")
    def validate_node_count_for_size(self) -> "Plan":
        """Validate node count matches plan_size constraints."""
        min_nodes, max_nodes = PLAN_SIZE_RANGES[self.plan_size]
        if not (min_nodes <= len(self.nodes) <= max_nodes):
            raise ValueError(
                f"Plan size '{self.plan_size.value}' requires {min_nodes}-{max_nodes} nodes, "
                f"got {len(self.nodes)}"
            )
        return self

    @model_validator(mode="after")
    def validate_plan_integrity(self) -> "Plan":
        """Validate plan-wide constraints."""
        node_ids = {node.node_id for node in self.nodes}

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

        # Check schedule order is sequential from 1
        orders = sorted(item.order for item in self.schedule)
        expected = list(range(1, len(self.schedule) + 1))
        if orders != expected:
            raise ValueError(f"Schedule order must be sequential from 1, got: {orders}")

        # Check all prerequisites reference existing nodes
        for node in self.nodes:
            for prereq in node.prerequisites:
                if prereq not in node_ids:
                    raise ValueError(
                        f"Node '{node.node_id}' has unknown prerequisite '{prereq}'"
                    )

        return self
