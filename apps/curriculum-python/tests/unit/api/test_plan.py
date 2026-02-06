"""Tests for src/api/plan.py — POST /llm/plan endpoint."""

import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from uuid import uuid4

from httpx import ASGITransport, AsyncClient

from src.api.plan import RawPlanOutput
from src.utils.retry import RetryResult, AttemptResult


# --- Helpers ---

def _valid_raw_plan() -> dict:
    """Minimal valid RawPlanOutput data (DYNAMIC size: 4-30 nodes)."""
    nodes = []
    schedule = []
    for i in range(4):
        nid = f"node_{i}"
        nodes.append({
            "node_id": nid,
            "title": f"Node {i} Title Here",
            "objectives": [f"Objective for node {i}"],
            "prerequisites": [f"node_{i-1}"] if i > 0 else [],
            "estimated_minutes": 30,
        })
        schedule.append({"order": i + 1, "node_id": nid})
    return {
        "topic": "Python Basics",
        "user_level": "beginner",
        "plan_size": "dynamic",
        "nodes": nodes,
        "schedule": schedule,
    }


def _make_retry_result(raw_plan: dict, success: bool = True) -> RetryResult:
    raw_json = json.dumps(raw_plan)
    if success:
        validated = RawPlanOutput.model_validate(raw_plan)
        return RetryResult(
            success=True,
            value=validated,
            raw_output=raw_json,
            retry_count=0,
            attempts=[AttemptResult(raw_output=raw_json, success=True)],
        )
    return RetryResult(
        success=False,
        value=None,
        raw_output=raw_json,
        retry_count=2,
        attempts=[AttemptResult(raw_output=raw_json, validation_errors=["Some error"])],
        final_errors=["Validation failed"],
    )


def _plan_request(topic="Python Basics", user_level="beginner", plan_size="dynamic"):
    return {
        "topic": topic,
        "user_level": user_level,
        "plan_size": plan_size,
        "request_id": str(uuid4()),
    }


# --- Tests ---


class TestPlanEndpoint:
    """Tests for POST /llm/plan."""

    @pytest.fixture(autouse=True)
    def _setup(self, monkeypatch):
        monkeypatch.setenv("SERVICE_TOKEN", "test-token")
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        self.headers = {"X-Service-Token": "test-token"}

    @pytest.fixture
    def _mock_deps(self, mocker):
        """Mock the three main dependencies: retry, load_prompt, get_provider."""
        self.mock_retry = mocker.patch(
            "src.api.plan.retry_llm_with_validation",
            new_callable=AsyncMock,
        )
        self.mock_prompt = mocker.patch("src.api.plan.load_prompt")
        self.mock_prompt.return_value = "Generate {topic} for {user_level} ({plan_size}). {validation_errors}"

        mock_provider = MagicMock()
        mock_provider.provider_name = "gemini"
        mock_provider.model_name = "gemini-2.0-flash"
        mock_provider.generate = AsyncMock()
        self.mock_get_provider = mocker.patch(
            "src.api.plan.get_provider", return_value=mock_provider
        )
        self.mock_provider = mock_provider

    async def _post(self, body: dict) -> "httpx.Response":
        from src.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post("/llm/plan", json=body, headers=self.headers)

    async def test_success_200(self, _mock_deps):
        raw = _valid_raw_plan()
        self.mock_retry.return_value = _make_retry_result(raw, success=True)

        resp = await self._post(_plan_request())

        assert resp.status_code == 200
        data = resp.json()
        assert "plan" in data
        plan = data["plan"]
        assert plan["topic"] == "Python Basics"
        assert plan["user_level"] == "beginner"
        assert plan["schema_version"] == "plan.v1"
        assert len(plan["nodes"]) == 4

    async def test_metadata_fields(self, _mock_deps):
        raw = _valid_raw_plan()
        self.mock_retry.return_value = _make_retry_result(raw, success=True)

        resp = await self._post(_plan_request())

        meta = resp.json()["plan"]["metadata"]
        assert meta["provider"] == "gemini"
        assert meta["model"] == "gemini-2.0-flash"
        assert meta["prompt_version"] == "plan/v1"
        assert meta["validation_retry_count"] == 0
        assert len(meta["raw_output_hash"]) == 64
        assert len(meta["artifact_hash"]) == 64

    async def test_validation_failure_422(self, _mock_deps):
        self.mock_retry.return_value = _make_retry_result(_valid_raw_plan(), success=False)

        resp = await self._post(_plan_request())

        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert detail["error"] == "VALIDATION_FAILED"

    async def test_prompt_not_found_500(self, _mock_deps):
        self.mock_prompt.side_effect = FileNotFoundError("plan/v1.txt not found")

        resp = await self._post(_plan_request())

        assert resp.status_code == 500
        detail = resp.json()["detail"]
        assert detail["error"] == "CONFIGURATION_ERROR"

    async def test_unexpected_error_500(self, _mock_deps):
        self.mock_retry.side_effect = RuntimeError("something broke")

        resp = await self._post(_plan_request())

        assert resp.status_code == 500
        detail = resp.json()["detail"]
        assert detail["error"] == "INTERNAL_ERROR"

    async def test_request_id_in_error_response(self, _mock_deps):
        self.mock_retry.return_value = _make_retry_result(_valid_raw_plan(), success=False)
        req = _plan_request()

        resp = await self._post(req)

        detail = resp.json()["detail"]
        assert detail["request_id"] == req["request_id"]

    async def test_topic_min_length(self, _mock_deps):
        resp = await self._post(_plan_request(topic="ab"))  # min 3
        assert resp.status_code == 422

    async def test_invalid_user_level(self, _mock_deps):
        resp = await self._post(_plan_request(user_level="expert"))
        assert resp.status_code == 422

    async def test_hashes_are_deterministic(self, _mock_deps):
        raw = _valid_raw_plan()
        self.mock_retry.return_value = _make_retry_result(raw, success=True)

        resp1 = await self._post(_plan_request())
        self.mock_retry.return_value = _make_retry_result(raw, success=True)
        resp2 = await self._post(_plan_request())

        hash1 = resp1.json()["plan"]["metadata"]["raw_output_hash"]
        hash2 = resp2.json()["plan"]["metadata"]["raw_output_hash"]
        assert hash1 == hash2

    async def test_auth_required(self):
        """Request without service token should be rejected."""
        from src.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/llm/plan", json=_plan_request())
        assert resp.status_code == 401

    async def test_retry_count_propagated(self, _mock_deps):
        raw = _valid_raw_plan()
        result = _make_retry_result(raw, success=True)
        result.retry_count = 1
        self.mock_retry.return_value = result

        resp = await self._post(_plan_request())

        assert resp.json()["plan"]["metadata"]["validation_retry_count"] == 1
