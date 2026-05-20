#!/usr/bin/env python3
"""Exercises evaluator for Lucubrum eval harness."""

import uuid
from datetime import datetime
from typing import Any, TypedDict

from base import BaseEvaluator, logger


class ExercisesEvalResult(TypedDict, total=False):
    """TypedDict for exercises evaluation results."""

    item_id: str
    node_title: str
    request_id: str
    schema_valid: bool
    count_correct: bool
    type_match: bool
    exercise_count: int
    expected_count: int
    expected_types: list[str]
    actual_types: list[str]
    error: str | None
    duration_ms: int


class ExercisesEvaluator(BaseEvaluator):
    """Evaluator for the exercises generation prompt."""

    @property
    def prompt_name(self) -> str:
        return "exercises"

    def _init_metrics(self) -> dict[str, Any]:
        return {
            "total_items": 0,
            "successful": 0,
            "failed": 0,
            "schema_valid": 0,
            "count_correct": 0,
            "type_match": 0,
            "errors": [],
        }

    async def run_single_eval(
        self, item: dict, index: int, total: int
    ) -> ExercisesEvalResult:
        """Generate exercises for a test node and collect metrics."""
        exercise_nodes = item.get("exercise_test_nodes", [])
        if not exercise_nodes:
            return {
                "item_id": item["id"],
                "error": "No exercise_test_nodes in golden data",
                "schema_valid": False,
                "count_correct": False,
                "type_match": False,
            }

        # Use first test node for this topic
        test_node = exercise_nodes[0]
        request_id = str(uuid.uuid4())
        plan_id = str(uuid.uuid4())  # Synthetic plan ID
        node_id = f"test_node_{item['id']}"
        topic_name = test_node["node_title"][:40]

        logger.info(
            "eval_item_started",
            evaluator=self.prompt_name,
            index=index,
            total=total,
            topic=topic_name,
            item_id=item["id"],
        )

        request_body = {
            "plan_id": plan_id,
            "node_id": node_id,
            "topic": item["topic"],
            "node_title": test_node["node_title"],
            "objectives": test_node["objectives"],
            "user_level": item["user_level"],
            "difficulty_target": 3,  # Medium difficulty
            "exercise_types": test_node.get("expected_types", ["mcq", "short_answer"]),
            "count": test_node.get("expected_exercise_count", 5),
            "request_id": request_id,
        }

        eval_metrics: ExercisesEvalResult = {
            "item_id": item["id"],
            "node_title": test_node["node_title"],
            "request_id": request_id,
            "schema_valid": False,
            "count_correct": False,
            "type_match": False,
            "exercise_count": 0,
            "expected_count": test_node.get("expected_exercise_count", 5),
            "expected_types": test_node.get("expected_types", []),
            "actual_types": [],
            "error": None,
            "duration_ms": 0,
        }

        start_time = datetime.now()
        status_code, response_json, error = await self.make_request(
            "/llm/exercises", request_body
        )
        duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        eval_metrics["duration_ms"] = duration_ms

        if status_code == 200 and response_json:
            exercise_set = response_json.get("exercise_set", {})
            exercises = exercise_set.get("exercises", [])

            eval_metrics["schema_valid"] = True
            eval_metrics["exercise_count"] = len(exercises)
            eval_metrics["count_correct"] = (
                len(exercises) == eval_metrics["expected_count"]
            )

            # Check type distribution
            actual_types = list(set(ex.get("type") for ex in exercises))
            eval_metrics["actual_types"] = actual_types
            expected_types = set(eval_metrics["expected_types"])
            actual_types_set = set(actual_types)
            # Type match if at least one expected type is present
            eval_metrics["type_match"] = bool(expected_types & actual_types_set)
        elif status_code == 422:
            # Preserve the actual error details from 422 responses
            eval_metrics["error"] = f"Validation failed: {error}"
        else:
            eval_metrics["error"] = error

        status = "OK" if eval_metrics["schema_valid"] else "FAIL"
        logger.info(
            "eval_item_completed",
            evaluator=self.prompt_name,
            index=index,
            total=total,
            topic=topic_name,
            item_id=item["id"],
            status=status,
            duration_ms=duration_ms,
        )

        return eval_metrics

    def aggregate_metrics(self, all_results: list[dict[str, Any]]) -> None:
        """Aggregate results into summary metrics."""
        for result in all_results:
            if result.get("schema_valid"):
                self.metrics["successful"] += 1
                self.metrics["schema_valid"] += 1
            else:
                self.metrics["failed"] += 1

            if result.get("count_correct"):
                self.metrics["count_correct"] += 1
            if result.get("type_match"):
                self.metrics["type_match"] += 1

            if result.get("error"):
                self.metrics["errors"].append({
                    "item_id": result["item_id"],
                    "error": result["error"],
                })

        # Calculate rates
        total = self.metrics["total_items"]
        if total > 0:
            self.metrics["schema_valid_rate"] = self.metrics["schema_valid"] / total
            self.metrics["count_correct_rate"] = self.metrics["count_correct"] / total
            self.metrics["type_match_rate"] = self.metrics["type_match"] / total

    def get_exit_criteria(self) -> dict[str, tuple[str, float, str]]:
        return {
            "schema_valid_rate": (">=", 0.95, "Schema validity >= 95%"),
            "count_correct_rate": (">=", 0.90, "Exercise count correct >= 90%"),
            "type_match_rate": (">=", 0.85, "Type match >= 85%"),
        }

    def print_custom_summary(self, metrics: dict[str, Any]) -> None:
        total = metrics["total_items"]
        print(f"\nExercise Generation:")
        print(
            f"  Schema valid:     {metrics['schema_valid']}/{total} "
            f"({metrics.get('schema_valid_rate', 0):.1%})"
        )
        print(
            f"  Count correct:    {metrics['count_correct']}/{total} "
            f"({metrics.get('count_correct_rate', 0):.1%})"
        )
        print(
            f"  Type match:       {metrics['type_match']}/{total} "
            f"({metrics.get('type_match_rate', 0):.1%})"
        )
