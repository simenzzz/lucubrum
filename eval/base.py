#!/usr/bin/env python3
"""
Base evaluator class for Learning Helper eval harness.

Provides shared functionality for HTTP requests, rate limiting, parallel execution,
metrics collection, and results persistence. Individual prompt evaluators inherit
from this class.
"""

import asyncio
import json
import logging
import os
import sys
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, TypedDict

import httpx
import structlog


# Configuration
PYTHON_SERVICE_URL = os.getenv("PYTHON_SERVICE_URL", "http://localhost:8000")
GOLDEN_DATA_PATH = Path(__file__).parent / "data" / "golden_data.json"
RESULTS_DIR = Path(__file__).parent / "results"

# Rate limiting defaults
DEFAULT_TARGET_RPM = 10
DEFAULT_MAX_CONCURRENCY = 3
DEFAULT_TIMEOUT_SECONDS = 120


def configure_eval_logging() -> None:
    """Configure structured logging for the eval harness."""
    environment = os.getenv("ENVIRONMENT", "development")

    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
    ]

    if environment == "production":
        # JSON output for production (machine-readable)
        structlog.configure(
            processors=shared_processors + [structlog.processors.JSONRenderer()],
            wrapper_class=structlog.stdlib.BoundLogger,
            context_class=dict,
            logger_factory=structlog.PrintLoggerFactory(),
            cache_logger_on_first_use=True,
        )
        logging.basicConfig(
            format="%(message)s",
            stream=sys.stdout,
            level=logging.INFO,
        )
    else:
        # Colored console output for development (human-readable)
        structlog.configure(
            processors=shared_processors + [structlog.dev.ConsoleRenderer(colors=True)],
            wrapper_class=structlog.stdlib.BoundLogger,
            context_class=dict,
            logger_factory=structlog.PrintLoggerFactory(),
            cache_logger_on_first_use=True,
        )
        logging.basicConfig(
            format="%(message)s",
            stream=sys.stdout,
            level=logging.DEBUG,
        )


# Configure logging on module import
configure_eval_logging()

# Module-level logger
logger = structlog.get_logger("eval")


class EvalResultBase(TypedDict, total=False):
    """Base TypedDict for evaluation results. All evaluators extend this."""

    item_id: str
    request_id: str
    error: str | None
    duration_ms: int
    skipped: bool


class BaseEvaluator(ABC):
    """
    Abstract base class for all prompt evaluators.

    Provides:
    - HTTP client with connection pooling and rate limiting
    - Metrics collection and aggregation
    - Results saving (JSON output)
    - Summary printing with exit criteria checks

    Subclasses must implement:
    - prompt_name: The name of the prompt being evaluated
    - run_single_eval(): Evaluate a single item from golden data
    - get_exit_criteria(): Define pass/fail thresholds
    - print_custom_summary(): Print prompt-specific metrics
    """

    def __init__(
        self,
        service_url: str = PYTHON_SERVICE_URL,
        target_rpm: int = DEFAULT_TARGET_RPM,
        max_concurrency: int = DEFAULT_MAX_CONCURRENCY,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    ):
        self.service_url = service_url
        self.target_rpm = target_rpm
        self.max_concurrency = max_concurrency
        self.timeout_seconds = timeout_seconds
        self.results: list[dict[str, Any]] = []
        self.metrics: dict[str, Any] = self._init_metrics()
        self._client: httpx.AsyncClient | None = None

    @property
    @abstractmethod
    def prompt_name(self) -> str:
        """Name of the prompt being evaluated (e.g., 'plan', 'exercises')."""
        pass

    def _init_metrics(self) -> dict[str, Any]:
        """Initialize base metrics. Subclasses can extend."""
        return {
            "total_items": 0,
            "successful": 0,
            "failed": 0,
            "errors": [],
        }

    @abstractmethod
    async def run_single_eval(
        self, item: dict, index: int, total: int
    ) -> dict[str, Any]:
        """
        Run evaluation for a single golden data item.

        Args:
            item: A single item from golden_data.json
            index: 1-based index of current item
            total: Total number of items

        Returns:
            Dict of metrics for this item
        """
        pass

    @abstractmethod
    def get_exit_criteria(self) -> dict[str, tuple[str, float, str]]:
        """
        Define exit criteria for this evaluator.

        Returns:
            Dict mapping metric_name -> (comparison_op, threshold, description)
            comparison_op: '>=', '<=', '=='
        """
        pass

    @abstractmethod
    def print_custom_summary(self, metrics: dict[str, Any]) -> None:
        """Print prompt-specific summary after standard metrics."""
        pass

    @abstractmethod
    def aggregate_metrics(self, all_results: list[dict[str, Any]]) -> None:
        """Aggregate individual results into self.metrics."""
        pass

    def load_golden_data(self, limit: int | None = None) -> list[dict]:
        """Load golden data from JSON file."""
        with open(GOLDEN_DATA_PATH) as f:
            data = json.load(f)
        topics = data.get("topics", [])
        if limit:
            topics = topics[:limit]
        return topics

    async def make_request(
        self,
        endpoint: str,
        body: dict,
    ) -> tuple[int, dict | None, str | None]:
        """
        Make an HTTP POST request to the service using the shared client.

        Returns:
            Tuple of (status_code, response_json, error_message)
        """
        if self._client is None:
            raise RuntimeError("HTTP client not initialized. Call run() first.")

        try:
            response = await self._client.post(
                f"{self.service_url}{endpoint}",
                json=body,
            )
            if response.status_code == 200:
                return 200, response.json(), None
            else:
                return response.status_code, None, response.text[:500]
        except httpx.TimeoutException:
            return 0, None, "Request timed out"
        except Exception as e:
            return 0, None, str(e)

    async def run(self, item_limit: int | None = None) -> dict[str, Any]:
        """Run evaluation on golden data with parallel execution and connection pooling."""
        items = self.load_golden_data(limit=item_limit)
        self.metrics["total_items"] = len(items)

        logger.info(
            "eval_started",
            evaluator=self.prompt_name,
            total_items=len(items),
            service_url=self.service_url,
            target_rpm=self.target_rpm,
            max_concurrency=self.max_concurrency,
        )

        delay_between_starts = 60.0 / self.target_rpm
        sem = asyncio.Semaphore(self.max_concurrency)

        async def _worker(index: int, item: dict) -> dict[str, Any]:
            async with sem:
                return await self.run_single_eval(item, index, len(items))

        # Create shared HTTP client with connection pooling
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            self._client = client

            # Launch tasks with staggered starts
            tasks = []
            for i, item in enumerate(items, 1):
                task = asyncio.create_task(_worker(i, item))
                tasks.append(task)
                if i < len(items):
                    await asyncio.sleep(delay_between_starts)

            # Gather results
            results_list = await asyncio.gather(*tasks)
            self.results = list(results_list)

        self._client = None

        # Aggregate metrics
        self.aggregate_metrics(self.results)

        logger.info(
            "eval_completed",
            evaluator=self.prompt_name,
            successful=self.metrics["successful"],
            failed=self.metrics["failed"],
        )

        return self.metrics

    def save_results(self, output_path: Path | None = None) -> Path:
        """Save results to JSON file."""
        if output_path is None:
            RESULTS_DIR.mkdir(exist_ok=True)
            timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            output_path = RESULTS_DIR / f"{self.prompt_name}_{timestamp}.json"

        output = {
            "evaluator": self.prompt_name,
            "run_timestamp": datetime.now(timezone.utc).isoformat(),
            "service_url": self.service_url,
            "metrics": self.metrics,
            "results": self.results,
        }

        with open(output_path, "w") as f:
            json.dump(output, f, indent=2)

        return output_path

    def _check_criterion(self, value: float, op: str, threshold: float) -> bool:
        """Check a single exit criterion. Returns True if the criterion passes."""
        if op == ">=":
            return value >= threshold
        elif op == "<=":
            return value <= threshold
        elif op == "==":
            return value == threshold
        return False

    def print_summary(self) -> bool:
        """Print evaluation summary with exit criteria check. Returns True if all pass."""
        metrics = self.metrics
        total = metrics["total_items"]

        logger.info(
            "eval_summary",
            evaluator=self.prompt_name,
            total_items=total,
            successful=metrics["successful"],
            failed=metrics["failed"],
        )

        print(f"\n{'='*60}")
        print(f"EVALUATION SUMMARY: {self.prompt_name.upper()}")
        print(f"{'='*60}")
        print(f"\nTotal items evaluated: {total}")
        print(f"Successful: {metrics['successful']}")
        print(f"Failed: {metrics['failed']}")

        # Custom metrics for this prompt
        self.print_custom_summary(metrics)

        # Errors
        if metrics.get("errors"):
            print(f"\nErrors ({len(metrics['errors'])}):")
            for err in metrics["errors"][:5]:
                error_preview = err.get("error", "Unknown")[:60]
                print(f"  - {err.get('item_id', 'unknown')}: {error_preview}")
            if len(metrics["errors"]) > 5:
                print(f"  ... and {len(metrics['errors']) - 5} more")

        # Exit criteria check
        print("\n" + "-" * 60)
        print("EXIT CRITERIA CHECK:")
        all_passed = True
        for metric_name, (op, threshold, desc) in self.get_exit_criteria().items():
            value = metrics.get(metric_name, 0)
            passed = self._check_criterion(value, op, threshold)

            status = "PASS" if passed else "FAIL"
            if not passed:
                all_passed = False

            if isinstance(value, float):
                print(f"  {desc}: {status} ({value:.1%})")
            else:
                print(f"  {desc}: {status} ({value})")

        print("=" * 60)
        return all_passed

    def check_exit_criteria(self) -> bool:
        """Check if all exit criteria pass. Returns True if all pass."""
        metrics = self.metrics
        for metric_name, (op, threshold, _) in self.get_exit_criteria().items():
            value = metrics.get(metric_name, 0)
            if not self._check_criterion(value, op, threshold):
                return False
        return True
