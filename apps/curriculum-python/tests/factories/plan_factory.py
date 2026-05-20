"""Test data factories for Python tests."""
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional


def create_test_plan(overrides: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Create a test plan object."""
    defaults = {
        "plan_id": str(uuid.uuid4()),
        "topic": "Test Topic",
        "normalized_topic": "test topic",
        "domain_category": "cs",
        "staleness_policy": "annual",
        "user_level": "beginner",
        "schedule": [],
        "request_id": str(uuid.uuid4()),
        "prompt_version": "1.0",
        "provider": "gemini",
        "model": "gemini-2.5-flash",
        "generated_at": datetime.utcnow().isoformat(),
    }
    return {**defaults, **(overrides or {})}


def create_test_node(plan_id: str, overrides: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Create a test node object."""
    defaults = {
        "node_id": f"node-{uuid.uuid4().hex[:8]}",
        "title": "Test Node",
        "description": "Test description",
        "prerequisites": [],
        "estimated_minutes": 30,
        "order": 0,
    }
    return {**defaults, **(overrides or {})}


def create_test_exercise(overrides: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Create a test MCQ exercise."""
    defaults = {
        "exercise_id": str(uuid.uuid4()),
        "node_id": f"node-{uuid.uuid4().hex[:8]}",
        "type": "mcq",
        "question": "What is 2 + 2?",
        "options": ["3", "4", "5", "6"],
        "correct_answer": "4",
        "explanation": "2 + 2 equals 4",
        "difficulty": 1,
    }
    return {**defaults, **(overrides or {})}


def create_test_grade(overrides: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Create a test grade response."""
    defaults = {
        "is_correct": True,
        "score": 1.0,
        "feedback": "Correct! Well done.",
        "misconceptions": [],
        "request_id": str(uuid.uuid4()),
        "prompt_version": "1.0",
        "provider": "gemini",
        "model": "gemini-2.5-flash",
        "graded_at": datetime.utcnow().isoformat(),
    }
    return {**defaults, **(overrides or {})}


def create_test_normalize_response(overrides: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Create a test normalize topic response."""
    defaults = {
        "topic_normalized": "react js",
        "domain_category": "web",
        "staleness_policy": "14d",
        "confidence": 0.95,
        "request_id": str(uuid.uuid4()),
        "prompt_version": "1.0",
        "provider": "gemini",
        "model": "gemini-2.5-flash",
        "normalized_at": datetime.utcnow().isoformat(),
    }
    return {**defaults, **(overrides or {})}


def create_test_facts(overrides: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Create a test facts response."""
    defaults = {
        "facts": [
            {"fact": "React 19 was released in 2024", "source": "context7"},
            {"fact": "React Server Components are now stable", "source": "brave_search"},
        ],
        "request_id": str(uuid.uuid4()),
        "gathered_at": datetime.utcnow().isoformat(),
    }
    return {**defaults, **(overrides or {})}


def create_plan_with_cycle() -> Dict[str, Any]:
    """Create a plan with a cycle for testing DAG validation."""
    return create_test_plan({
        "schedule": [
            create_test_node("node-a", {
                "node_id": "node-a",
                "prerequisites": ["node-b"],
            }),
            create_test_node("node-b", {
                "node_id": "node-b",
                "prerequisites": ["node-a"],  # Cycle!
            }),
        ],
    })


def create_plan_with_self_reference() -> Dict[str, Any]:
    """Create a plan with self-reference for testing DAG validation."""
    return create_test_plan({
        "schedule": [
            create_test_node("node-self", {
                "node_id": "node-self",
                "prerequisites": ["node-self"],  # Self-reference!
            }),
        ],
    })
