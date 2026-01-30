#!/usr/bin/env python3
"""
Staleness evaluator for Learning Helper eval harness.

This evaluator is currently disabled pending MCP integration.
The implementation is complete and will be enabled when MCP is available.
"""

import uuid
from datetime import datetime
from typing import Any, TypedDict

from base import BaseEvaluator, logger


class StalenessEvalResult(TypedDict, total=False):
    """TypedDict for staleness evaluation results."""

    item_id: str
    topic: str
    request_id: str
    schema_valid: bool
    verdict_correct: bool
    expected_stale: bool
    actual_stale: bool | None
    stale_reason: str | None
    error: str | None
    duration_ms: int
    skipped: bool
    disabled_reason: str


class StalenessEvaluator(BaseEvaluator):
    """
    Evaluator for the staleness detection prompt.

    This evaluator is disabled pending MCP integration.
    Running this evaluator will skip all items and report as disabled.
    """

    @property
    def prompt_name(self) -> str:
        return "staleness"

    def _mcp_available(self) -> bool:
        """
        Check if MCP integration is available.

        Returns False until MCP is implemented. When ready, this should
        check for actual MCP availability (e.g., environment variable,
        service health check, etc.).
        """
        return False

    def _init_metrics(self) -> dict[str, Any]:
        return {
            "total_items": 0,
            "successful": 0,
            "failed": 0,
            "skipped": 0,
            "schema_valid": 0,
            "verdict_correct": 0,
            "errors": [],
            "disabled_reason": "MCP integration not yet implemented",
        }

    async def run_single_eval(
        self, item: dict, index: int, total: int
    ) -> StalenessEvalResult:
        """
        Check staleness for a topic and collect metrics.

        When MCP is not available, items are skipped with an explanation.
        When MCP becomes available, actual staleness checking is performed.
        """
        staleness_test = item.get("staleness_test")
        if not staleness_test:
            return {
                "item_id": item["id"],
                "error": "No staleness_test in golden data",
                "skipped": True,
            }

        topic_name = item["topic"][:40]

        # Check if MCP is available - if not, skip evaluation
        if not self._mcp_available():
            logger.info(
                "eval_item_skipped",
                evaluator=self.prompt_name,
                index=index,
                total=total,
                topic=topic_name,
                item_id=item["id"],
                reason="MCP not available",
            )
            return {
                "item_id": item["id"],
                "topic": item["topic"],
                "skipped": True,
                "disabled_reason": "MCP integration not yet implemented",
                "error": None,
            }

        # MCP is available - run actual evaluation
        request_id = str(uuid.uuid4())

        logger.info(
            "eval_item_started",
            evaluator=self.prompt_name,
            index=index,
            total=total,
            topic=topic_name,
            item_id=item["id"],
        )

        request_body = {
            "topic": item["topic"],
            "plan_summary": staleness_test["plan_summary"],
            "resources_text": staleness_test["resources_text"],
            "mcp_facts": staleness_test["mcp_facts"],
            "request_id": request_id,
        }

        eval_metrics: StalenessEvalResult = {
            "item_id": item["id"],
            "topic": item["topic"],
            "request_id": request_id,
            "schema_valid": False,
            "verdict_correct": False,
            "expected_stale": staleness_test["expected_stale"],
            "actual_stale": None,
            "stale_reason": None,
            "error": None,
            "duration_ms": 0,
            "skipped": False,
        }

        start_time = datetime.now()
        status_code, response_json, error = await self.make_request(
            "/llm/check-staleness", request_body
        )
        duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        eval_metrics["duration_ms"] = duration_ms

        if status_code == 200 and response_json:
            result = response_json.get("result", {})
            eval_metrics["schema_valid"] = True
            eval_metrics["stale_reason"] = result.get("stale_reason")

            # Determine if content is stale based on stale_reason presence
            actual_stale = result.get("stale_reason") is not None
            eval_metrics["actual_stale"] = actual_stale
            eval_metrics["verdict_correct"] = actual_stale == staleness_test["expected_stale"]
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
            if result.get("skipped"):
                self.metrics["skipped"] += 1
                continue

            if result.get("schema_valid"):
                self.metrics["successful"] += 1
                self.metrics["schema_valid"] += 1
            else:
                self.metrics["failed"] += 1

            if result.get("verdict_correct"):
                self.metrics["verdict_correct"] += 1

            if result.get("error"):
                self.metrics["errors"].append({
                    "item_id": result["item_id"],
                    "error": result["error"],
                })

        # Calculate rates (based on non-skipped items)
        total = self.metrics["total_items"] - self.metrics["skipped"]
        if total > 0:
            self.metrics["schema_valid_rate"] = self.metrics["schema_valid"] / total
            self.metrics["verdict_accuracy_rate"] = self.metrics["verdict_correct"] / total

    def get_exit_criteria(self) -> dict[str, tuple[str, float, str]]:
        # Criteria are relaxed since evaluator is disabled
        return {
            "skipped": (">=", 0, "Staleness eval disabled (MCP pending)"),
        }

    def print_custom_summary(self, metrics: dict[str, Any]) -> None:
        total = metrics["total_items"]
        skipped = metrics["skipped"]

        if skipped == total:
            print(f"\nStaleness Detection (DISABLED):")
            print(f"  Reason: {metrics.get('disabled_reason', 'Unknown')}")
            print(f"  Skipped: {skipped}/{total}")
        else:
            # MCP was available for some/all items
            evaluated = total - skipped
            print(f"\nStaleness Detection:")
            print(
                f"  Schema valid:     {metrics['schema_valid']}/{evaluated} "
                f"({metrics.get('schema_valid_rate', 0):.1%})"
            )
            print(
                f"  Verdict correct:  {metrics['verdict_correct']}/{evaluated} "
                f"({metrics.get('verdict_accuracy_rate', 0):.1%})"
            )
            if skipped > 0:
                print(f"  Skipped:          {skipped}/{total}")
