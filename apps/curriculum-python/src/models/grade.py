"""Grade model for exercise grading results."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from .metadata import ArtifactMetadata


class Grade(BaseModel):
    """Result of grading a user's answer to an exercise."""

    schema_version: Literal["grade.v1"] = "grade.v1"
    plan_id: UUID
    node_id: str = Field(..., description="Reference to node within plan")
    exercise_id: str = Field(..., description="Reference to the graded exercise")
    score: float = Field(..., ge=0.0, le=1.0, description="Score from 0.0 to 1.0")
    is_correct: bool = Field(..., description="Whether the answer is considered correct")
    feedback: str = Field(
        ..., min_length=20, max_length=300, description="Feedback for the learner"
    )
    misconceptions: list[str] | None = Field(
        default=None, description="Identified misconceptions (if any)"
    )
    metadata: ArtifactMetadata

    @model_validator(mode="after")
    def validate_score_correctness_consistency(self) -> "Grade":
        """Ensure is_correct is consistent with score thresholds."""
        if self.score >= 0.7 and not self.is_correct:
            raise ValueError(
                f"Score {self.score} >= 0.7 requires is_correct=True"
            )
        if self.score < 0.5 and self.is_correct:
            raise ValueError(
                f"Score {self.score} < 0.5 requires is_correct=False"
            )
        return self
