# Pydantic Model & Endpoint Patterns

Detailed patterns for the curriculum-python service with real examples.

---

## Pydantic Model Patterns

### Base Model with Schema Version

Every top-level output model follows this pattern:

```python
from typing import Literal
from pydantic import BaseModel, Field
from .metadata import ArtifactMetadata

class Plan(BaseModel):
    """A complete learning plan with nodes and schedule."""
    
    schema_version: Literal["plan.v1"] = "plan.v1"
    topic: str = Field(..., min_length=3, max_length=500)
    user_level: Literal["beginner", "intermediate", "advanced"]
    nodes: list[Node] = Field(..., min_length=4, max_length=30)
    schedule: list[ScheduleItem]
    metadata: ArtifactMetadata
```

### Discriminated Union for Exercise Types

Use `Annotated` with `Field(discriminator=...)` for polymorphic types:

```python
from typing import Annotated, Literal
from pydantic import BaseModel, Field

class ExerciseBase(BaseModel):
    """Shared fields for all exercise types."""
    id: str
    prompt: str = Field(..., min_length=10)
    rubric: str = Field(..., min_length=20, max_length=500)
    difficulty: int = Field(..., ge=1, le=5)

class MCQExercise(ExerciseBase):
    type: Literal["mcq"] = "mcq"
    choices: list[str] = Field(..., min_length=4, max_length=4)
    correct_answer: str

class ShortAnswerExercise(ExerciseBase):
    type: Literal["short_answer"] = "short_answer"
    correct_answer: str

# Discriminated union
Exercise = Annotated[
    MCQExercise | ShortAnswerExercise,
    Field(discriminator="type"),
]
```

### Field Validators

Use for single-field validation:

```python
from pydantic import field_validator

class Node(BaseModel):
    node_id: str = Field(..., pattern=r"^[a-z0-9_]{3,100}$")
    objectives: list[str] = Field(..., min_length=1, max_length=5)
    
    @field_validator("objectives")
    @classmethod
    def validate_objectives_not_empty(cls, v: list[str]) -> list[str]:
        """Ensure all objectives are non-empty strings."""
        for i, obj in enumerate(v):
            if not obj or not obj.strip():
                raise ValueError(f"Objective at index {i} cannot be empty")
        return v
```

### Model Validators

Use for cross-field or whole-model validation:

```python
from pydantic import model_validator

class MCQExercise(ExerciseBase):
    type: Literal["mcq"] = "mcq"
    choices: list[str]
    correct_answer: str
    
    @model_validator(mode="after")
    def validate_correct_answer_in_choices(self) -> "MCQExercise":
        """Ensure correct_answer matches one of the choices."""
        if self.correct_answer not in self.choices:
            raise ValueError(
                f"correct_answer '{self.correct_answer}' must be one of the choices"
            )
        return self
```

### Plan Integrity Validator

Complex validation across nested structures:

```python
class Plan(BaseModel):
    nodes: list[Node]
    schedule: list[ScheduleItem]
    
    @model_validator(mode="after")
    def validate_plan_integrity(self) -> "Plan":
        """Validate plan-wide constraints."""
        node_ids = {node.node_id for node in self.nodes}
        
        # Check schedule covers all nodes exactly once
        schedule_node_ids = [item.node_id for item in self.schedule]
        if set(schedule_node_ids) != node_ids:
            missing = node_ids - set(schedule_node_ids)
            raise ValueError(f"Nodes not in schedule: {missing}")
        
        # Check prerequisites reference existing nodes
        for node in self.nodes:
            for prereq in node.prerequisites:
                if prereq not in node_ids:
                    raise ValueError(
                        f"Node '{node.node_id}' has unknown prerequisite '{prereq}'"
                    )
        
        return self
```

---

## FastAPI Endpoint Patterns

### Basic Endpoint with Request/Response Models

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from uuid import UUID

router = APIRouter()

class PlanRequest(BaseModel):
    topic: str
    user_level: str
    constraints: dict | None = None

class PlanResponse(BaseModel):
    plan: Plan

@router.post("/llm/plan", response_model=PlanResponse)
async def generate_plan(request: PlanRequest) -> PlanResponse:
    # Generate plan via LLM
    plan = await llm_service.generate_plan(
        topic=request.topic,
        user_level=request.user_level,
    )
    return PlanResponse(plan=plan)
```

### Error Handling with Structured Responses

```python
from fastapi import HTTPException
from pydantic import ValidationError

@router.post("/llm/exercises")
async def generate_exercises(request: ExerciseRequest):
    try:
        exercises = await llm_service.generate_exercises(...)
        # Validate with Pydantic
        validated = ExerciseSet.model_validate(exercises)
        return {"exercise_set": validated}
    except ValidationError as e:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "VALIDATION_FAILED",
                "message": "LLM output failed schema validation",
                "validation_errors": e.errors(),
                "request_id": request.request_id,
            }
        )
```

### Request ID Propagation

Always echo back request metadata:

```python
@router.post("/llm/grade")
async def grade_answer(request: GradeRequest) -> GradeResponse:
    grade = await llm_service.grade(...)
    
    return GradeResponse(
        grade=grade,
        metadata=ArtifactMetadata(
            provider=settings.llm_provider,
            model=settings.llm_model,
            prompt_version="grade/v1",
            request_id=request.request_id,  # Echo back
            # ... other fields
        )
    )
```

---

## Validation Testing Patterns

### Testing Valid Input

```python
import pytest
from src.models.plan import Plan, Node, ScheduleItem

def test_valid_plan():
    plan = Plan(
        schema_version="plan.v1",
        topic="Binary Search Trees",
        user_level="intermediate",
        nodes=[
            Node(
                node_id="intro",
                title="Introduction",
                objectives=["Understand basics"],
                prerequisites=[],
                estimated_minutes=30,
            ),
            # ... more nodes
        ],
        schedule=[ScheduleItem(order=1, node_id="intro")],
        metadata=valid_metadata,
    )
    assert plan.topic == "Binary Search Trees"
```

### Testing Validation Errors

```python
import pytest
from pydantic import ValidationError

def test_mcq_correct_answer_not_in_choices():
    with pytest.raises(ValidationError) as exc_info:
        MCQExercise(
            id="ex1",
            prompt="What is 2+2?",
            rubric="Test rubric text here",
            difficulty=1,
            choices=["A", "B", "C", "D"],
            correct_answer="E",  # Not in choices!
        )
    
    errors = exc_info.value.errors()
    assert any("correct_answer" in str(e) for e in errors)

def test_empty_objectives_rejected():
    with pytest.raises(ValidationError):
        Node(
            node_id="test_node",
            title="Test Node",
            objectives=["Valid", ""],  # Empty string!
            prerequisites=[],
            estimated_minutes=30,
        )
```
