"""Pydantic models for curriculum artifacts.

All LLM-generated artifacts are validated through these models.
"""

from .metadata import ArtifactMetadata
from .plan import Node, Plan, ScheduleItem
from .exercise import (
    CodingAnswer,
    CodingExercise,
    CodingTestCase,
    Exercise,
    ExerciseBase,
    ExerciseSet,
    FillBlankAnswer,
    FillBlankExercise,
    FlashcardExercise,
    MCQExercise,
    ShortAnswerExercise,
)
from .grade import Grade
from .query_suggestions import QuerySuggestions
from .exam import ExamExerciseSet, GenerateExamRequest, RawExamOutput

__all__ = [
    # Metadata
    "ArtifactMetadata",
    # Plan
    "Node",
    "Plan",
    "ScheduleItem",
    # Exercises
    "CodingAnswer",
    "CodingExercise",
    "CodingTestCase",
    "Exercise",
    "ExerciseBase",
    "ExerciseSet",
    "FillBlankAnswer",
    "FillBlankExercise",
    "FlashcardExercise",
    "MCQExercise",
    "ShortAnswerExercise",
    # Exam
    "ExamExerciseSet",
    "GenerateExamRequest",
    "RawExamOutput",
    # Grade
    "Grade",
    # Query Suggestions
    "QuerySuggestions",
]
