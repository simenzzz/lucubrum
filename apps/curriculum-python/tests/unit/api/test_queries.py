"""Tests for src/api/queries.py — POST /llm/queries endpoint."""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from httpx import ASGITransport, AsyncClient

from src.api.queries import RawQueriesOutput
from src.utils.retry import RetryResult, AttemptResult


def _valid_raw_queries() -> dict:
    return {"queries": ["python basics tutorial", "learn python variables", "python for beginners"]}


def _make_retry_result(raw: dict, success: bool = True) -> RetryResult:
    raw_json = json.dumps(raw)
    if success:
        validated = RawQueriesOutput.model_validate(raw)
        return RetryResult(
            success=True, value=validated, raw_output=raw_json, retry_count=0,
            attempts=[AttemptResult(raw_output=raw_json, success=True)],
        )
    return RetryResult(
        success=False, value=None, raw_output=raw_json, retry_count=2,
        attempts=[AttemptResult(raw_output=raw_json, validation_errors=["Error"])],
        final_errors=["Validation failed"],
    )


def _queries_request(**overrides) -> dict:
    base = {
        "plan_id": str(uuid4()),
        "node_id": "intro_node",
        "node_title": "Python Basics Introduction",
        "node_objectives": ["Understand variables", "Learn basic syntax"],
        "request_id": str(uuid4()),
    }
    base.update(overrides)
    return base


class TestQueriesEndpoint:
    @pytest.fixture(autouse=True)
    def _setup(self, monkeypatch):
        monkeypatch.setenv("SERVICE_TOKEN", "test-service-token")
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        self.headers = {"X-Service-Token": "test-service-token"}

    @pytest.fixture
    def _mock_deps(self, mocker):
        self.mock_retry = mocker.patch(
            "src.api.queries.retry_llm_with_validation", new_callable=AsyncMock,
        )
        self.mock_prompt = mocker.patch("src.api.queries.load_prompt")
        self.mock_prompt.return_value = (
            "Generate queries for {node_title}. "
            "Objectives: {node_objectives}. Tags: {node_tags}. {validation_errors}"
        )
        mock_provider = MagicMock()
        mock_provider.provider_name = "gemini"
        mock_provider.model_name = "gemini-2.0-flash"
        mocker.patch("src.api.queries.get_provider", return_value=mock_provider)

    async def _post(self, body: dict):
        from src.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post("/llm/queries", json=body, headers=self.headers)

    async def test_success_200(self, _mock_deps):
        self.mock_retry.return_value = _make_retry_result(_valid_raw_queries())
        resp = await self._post(_queries_request())
        assert resp.status_code == 200
        data = resp.json()
        assert "suggestions" in data
        assert len(data["suggestions"]["queries"]) == 3

    async def test_metadata_present(self, _mock_deps):
        self.mock_retry.return_value = _make_retry_result(_valid_raw_queries())
        resp = await self._post(_queries_request())
        meta = resp.json()["suggestions"]["metadata"]
        assert meta["prompt_version"] == "queries/v1"

    async def test_with_tags(self, _mock_deps):
        self.mock_retry.return_value = _make_retry_result(_valid_raw_queries())
        resp = await self._post(_queries_request(node_tags=["python", "beginner"]))
        assert resp.status_code == 200

    async def test_without_tags(self, _mock_deps):
        self.mock_retry.return_value = _make_retry_result(_valid_raw_queries())
        resp = await self._post(_queries_request(node_tags=None))
        assert resp.status_code == 200

    async def test_validation_failure_422(self, _mock_deps):
        self.mock_retry.return_value = _make_retry_result(_valid_raw_queries(), success=False)
        resp = await self._post(_queries_request())
        assert resp.status_code == 422

    async def test_prompt_not_found_500(self, _mock_deps):
        self.mock_prompt.side_effect = FileNotFoundError("not found")
        resp = await self._post(_queries_request())
        assert resp.status_code == 500

    async def test_auth_required(self):
        from src.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/llm/queries", json=_queries_request())
        assert resp.status_code == 401
