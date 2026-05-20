#!/usr/bin/env python3
"""
Evaluation harness entrypoint for Lucubrum curriculum generation.

Runs evaluation for one or all prompts using golden_data.json.

Usage:
    python eval/run.py --prompt plan --topics 5
    python eval/run.py --prompt exercises --topics 3
    python eval/run.py --prompt all

Available prompts: plan, exercises, grade, queries, staleness, validate_video, all
"""

import argparse
import asyncio
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, TypedDict

# Ensure eval directory is in path for imports when run as script
_eval_dir = Path(__file__).parent
if str(_eval_dir) not in sys.path:
    sys.path.insert(0, str(_eval_dir))

from base import BaseEvaluator, PYTHON_SERVICE_URL, logger


class PlanEvalResult(TypedDict, total=False):
    """TypedDict for plan evaluation results."""

    item_id: str
    topic: str
    request_id: str
    schema_valid_first_try: bool
    schema_valid_after_retry: bool
    retry_count: int
    dag_valid: bool
    node_count: int
    node_count_in_range: bool
    expected_node_count: dict[str, int]
    error: str | None
    duration_ms: int


class PlanEvaluator(BaseEvaluator):
    """Evaluator for the plan generation prompt."""

    @property
    def prompt_name(self) -> str:
        return "plan"

    def _init_metrics(self) -> dict[str, Any]:
        return {
            "total_items": 0,
            "successful": 0,
            "failed": 0,
            "schema_valid_first_try": 0,
            "schema_valid_after_retry": 0,
            "dag_valid": 0,
            "node_count_in_range": 0,
            "errors": [],
        }

    async def run_single_eval(
        self, item: dict, index: int, total: int
    ) -> PlanEvalResult:
        """Generate a plan for a topic and collect metrics."""
        request_id = str(uuid.uuid4())
        topic_name = item["topic"][:40]

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
            "user_level": item["user_level"],
            "plan_size": item["plan_size"],
            "request_id": request_id,
        }

        eval_metrics: PlanEvalResult = {
            "item_id": item["id"],
            "topic": item["topic"],
            "request_id": request_id,
            "schema_valid_first_try": False,
            "schema_valid_after_retry": False,
            "retry_count": 0,
            "dag_valid": False,
            "node_count": 0,
            "node_count_in_range": False,
            "expected_node_count": item.get("expected_node_count", {}),
            "error": None,
            "duration_ms": 0,
        }

        start_time = datetime.now()
        status_code, response_json, error = await self.make_request(
            "/llm/plan", request_body
        )
        duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        eval_metrics["duration_ms"] = duration_ms

        if status_code == 200 and response_json:
            plan = response_json.get("plan", {})
            metadata = plan.get("metadata", {})
            retry_count = metadata.get("validation_retry_count", 0)

            eval_metrics["retry_count"] = retry_count
            eval_metrics["schema_valid_first_try"] = retry_count == 0
            eval_metrics["schema_valid_after_retry"] = True
            eval_metrics["node_count"] = len(plan.get("nodes", []))
            eval_metrics["dag_valid"] = True  # 200 = passed Pydantic validation

            # Check node count range
            expected = item.get("expected_node_count", {})
            min_nodes = expected.get("min", 4)
            max_nodes = expected.get("max", 30)
            eval_metrics["node_count_in_range"] = (
                min_nodes <= eval_metrics["node_count"] <= max_nodes
            )
        elif status_code == 422:
            # Preserve the actual error details from 422 responses
            eval_metrics["error"] = f"Validation failed: {error}"
        else:
            eval_metrics["error"] = error

        status = "OK" if eval_metrics["schema_valid_after_retry"] else "FAIL"
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
            if result.get("schema_valid_after_retry"):
                self.metrics["successful"] += 1
            else:
                self.metrics["failed"] += 1

            if result.get("schema_valid_first_try"):
                self.metrics["schema_valid_first_try"] += 1
            if result.get("schema_valid_after_retry"):
                self.metrics["schema_valid_after_retry"] += 1
            if result.get("dag_valid"):
                self.metrics["dag_valid"] += 1
            if result.get("node_count_in_range"):
                self.metrics["node_count_in_range"] += 1

            if result.get("error"):
                self.metrics["errors"].append({
                    "item_id": result["item_id"],
                    "error": result["error"],
                })

        # Calculate rates
        total = self.metrics["total_items"]
        if total > 0:
            self.metrics["schema_validity_first_try_rate"] = (
                self.metrics["schema_valid_first_try"] / total
            )
            self.metrics["schema_validity_after_retry_rate"] = (
                self.metrics["schema_valid_after_retry"] / total
            )
            self.metrics["dag_validity_rate"] = self.metrics["dag_valid"] / total
            self.metrics["node_count_in_range_rate"] = (
                self.metrics["node_count_in_range"] / total
            )

    def get_exit_criteria(self) -> dict[str, tuple[str, float, str]]:
        return {
            "schema_validity_first_try_rate": (
                ">=", 0.95, "Schema validity (first try) >= 95%"
            ),
            "dag_validity_rate": ("==", 1.0, "DAG validity == 100%"),
        }

    def print_custom_summary(self, metrics: dict[str, Any]) -> None:
        total = metrics["total_items"]
        print(f"\nSchema Validity:")
        print(
            f"  First try:    {metrics['schema_valid_first_try']}/{total} "
            f"({metrics.get('schema_validity_first_try_rate', 0):.1%})"
        )
        print(
            f"  After retry:  {metrics['schema_valid_after_retry']}/{total} "
            f"({metrics.get('schema_validity_after_retry_rate', 0):.1%})"
        )
        print(f"\nDAG Validity:")
        print(
            f"  Valid:        {metrics['dag_valid']}/{total} "
            f"({metrics.get('dag_validity_rate', 0):.1%})"
        )
        print(f"\nNode Count Range:")
        print(f"  In range:     {metrics['node_count_in_range']}/{total}")


def get_evaluator(prompt_name: str, service_url: str) -> BaseEvaluator:
    """Factory to get the right evaluator for a prompt."""
    if prompt_name == "plan":
        return PlanEvaluator(service_url=service_url)
    elif prompt_name == "exercises":
        from evaluators import ExercisesEvaluator
        return ExercisesEvaluator(service_url=service_url)
    elif prompt_name == "grade":
        from evaluators import GradeEvaluator
        return GradeEvaluator(service_url=service_url)
    elif prompt_name == "queries":
        from evaluators import QueriesEvaluator
        return QueriesEvaluator(service_url=service_url)
    elif prompt_name == "staleness":
        from evaluators import StalenessEvaluator
        return StalenessEvaluator(service_url=service_url)
    elif prompt_name == "validate_video":
        from evaluators import ValidateVideoEvaluator
        return ValidateVideoEvaluator(service_url=service_url)
    else:
        raise ValueError(f"Unknown prompt: {prompt_name}")


AVAILABLE_PROMPTS = ["plan", "exercises", "grade", "queries", "staleness", "validate_video"]


async def run_single_evaluator(prompt_name: str, service_url: str, topic_limit: int | None) -> bool:
    """Run a single evaluator and return whether it passed."""
    evaluator = get_evaluator(prompt_name, service_url)
    await evaluator.run(item_limit=topic_limit)
    output_path = evaluator.save_results()
    evaluator.print_summary()
    logger.info("results_saved", path=str(output_path))
    return evaluator.check_exit_criteria()


async def main():
    parser = argparse.ArgumentParser(
        description="Run evaluation harness for LLM prompts"
    )
    parser.add_argument(
        "--prompt",
        "-p",
        type=str,
        default="plan",
        choices=AVAILABLE_PROMPTS + ["all"],
        help="Which prompt to evaluate (default: plan)",
    )
    parser.add_argument(
        "--topics",
        "-n",
        type=int,
        default=None,
        help="Number of topics to evaluate (default: all)",
    )
    parser.add_argument(
        "--service-url",
        type=str,
        default=PYTHON_SERVICE_URL,
        help=f"Python service URL (default: {PYTHON_SERVICE_URL})",
    )
    args = parser.parse_args()

    all_passed = True

    if args.prompt == "all":
        # Run all evaluators
        for prompt_name in AVAILABLE_PROMPTS:
            try:
                passed = await run_single_evaluator(
                    prompt_name, args.service_url, args.topics
                )
                if not passed:
                    all_passed = False
            except ImportError as e:
                logger.warning("eval_skipped", prompt=prompt_name, reason=str(e))
            except Exception as e:
                logger.error("eval_error", prompt=prompt_name, error=str(e))
                all_passed = False
    else:
        try:
            all_passed = await run_single_evaluator(
                args.prompt, args.service_url, args.topics
            )
        except ImportError as e:
            logger.error("module_not_found", error=str(e))
            sys.exit(1)

    if not all_passed:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
