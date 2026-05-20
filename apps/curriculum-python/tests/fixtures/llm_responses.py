"""LLM response fixtures for Python tests."""

import json
from typing import Any, Dict

# Valid plan response
VALID_PLAN_RESPONSE: Dict[str, Any] = {
    "plan_id": "test-plan-123",
    "topic": "JavaScript Basics",
    "normalized_topic": "javascript basics",
    "domain_category": "cs",
    "staleness_policy": "annual",
    "schedule": [
        {
            "node_id": "variables-and-types",
            "title": "Variables and Types",
            "description": "Learn about let, const, var and data types",
            "prerequisites": [],
            "estimated_minutes": 30,
            "order": 0,
        },
        {
            "node_id": "functions",
            "title": "Functions",
            "description": "Learn how to define and use functions",
            "prerequisites": ["variables-and-types"],
            "estimated_minutes": 45,
            "order": 1,
        },
    ],
    "request_id": "test-request-123",
    "prompt_version": "1.0",
    "provider": "gemini",
    "model": "gemini-2.5-flash",
}

# Plan with cycle
PLAN_WITH_CYCLE: Dict[str, Any] = {
    "plan_id": "cycle-plan-123",
    "topic": "Invalid Plan with Cycle",
    "normalized_topic": "invalid plan",
    "domain_category": "cs",
    "staleness_policy": "annual",
    "schedule": [
        {
            "node_id": "node-a",
            "title": "Node A",
            "description": "Description A",
            "prerequisites": ["node-b"],
            "estimated_minutes": 30,
            "order": 0,
        },
        {
            "node_id": "node-b",
            "title": "Node B",
            "description": "Description B",
            "prerequisites": ["node-a"],  # Cycle!
            "estimated_minutes": 30,
            "order": 1,
        },
    ],
    "request_id": "test-request-cycle",
    "prompt_version": "1.0",
    "provider": "gemini",
    "model": "gemini-2.5-flash",
}

# Valid exercises response
VALID_EXERCISES_RESPONSE: Dict[str, Any] = {
    "exercises": [
        {
            "exercise_id": "exercise-1",
            "node_id": "variables-and-types",
            "type": "mcq",
            "question": "What keyword declares a constant?",
            "options": ["var", "let", "const", "constant"],
            "correct_answer": "const",
            "explanation": "const is for constants",
            "difficulty": 1,
        },
        {
            "exercise_id": "exercise-2",
            "node_id": "variables-and-types",
            "type": "short_answer",
            "question": "What is typeof null?",
            "answer": "object",
            "explanation": "This is a known bug",
            "difficulty": 2,
        },
    ],
    "request_id": "test-exercise-request",
    "prompt_version": "1.0",
    "provider": "gemini",
    "model": "gemini-2.5-flash",
}

# Valid grade response
VALID_GRADE_RESPONSE: Dict[str, Any] = {
    "is_correct": True,
    "score": 1.0,
    "feedback": "Correct! Well done.",
    "misconceptions": [],
    "request_id": "test-grade-request",
    "prompt_version": "1.0",
    "provider": "gemini",
    "model": "gemini-2.5-flash",
}

# Valid normalize response
VALID_NORMALIZE_RESPONSE: Dict[str, Any] = {
    "topic_normalized": "react js",
    "domain_category": "web",
    "staleness_policy": "14d",
    "confidence": 0.95,
    "request_id": "test-normalize-request",
    "prompt_version": "1.0",
    "provider": "gemini",
    "model": "gemini-2.5-flash",
}

# Valid staleness response
VALID_STALENESS_RESPONSE: Dict[str, Any] = {
    "is_stale": False,
    "contradiction_rate": 0.0,
    "contradictions": [],
    "fact_count_old": 5,
    "fact_count_new": 5,
    "request_id": "test-staleness-request",
    "prompt_version": "1.0",
    "provider": "gemini",
    "model": "gemini-2.5-flash",
}

# Stale response (trigger refresh)
STALE_PLAN_RESPONSE: Dict[str, Any] = {
    "is_stale": True,
    "contradiction_rate": 0.15,
    "contradictions": [
        {
            "old_fact": "React uses class components",
            "new_fact": "React 19 recommends hooks over class components",
        }
    ],
    "fact_count_old": 5,
    "fact_count_new": 5,
    "request_id": "test-staleness-request",
    "prompt_version": "1.0",
    "provider": "gemini",
    "model": "gemini-2.5-flash",
}

# Valid query suggestions
VALID_QUERY_SUGGESTIONS: Dict[str, Any] = {
    "queries": [
        "javascript tutorial for beginners",
        "learn javascript basics",
        "javascript variables and types",
    ],
    "request_id": "test-queries-request",
    "prompt_version": "1.0",
    "provider": "gemini",
    "model": "gemini-2.5-flash",
}

# Valid video validation
VALID_VIDEO_VALIDATION: Dict[str, Any] = {
    "is_relevant": True,
    "relevance_score": 0.85,
    "covers_objectives": ["variables", "functions"],
    "quality_issues": [],
    "request_id": "test-validation-request",
    "prompt_version": "1.0",
    "provider": "gemini",
    "model": "gemini-2.5-flash",
}

# Invalid JSON (malformed)
MALFORMED_JSON = '{"plan_id": "test", "schedule": [{"node_id": "n1", "prerequisites": ["n2"]]}'

# Missing required fields
MISSING_REQUIRED_FIELDS = {
    "plan_id": "test-plan",
    # Missing schedule, topic, etc.
}

# Empty response
EMPTY_RESPONSE = {}

# Error response
ERROR_RESPONSE = {"error": "LLM provider error", "message": "Failed to generate"}


def get_raw_llm_response(response_dict: Dict[str, Any]) -> str:
    """Convert a response dict to raw JSON string."""
    return json.dumps(response_dict)
