#!/usr/bin/env python3
"""Grade evaluator for Lucubrum eval harness."""

import uuid
from datetime import datetime
from typing import Any, TypedDict

from base import BaseEvaluator, logger


class GradeCaseResult(TypedDict, total=False):
    """TypedDict for a single grade test case result."""

    exercise_type: str
    expected_is_correct: bool
    expected_score_min: float
    actual_is_correct: bool | None
    actual_score: float | None
    feedback_present: bool
    schema_valid: bool
    error: str | None


class GradeEvalResult(TypedDict, total=False):
    """TypedDict for grade evaluation results."""

    item_id: str
    topic: str
    schema_valid: bool
    test_results: list[GradeCaseResult]
    is_correct_matches: int
    score_within_tolerance: int
    feedback_present: int
    error: str | None
    duration_ms: int


class GradeEvaluator(BaseEvaluator):
    """Evaluator for the grading prompt."""

    @property
    def prompt_name(self) -> str:
        return "grade"

    def _init_metrics(self) -> dict[str, Any]:
        return {
            "total_items": 0,
            "successful": 0,
            "failed": 0,
            "schema_valid": 0,
            "is_correct_matches": 0,
            "score_within_tolerance": 0,
            "feedback_present": 0,
            "total_test_cases": 0,  # Tracks across all topics
            "errors": [],
        }

    async def run_single_eval(
        self, item: dict, index: int, total: int
    ) -> GradeEvalResult:
        """Grade test cases for a topic and collect metrics."""
        grade_cases = item.get("grade_test_cases", [])
        if not grade_cases:
            return {
                "item_id": item["id"],
                "error": "No grade_test_cases in golden data",
                "schema_valid": False,
                "test_results": [],
            }

        topic_name = item["topic"][:40]
        logger.info(
            "eval_item_started",
            evaluator=self.prompt_name,
            index=index,
            total=total,
            topic=topic_name,
            item_id=item["id"],
            case_count=len(grade_cases),
        )

        eval_metrics: GradeEvalResult = {
            "item_id": item["id"],
            "topic": item["topic"],
            "schema_valid": True,  # Tracks if ALL cases passed schema
            "test_results": [],
            "is_correct_matches": 0,
            "score_within_tolerance": 0,
            "feedback_present": 0,
            "error": None,
            "duration_ms": 0,
        }

        total_duration = 0

        # Process all cases using the shared client (no per-case client creation)
        for case in grade_cases:
            request_id = str(uuid.uuid4())
            request_body = {
                "exercise_type": case["exercise_type"],
                "prompt": case["prompt"],
                "rubric": case["rubric"],
                "correct_answer": case["correct_answer"],
                "user_answer": case["user_answer"],
                "user_level": item["user_level"],
                "request_id": request_id,
            }

            case_result: GradeCaseResult = {
                "exercise_type": case["exercise_type"],
                "expected_is_correct": case["expected_is_correct"],
                "expected_score_min": case["expected_score_min"],
                "actual_is_correct": None,
                "actual_score": None,
                "feedback_present": False,
                "schema_valid": False,
                "error": None,
            }

            start_time = datetime.now()
            status_code, response_json, error = await self.make_request(
                "/llm/grade", request_body
            )
            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            total_duration += duration_ms

            if status_code == 200 and response_json:
                grade = response_json.get("grade", {})
                case_result["schema_valid"] = True
                case_result["actual_is_correct"] = grade.get("is_correct")
                case_result["actual_score"] = grade.get("score")
                case_result["feedback_present"] = bool(grade.get("feedback"))

                # Check is_correct matches expectation
                if case_result["actual_is_correct"] == case["expected_is_correct"]:
                    eval_metrics["is_correct_matches"] += 1

                # Check score within tolerance
                actual_score = case_result["actual_score"] or 0
                if actual_score >= case["expected_score_min"]:
                    eval_metrics["score_within_tolerance"] += 1

                # Check feedback present
                if case_result["feedback_present"]:
                    eval_metrics["feedback_present"] += 1
            elif status_code == 422:
                # Preserve the actual error details from 422 responses
                case_result["error"] = f"Validation failed: {error}"
                eval_metrics["schema_valid"] = False
            else:
                case_result["error"] = error or "Non-200 response"
                eval_metrics["schema_valid"] = False

            eval_metrics["test_results"].append(case_result)

        eval_metrics["duration_ms"] = total_duration

        # Count successes
        all_cases_valid = all(r["schema_valid"] for r in eval_metrics["test_results"])
        status = "OK" if all_cases_valid else "FAIL"
        logger.info(
            "eval_item_completed",
            evaluator=self.prompt_name,
            index=index,
            total=total,
            topic=topic_name,
            item_id=item["id"],
            status=status,
            duration_ms=total_duration,
            cases_valid=sum(1 for r in eval_metrics["test_results"] if r["schema_valid"]),
            cases_total=len(eval_metrics["test_results"]),
        )

        return eval_metrics

    def aggregate_metrics(self, all_results: list[dict[str, Any]]) -> None:
        """Aggregate results into summary metrics."""
        for result in all_results:
            if result.get("schema_valid"):
                self.metrics["successful"] += 1
            else:
                self.metrics["failed"] += 1

            # Aggregate across all test cases
            test_results = result.get("test_results", [])
            for case in test_results:
                self.metrics["total_test_cases"] += 1
                if case.get("schema_valid"):
                    self.metrics["schema_valid"] += 1

            self.metrics["is_correct_matches"] += result.get("is_correct_matches", 0)
            self.metrics["score_within_tolerance"] += result.get("score_within_tolerance", 0)
            self.metrics["feedback_present"] += result.get("feedback_present", 0)

            if result.get("error"):
                self.metrics["errors"].append({
                    "item_id": result["item_id"],
                    "error": result["error"],
                })

        # Calculate rates based on total test cases
        total_cases = self.metrics["total_test_cases"]
        if total_cases > 0:
            self.metrics["schema_valid_rate"] = self.metrics["schema_valid"] / total_cases
            self.metrics["is_correct_agreement_rate"] = (
                self.metrics["is_correct_matches"] / total_cases
            )
            self.metrics["score_accuracy_rate"] = (
                self.metrics["score_within_tolerance"] / total_cases
            )
            self.metrics["feedback_present_rate"] = (
                self.metrics["feedback_present"] / total_cases
            )

    def get_exit_criteria(self) -> dict[str, tuple[str, float, str]]:
        return {
            "schema_valid_rate": (">=", 0.95, "Schema validity >= 95%"),
            "is_correct_agreement_rate": (">=", 0.90, "is_correct agreement >= 90%"),
            "feedback_present_rate": ("==", 1.0, "Feedback present == 100%"),
        }

    def print_custom_summary(self, metrics: dict[str, Any]) -> None:
        total_cases = metrics["total_test_cases"]
        print(f"\nGrading ({total_cases} test cases):")
        print(
            f"  Schema valid:       {metrics['schema_valid']}/{total_cases} "
            f"({metrics.get('schema_valid_rate', 0):.1%})"
        )
        print(
            f"  is_correct match:   {metrics['is_correct_matches']}/{total_cases} "
            f"({metrics.get('is_correct_agreement_rate', 0):.1%})"
        )
        print(
            f"  Score accuracy:     {metrics['score_within_tolerance']}/{total_cases} "
            f"({metrics.get('score_accuracy_rate', 0):.1%})"
        )
        print(
            f"  Feedback present:   {metrics['feedback_present']}/{total_cases} "
            f"({metrics.get('feedback_present_rate', 0):.1%})"
        )
