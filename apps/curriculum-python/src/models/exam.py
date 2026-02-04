"""Exam models for timed assessments."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from .exercise import Exercise
from .metadata import ArtifactMetadata


class GenerateExamRequest(BaseModel):
    """Request body for exam generation."""

    plan_id: UUID = Field(..., description="Plan ID the exam belongs to")
    node_id: str = Field(
        ..., pattern=r"^[a-z0-9_]{3,100}$", description="Node ID within the plan"
    )
    topic: str = Field(..., min_length=3, max_length=500, description="Learning topic")
    node_title: str = Field(
        ..., min_length=3, max_length=200, description="Title of the learning node"
    )
    objectives: list[str] = Field(
        ..., min_length=1, max_length=5, description="Learning objectives for this node"
    )
    user_level: Literal["beginner", "intermediate", "advanced"] = Field(
        ..., description="User's current level"
    )
    current_mastery: float = Field(
        ..., ge=0.0, le=1.0, description="User's current mastery level for this node"
    )
    exercise_count: int = Field(
        default=10, ge=5, le=20, description="Number of exercises to generate"
    )
    request_id: UUID = Field(..., description="Request ID for tracing")


class RawExamOutput(BaseModel):
    """Model for validating raw LLM output for exams.

    This model validates the structure the LLM is expected to produce,
    before we add our own metadata.
    """

    exercises: list[Exercise] = Field(..., min_length=5, max_length=20)
    exam_difficulty: float = Field(
        ..., ge=0.0, le=1.0, description="LLM-assessed aggregate difficulty of the exam"
    )


class ExamExerciseSet(BaseModel):
    """Exam exercise set with LLM-assessed difficulty."""

    schema_version: Literal["exam_exercise_set.v1"] = "exam_exercise_set.v1"
    plan_id: UUID
    node_id: str = Field(..., pattern=r"^[a-z0-9_]{3,100}$")
    user_level: Literal["beginner", "intermediate", "advanced"]
    exercises: list[Exercise] = Field(..., min_length=5, max_length=20)
    exam_difficulty: float = Field(
        ..., ge=0.0, le=1.0, description="LLM-assessed aggregate difficulty of the exam"
    )
    metadata: ArtifactMetadata

    @field_validator("exercises")
    @classmethod
    def validate_exercise_ids_unique(cls, v: list[Exercise]) -> list[Exercise]:
        """Ensure all exercise IDs are unique within the set."""
        ids = [ex.id for ex in v]
        if len(ids) != len(set(ids)):
            duplicates = [id for id in ids if ids.count(id) > 1]
            raise ValueError(f"Duplicate exercise IDs found: {set(duplicates)}")
        return v
