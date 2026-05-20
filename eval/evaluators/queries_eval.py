#!/usr/bin/env python3
"""Queries evaluator for Lucubrum eval harness."""

import uuid
from datetime import datetime
from typing import Any, TypedDict

from base import BaseEvaluator, logger


class QueriesEvalResult(TypedDict, total=False):
    """TypedDict for queries evaluation results."""

    item_id: str
    node_title: str
    request_id: str
    schema_valid: bool
    count_in_range: bool
    no_duplicates: bool
    keyword_coverage: bool
    query_count: int
    queries: list[str]
    expected_keywords: list[str]
    error: str | None
    duration_ms: int


class QueriesEvaluator(BaseEvaluator):
    """Evaluator for the query suggestions prompt."""

    @property
    def prompt_name(self) -> str:
        return "queries"

    def _init_metrics(self) -> dict[str, Any]:
        return {
            "total_items": 0,
            "successful": 0,
            "failed": 0,
            "schema_valid": 0,
            "count_in_range": 0,
            "no_duplicates": 0,
            "keyword_coverage": 0,
            "errors": [],
        }

    async def run_single_eval(
        self, item: dict, index: int, total: int
    ) -> QueriesEvalResult:
        """Generate queries for a test node and collect metrics."""
        query_node = item.get("query_test_node")
        if not query_node:
            return {
                "item_id": item["id"],
                "error": "No query_test_node in golden data",
                "schema_valid": False,
            }

        request_id = str(uuid.uuid4())
        plan_id = str(uuid.uuid4())
        node_id = f"test_node_{item['id']}"
        topic_name = query_node["node_title"][:40]

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
            "node_title": query_node["node_title"],
            "node_objectives": query_node["objectives"],
            "node_tags": query_node.get("tags"),
            "request_id": request_id,
        }

        eval_metrics: QueriesEvalResult = {
            "item_id": item["id"],
            "node_title": query_node["node_title"],
            "request_id": request_id,
            "schema_valid": False,
            "count_in_range": False,
            "no_duplicates": False,
            "keyword_coverage": False,
            "query_count": 0,
            "queries": [],
            "expected_keywords": query_node.get("expected_query_keywords", []),
            "error": None,
            "duration_ms": 0,
        }

        start_time = datetime.now()
        status_code, response_json, error = await self.make_request(
            "/llm/queries", request_body
        )
        duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        eval_metrics["duration_ms"] = duration_ms

        if status_code == 200 and response_json:
            suggestions = response_json.get("suggestions", {})
            queries = suggestions.get("queries", [])

            eval_metrics["schema_valid"] = True
            eval_metrics["query_count"] = len(queries)
            eval_metrics["queries"] = queries

            # Check count in range (3-5)
            eval_metrics["count_in_range"] = 3 <= len(queries) <= 5

            # Check no duplicates (case-insensitive)
            lower_queries = [q.lower().strip() for q in queries]
            eval_metrics["no_duplicates"] = len(lower_queries) == len(set(lower_queries))

            # Check keyword coverage
            expected_keywords = query_node.get("expected_query_keywords", [])
            queries_text = " ".join(queries).lower()
            keywords_found = sum(
                1 for kw in expected_keywords if kw.lower() in queries_text
            )
            # At least one keyword should be present
            eval_metrics["keyword_coverage"] = keywords_found > 0

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

            if result.get("count_in_range"):
                self.metrics["count_in_range"] += 1
            if result.get("no_duplicates"):
                self.metrics["no_duplicates"] += 1
            if result.get("keyword_coverage"):
                self.metrics["keyword_coverage"] += 1

            if result.get("error"):
                self.metrics["errors"].append({
                    "item_id": result["item_id"],
                    "error": result["error"],
                })

        # Calculate rates
        total = self.metrics["total_items"]
        if total > 0:
            self.metrics["schema_valid_rate"] = self.metrics["schema_valid"] / total
            self.metrics["count_in_range_rate"] = self.metrics["count_in_range"] / total
            self.metrics["no_duplicates_rate"] = self.metrics["no_duplicates"] / total
            self.metrics["keyword_coverage_rate"] = self.metrics["keyword_coverage"] / total

    def get_exit_criteria(self) -> dict[str, tuple[str, float, str]]:
        return {
            "schema_valid_rate": (">=", 0.95, "Schema validity >= 95%"),
            "count_in_range_rate": ("==", 1.0, "Query count (3-5) == 100%"),
            "no_duplicates_rate": ("==", 1.0, "No duplicates == 100%"),
            "keyword_coverage_rate": (">=", 0.70, "Keyword coverage >= 70%"),
        }

    def print_custom_summary(self, metrics: dict[str, Any]) -> None:
        total = metrics["total_items"]
        print(f"\nQuery Generation:")
        print(
            f"  Schema valid:      {metrics['schema_valid']}/{total} "
            f"({metrics.get('schema_valid_rate', 0):.1%})"
        )
        print(
            f"  Count in range:    {metrics['count_in_range']}/{total} "
            f"({metrics.get('count_in_range_rate', 0):.1%})"
        )
        print(
            f"  No duplicates:     {metrics['no_duplicates']}/{total} "
            f"({metrics.get('no_duplicates_rate', 0):.1%})"
        )
        print(
            f"  Keyword coverage:  {metrics['keyword_coverage']}/{total} "
            f"({metrics.get('keyword_coverage_rate', 0):.1%})"
        )
