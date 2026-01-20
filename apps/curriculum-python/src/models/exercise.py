"""Exercise models with discriminated union by type."""

from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from .metadata import ArtifactMetadata


class ExerciseBase(BaseModel):
    """Base fields shared by all exercise types."""

    id: str = Field(..., description="Unique exercise ID within the set")
    prompt: str = Field(..., min_length=10, description="The exercise question/prompt")
    rubric: str = Field(..., min_length=20, max_length=500, description="Grading rubric")
    difficulty: int = Field(..., ge=1, le=5, description="Difficulty level (1-5)")


class MCQExercise(ExerciseBase):
    """Multiple choice question with exactly 4 choices."""

    type: Literal["mcq"] = "mcq"
    choices: list[str] = Field(..., min_length=4, max_length=4, description="Exactly 4 choices")
    correct_answer: str = Field(..., description="Must match one of the choices")

    @model_validator(mode="after")
    def validate_correct_answer_in_choices(self) -> "MCQExercise":
        """Ensure correct_answer matches one of the choices."""
        if self.correct_answer not in self.choices:
            raise ValueError(
                f"correct_answer '{self.correct_answer}' must be one of the choices"
            )
        return self


class ShortAnswerExercise(ExerciseBase):
    """Short answer exercise with a string answer."""

    type: Literal["short_answer"] = "short_answer"
    correct_answer: str = Field(..., description="Expected answer")


class FillBlankAnswer(BaseModel):
    """Answer specification for fill-in-the-blank exercises."""

    answers: list[str] = Field(
        ..., min_length=1, max_length=10, description="Acceptable answers (1-10)"
    )
    match: Literal["case_sensitive", "case_insensitive"] = "case_insensitive"
    normalize_whitespace: bool = True


class FillBlankExercise(ExerciseBase):
    """Fill-in-the-blank exercise with structured answer matching."""

    type: Literal["fill_blank"] = "fill_blank"
    correct_answer: FillBlankAnswer


class CodingTestCase(BaseModel):
    """A single test case for coding exercises."""

    input: Any = Field(..., description="Test input value(s)")
    output: Any = Field(..., description="Expected output")


class CodingAnswer(BaseModel):
    """Answer specification for coding exercises."""

    language: str = Field(..., description="Programming language")
    solution: str = Field(..., description="Reference solution code")
    test_cases: list[CodingTestCase] = Field(
        ..., min_length=1, max_length=20, description="Test cases (1-20)"
    )


class CodingExercise(ExerciseBase):
    """Coding exercise with solution and test cases."""

    type: Literal["coding"] = "coding"
    correct_answer: CodingAnswer


class FlashcardExercise(ExerciseBase):
    """Flashcard exercise for memorization."""

    type: Literal["flashcard"] = "flashcard"
    correct_answer: str = Field(..., description="Expected recall answer")


# Discriminated union of all exercise types
Exercise = Annotated[
    MCQExercise | ShortAnswerExercise | FillBlankExercise | CodingExercise | FlashcardExercise,
    Field(discriminator="type"),
]


class ExerciseSet(BaseModel):
    """A set of exercises for a specific learning node."""

    schema_version: Literal["exercise_set.v1"] = "exercise_set.v1"
    plan_id: UUID
    node_id: str = Field(..., description="Reference to node within plan")
    user_level: Literal["beginner", "intermediate", "advanced"]
    exercises: list[Exercise] = Field(..., min_length=1, description="At least 1 exercise")
    metadata: ArtifactMetadata

    @model_validator(mode="after")
    def validate_unique_exercise_ids(self) -> "ExerciseSet":
        """Ensure all exercise IDs are unique within the set."""
        ids = [ex.id for ex in self.exercises]
        if len(ids) != len(set(ids)):
            duplicates = [id for id in ids if ids.count(id) > 1]
            raise ValueError(f"Duplicate exercise IDs found: {set(duplicates)}")
        return self
