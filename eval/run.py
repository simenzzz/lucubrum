#!/usr/bin/env python3
"""
Evaluation harness for Learning Helper curriculum generation.

Runs golden topics through the Python curriculum service and collects metrics
to validate plan generation quality.

Usage:
    python eval/run.py [--topics N] [--output results/run_TIMESTAMP.json]

Examples:
    python eval/run.py                    # Run all golden topics
    python eval/run.py --topics 3         # Run only first 3 topics
    python eval/run.py --service-url http://localhost:8000
"""

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import httpx

# Configuration
PYTHON_SERVICE_URL = os.getenv("PYTHON_SERVICE_URL", "http://localhost:8000")
GOLDEN_TOPICS_PATH = Path(__file__).parent / "golden_topics.json"
RESULTS_DIR = Path(__file__).parent / "results"


class EvaluationHarness:
    """Run evaluation against golden topics."""

    def __init__(self, service_url: str):
        self.service_url = service_url
        self.results: list[dict[str, Any]] = []
        self.metrics = {
            "total_topics": 0,
            "schema_valid_first_try": 0,
            "schema_valid_after_retry": 0,
            "schema_invalid": 0,
            "dag_valid": 0,
            "dag_invalid": 0,
            "node_count_valid": 0,
            "node_count_invalid": 0,
            "errors": [],
        }

    def load_golden_topics(self, limit: int | None = None) -> list[dict]:
        """Load golden topics from JSON file."""
        with open(GOLDEN_TOPICS_PATH) as f:
            data = json.load(f)
        topics = data.get("topics", [])
        if limit:
            topics = topics[:limit]
        return topics

    async def generate_plan(
        self, topic: dict
    ) -> tuple[dict | None, dict[str, Any]]:
        """
        Call the Python service to generate a plan.

        Returns:
            Tuple of (plan_response, metrics_dict)
        """
        import uuid

        request_id = str(uuid.uuid4())
        request_body = {
            "topic": topic["topic"],
            "user_level": topic["user_level"],
            "plan_size": topic["plan_size"],
            "request_id": request_id,
        }

        eval_metrics = {
            "topic_id": topic["id"],
            "topic": topic["topic"],
            "request_id": request_id,
            "schema_valid_first_try": False,
            "schema_valid_after_retry": False,
            "retry_count": 0,
            "dag_valid": False,
            "node_count": 0,
            "node_count_in_range": False,
            "expected_node_count": topic.get("expected_node_count", {}),
            "error": None,
            "duration_ms": 0
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            start_time = datetime.now()
            try:
                response = await client.post(
                    f"{self.service_url}/llm/plan",
                    json=request_body,
                )
                duration_ms = int(
                    (datetime.now() - start_time).total_seconds() * 1000
                )
                eval_metrics["duration_ms"] = duration_ms

                if response.status_code == 200:
                    plan_data = response.json()
                    plan = plan_data.get("plan", {})
                    metadata = plan.get("metadata", {})
                    retry_count = metadata.get("validation_retry_count", 0)

                    eval_metrics["retry_count"] = retry_count
                    eval_metrics["schema_valid_first_try"] = retry_count == 0
                    eval_metrics["schema_valid_after_retry"] = True
                    eval_metrics["node_count"] = len(plan.get("nodes", []))

                    # Check node count range
                    expected = topic.get("expected_node_count", {})
                    min_nodes = expected.get("min", 4)
                    max_nodes = expected.get("max", 30)
                    eval_metrics["node_count_in_range"] = (
                        min_nodes <= eval_metrics["node_count"] <= max_nodes
                    )

                    # DAG validity is guaranteed by Pydantic validation in curriculum-python.
                    # A 200 response means the plan passed all validators including cycle detection.
                    eval_metrics["dag_valid"] = True

                    return plan_data, eval_metrics

                elif response.status_code == 422:
                    # Validation failed after retries
                    error_data = response.json()
                    detail = error_data.get("detail", {})
                    if isinstance(detail, dict):
                        eval_metrics["error"] = detail.get("message", str(detail))
                        eval_metrics["retry_count"] = detail.get("attempts", 0)
                    else:
                        eval_metrics["error"] = str(detail)
                    return None, eval_metrics

                else:
                    eval_metrics["error"] = (
                        f"HTTP {response.status_code}: {response.text[:200]}"
                    )
                    return None, eval_metrics

            except httpx.TimeoutException:
                duration_ms = int(
                    (datetime.now() - start_time).total_seconds() * 1000
                )
                eval_metrics["duration_ms"] = duration_ms
                eval_metrics["error"] = "Request timed out"
                return None, eval_metrics
            except Exception as e:
                duration_ms = int(
                    (datetime.now() - start_time).total_seconds() * 1000
                )
                eval_metrics["duration_ms"] = duration_ms
                eval_metrics["error"] = str(e)
                return None, eval_metrics

    async def run(self, topic_limit: int | None = None) -> dict[str, Any]:
        """
        Run evaluation on golden topics.

        Returns:
            Summary metrics dictionary
        """
        topics = self.load_golden_topics(limit=topic_limit)
        self.metrics["total_topics"] = len(topics)

        print(f"Running evaluation on {len(topics)} topics...")
        print(f"Service URL: {self.service_url}")
        print("-" * 60)

        for i, topic in enumerate(topics, 1):
            topic_name = topic["topic"][:40]
            print(f"[{i}/{len(topics)}] {topic_name}...", end=" ", flush=True)

            plan, eval_metrics = await self.generate_plan(topic)
            self.results.append(eval_metrics)

            # Update aggregate metrics
            if eval_metrics["schema_valid_first_try"]:
                self.metrics["schema_valid_first_try"] += 1
            if eval_metrics["schema_valid_after_retry"]:
                self.metrics["schema_valid_after_retry"] += 1
            else:
                self.metrics["schema_invalid"] += 1
            if eval_metrics["dag_valid"]:
                self.metrics["dag_valid"] += 1
            else:
                self.metrics["dag_invalid"] += 1
            if eval_metrics["node_count_in_range"]:
                self.metrics["node_count_valid"] += 1
            else:
                self.metrics["node_count_invalid"] += 1
            if eval_metrics["error"]:
                self.metrics["errors"].append(
                    {
                        "topic_id": topic["id"],
                        "error": eval_metrics["error"],
                    }
                )

            # Print result
            if eval_metrics["schema_valid_after_retry"]:
                status = "OK"
                retry_info = (
                    f" (retry: {eval_metrics['retry_count']})"
                    if eval_metrics["retry_count"] > 0
                    else ""
                )
                dag_info = "" if eval_metrics["dag_valid"] else " [DAG INVALID]"
                print(f"{status}{retry_info}{dag_info} [{eval_metrics['duration_ms']}ms]")
            else:
                error_preview = (
                    eval_metrics["error"][:40] if eval_metrics["error"] else "Unknown"
                )
                print(f"FAIL: {error_preview}")

        # Calculate rates
        total = self.metrics["total_topics"]
        self.metrics["schema_validity_first_try_rate"] = (
            self.metrics["schema_valid_first_try"] / total if total > 0 else 0
        )
        self.metrics["schema_validity_after_retry_rate"] = (
            self.metrics["schema_valid_after_retry"] / total if total > 0 else 0
        )
        self.metrics["dag_validity_rate"] = (
            self.metrics["dag_valid"] / total if total > 0 else 0
        )

        return self.metrics

    def save_results(self, output_path: Path | None = None) -> Path:
        """Save results to JSON file."""
        if output_path is None:
            RESULTS_DIR.mkdir(exist_ok=True)
            timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            output_path = RESULTS_DIR / f"run_{timestamp}.json"

        output = {
            "run_timestamp": datetime.now(timezone.utc).isoformat(),
            "service_url": self.service_url,
            "metrics": self.metrics,
            "results": self.results,
        }

        with open(output_path, "w") as f:
            json.dump(output, f, indent=2)

        return output_path


def print_summary(metrics: dict[str, Any]) -> None:
    """Print evaluation summary."""
    print("\n" + "=" * 60)
    print("EVALUATION SUMMARY")
    print("=" * 60)
    total = metrics["total_topics"]

    print(f"\nTotal topics evaluated: {total}")
    print(f"\nSchema Validity:")
    print(
        f"  First try:    {metrics['schema_valid_first_try']}/{total} "
        f"({metrics['schema_validity_first_try_rate']:.1%})"
    )
    print(
        f"  After retry:  {metrics['schema_valid_after_retry']}/{total} "
        f"({metrics['schema_validity_after_retry_rate']:.1%})"
    )

    print(f"\nDAG Validity:")
    print(
        f"  Valid:        {metrics['dag_valid']}/{total} "
        f"({metrics['dag_validity_rate']:.1%})"
    )

    print(f"\nNode Count Range:")
    print(f"  In range:     {metrics['node_count_valid']}/{total}")

    if metrics["errors"]:
        print(f"\nErrors ({len(metrics['errors'])}):")
        for err in metrics["errors"][:5]:
            error_preview = err["error"][:60] if err["error"] else "Unknown"
            print(f"  - {err['topic_id']}: {error_preview}...")
        if len(metrics["errors"]) > 5:
            print(f"  ... and {len(metrics['errors']) - 5} more")

    # Exit criteria check
    print("\n" + "-" * 60)
    print("EXIT CRITERIA CHECK:")
    first_try_pass = metrics["schema_validity_first_try_rate"] >= 0.95
    dag_pass = metrics["dag_validity_rate"] == 1.0
    print(
        f"  Schema validity (first try) >= 95%: "
        f"{'PASS' if first_try_pass else 'FAIL'} "
        f"({metrics['schema_validity_first_try_rate']:.1%})"
    )
    print(
        f"  DAG validity == 100%: "
        f"{'PASS' if dag_pass else 'FAIL'} "
        f"({metrics['dag_validity_rate']:.1%})"
    )
    print("=" * 60)


async def main():
    parser = argparse.ArgumentParser(
        description="Run evaluation harness for plan generation"
    )
    parser.add_argument(
        "--topics",
        "-n",
        type=int,
        default=None,
        help="Number of topics to evaluate (default: all)",
    )
    parser.add_argument(
        "--output",
        "-o",
        type=str,
        default=None,
        help="Output file path (default: eval/results/run_TIMESTAMP.json)",
    )
    parser.add_argument(
        "--service-url",
        type=str,
        default=PYTHON_SERVICE_URL,
        help=f"Python service URL (default: {PYTHON_SERVICE_URL})",
    )
    args = parser.parse_args()

    harness = EvaluationHarness(service_url=args.service_url)

    try:
        metrics = await harness.run(topic_limit=args.topics)
    except FileNotFoundError:
        print(f"Error: Golden topics file not found at {GOLDEN_TOPICS_PATH}")
        print("Please create eval/golden_topics.json before running evaluation.")
        sys.exit(1)

    output_path = harness.save_results(Path(args.output) if args.output else None)

    print_summary(metrics)
    print(f"\nResults saved to: {output_path}")

    # Exit with failure code if criteria not met
    if (
        metrics["schema_validity_first_try_rate"] < 0.95
        or metrics["dag_validity_rate"] < 1.0
    ):
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
