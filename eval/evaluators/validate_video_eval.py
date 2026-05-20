#!/usr/bin/env python3
"""Validate video evaluator for Lucubrum eval harness."""

import uuid
from datetime import datetime
from typing import Any, TypedDict

from base import BaseEvaluator, logger


class ValidateVideoEvalResult(TypedDict, total=False):
    """TypedDict for video validation evaluation results."""

    item_id: str
    node_title: str
    request_id: str
    schema_valid: bool
    relevance_correct: bool
    score_above_min: bool
    expected_relevant: bool
    expected_score_min: float
    actual_relevant: bool | None
    actual_score: float | None
    rejection_reason: str | None
    error: str | None
    duration_ms: int


class ValidateVideoEvaluator(BaseEvaluator):
    """Evaluator for the video validation prompt."""

    @property
    def prompt_name(self) -> str:
        return "validate_video"

    def _init_metrics(self) -> dict[str, Any]:
        return {
            "total_items": 0,
            "successful": 0,
            "failed": 0,
            "schema_valid": 0,
            "relevance_correct": 0,
            "score_above_min": 0,
            "errors": [],
        }

    async def run_single_eval(
        self, item: dict, index: int, total: int
    ) -> ValidateVideoEvalResult:
        """Validate video relevance for a test case and collect metrics."""
        video_test = item.get("video_validation_test")
        if not video_test:
            return {
                "item_id": item["id"],
                "error": "No video_validation_test in golden data",
                "schema_valid": False,
            }

        request_id = str(uuid.uuid4())
        topic_name = video_test["node_title"][:40]

        logger.info(
            "eval_item_started",
            evaluator=self.prompt_name,
            index=index,
            total=total,
            topic=topic_name,
            item_id=item["id"],
        )

        request_body = {
            "node_title": video_test["node_title"],
            "node_objectives": video_test["node_objectives"],
            "transcript_excerpt": video_test["transcript_excerpt"],
            "request_id": request_id,
        }

        eval_metrics: ValidateVideoEvalResult = {
            "item_id": item["id"],
            "node_title": video_test["node_title"],
            "request_id": request_id,
            "schema_valid": False,
            "relevance_correct": False,
            "score_above_min": False,
            "expected_relevant": video_test["expected_relevant"],
            "expected_score_min": video_test["expected_score_min"],
            "actual_relevant": None,
            "actual_score": None,
            "rejection_reason": None,
            "error": None,
            "duration_ms": 0,
        }

        start_time = datetime.now()
        status_code, response_json, error = await self.make_request(
            "/llm/validate-video", request_body
        )
        duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        eval_metrics["duration_ms"] = duration_ms

        if status_code == 200 and response_json:
            validation = response_json.get("validation", {})
            eval_metrics["schema_valid"] = True
            eval_metrics["actual_relevant"] = validation.get("is_relevant")
            eval_metrics["actual_score"] = validation.get("relevance_score")
            eval_metrics["rejection_reason"] = validation.get("rejection_reason")

            # Check relevance verdict matches expectation
            eval_metrics["relevance_correct"] = (
                eval_metrics["actual_relevant"] == video_test["expected_relevant"]
            )

            # Check score above minimum (only for relevant videos)
            if video_test["expected_relevant"]:
                actual_score = eval_metrics["actual_score"] or 0
                eval_metrics["score_above_min"] = (
                    actual_score >= video_test["expected_score_min"]
                )
            else:
                # For non-relevant videos, we don't check score threshold
                eval_metrics["score_above_min"] = True

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

            if result.get("relevance_correct"):
                self.metrics["relevance_correct"] += 1
            if result.get("score_above_min"):
                self.metrics["score_above_min"] += 1

            if result.get("error"):
                self.metrics["errors"].append({
                    "item_id": result["item_id"],
                    "error": result["error"],
                })

        # Calculate rates
        total = self.metrics["total_items"]
        if total > 0:
            self.metrics["schema_valid_rate"] = self.metrics["schema_valid"] / total
            self.metrics["relevance_accuracy_rate"] = (
                self.metrics["relevance_correct"] / total
            )
            self.metrics["score_accuracy_rate"] = self.metrics["score_above_min"] / total

    def get_exit_criteria(self) -> dict[str, tuple[str, float, str]]:
        return {
            "schema_valid_rate": (">=", 0.95, "Schema validity >= 95%"),
            "relevance_accuracy_rate": (">=", 0.85, "Relevance accuracy >= 85%"),
        }

    def print_custom_summary(self, metrics: dict[str, Any]) -> None:
        total = metrics["total_items"]
        print(f"\nVideo Validation:")
        print(
            f"  Schema valid:       {metrics['schema_valid']}/{total} "
            f"({metrics.get('schema_valid_rate', 0):.1%})"
        )
        print(
            f"  Relevance correct:  {metrics['relevance_correct']}/{total} "
            f"({metrics.get('relevance_accuracy_rate', 0):.1%})"
        )
        print(
            f"  Score above min:    {metrics['score_above_min']}/{total} "
            f"({metrics.get('score_accuracy_rate', 0):.1%})"
        )
