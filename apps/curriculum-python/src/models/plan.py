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


def _detect_cycle(node_ids: set[str], prereqs: dict[str, list[str]]) -> bool:
    """
    Detect if the prerequisite graph contains a cycle using DFS with coloring.

    Args:
        node_ids: Set of all node IDs in the plan.
        prereqs: Mapping of node_id -> list of prerequisite node_ids.

    Returns:
        True if a cycle is detected, False otherwise.
    """
    WHITE, GRAY, BLACK = 0, 1, 2
    color: dict[str, int] = {node_id: WHITE for node_id in node_ids}

    def has_cycle(node_id: str) -> bool:
        color[node_id] = GRAY
        for prereq in prereqs.get(node_id, []):
            if color[prereq] == GRAY:
                return True  # Back edge = cycle
            if color[prereq] == WHITE and has_cycle(prereq):
                return True
        color[node_id] = BLACK
        return False

    for node_id in node_ids:
        if color[node_id] == WHITE:
            if has_cycle(node_id):
                return True

    return False


def topological_sort(nodes: list[Node]) -> list[str]:
    """Return node_ids in topological order using Kahn's algorithm.

    When multiple nodes have zero in-degree, the original LLM order is used
    as a tiebreaker to preserve pedagogical intent where constraints allow.

    Args:
        nodes: List of Node objects with node_id and prerequisites.

    Returns:
        List of node_ids in valid topological order (prerequisites before dependents).
    """
    import heapq

    # Map each node_id to its original position (used as tiebreaker)
    node_id_to_idx: dict[str, int] = {node.node_id: i for i, node in enumerate(nodes)}
    in_degree: dict[str, int] = {node.node_id: 0 for node in nodes}
    adj_list: dict[str, list[str]] = {node.node_id: [] for node in nodes}

    for node in nodes:
        for prereq in node.prerequisites:
            if prereq in adj_list:
                adj_list[prereq].append(node.node_id)
                in_degree[node.node_id] += 1

    # Min-heap keyed by original index — preserves LLM order as tiebreaker
    heap: list[tuple[int, str]] = [
        (node_id_to_idx[nid], nid)
        for nid, deg in in_degree.items()
        if deg == 0
    ]
    heapq.heapify(heap)

    result: list[str] = []

    while heap:
        _, node_id = heapq.heappop(heap)
        result.append(node_id)

        for neighbor in adj_list[node_id]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                heapq.heappush(heap, (node_id_to_idx[neighbor], neighbor))

    # Defensive assertion: fail fast if called with cyclic graph
    assert len(result) == len(nodes), f"topological_sort received a cyclic graph: processed {len(result)}/{len(nodes)} nodes"
    return result


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

        return self
