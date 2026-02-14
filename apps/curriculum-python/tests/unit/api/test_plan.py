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


# --- Tests for RawPlanOutput DAG integrity validation ---


class TestRawPlanOutputValidation:
    """Tests for RawPlanOutput DAG integrity validation."""

    def test_unknown_prerequisite_rejected(self):
        """Node referencing non-existent prerequisite should raise ValueError."""
        data = _valid_raw_plan()
        # Add a prerequisite that doesn't exist
        data["nodes"][1]["prerequisites"] = ["jacobian_matrix"]
        with pytest.raises(ValueError, match=r"has unknown prerequisite"):
            RawPlanOutput.model_validate(data)

    def test_cycle_rejected(self):
        """Prerequisite cycle should raise ValueError."""
        data = _valid_raw_plan()
        # Create a cycle: node_0 -> node_1 -> node_0
        data["nodes"][0]["prerequisites"] = ["node_1"]
        data["nodes"][1]["prerequisites"] = ["node_0"]
        with pytest.raises(ValueError, match=r"cycle"):
            RawPlanOutput.model_validate(data)

    def test_schedule_missing_node(self):
        """Schedule not covering all nodes should raise ValueError."""
        data = _valid_raw_plan()
        # Remove a node from schedule
        data["schedule"].pop()
        with pytest.raises(ValueError, match=r"Nodes not in schedule"):
            RawPlanOutput.model_validate(data)

    def test_schedule_extra_node(self):
        """Schedule referencing unknown node should raise ValueError."""
        data = _valid_raw_plan()
        # Add a schedule item for a non-existent node
        data["schedule"].append({"order": 5, "node_id": "nonexistent"})
        with pytest.raises(ValueError, match=r"Schedule references unknown nodes"):
            RawPlanOutput.model_validate(data)

    def test_schedule_duplicate_node(self):
        """Schedule with duplicate node_ids should raise ValueError."""
        data = _valid_raw_plan()
        # Add a duplicate node_id to schedule
        data["schedule"].append({"order": 5, "node_id": "node_0"})
        with pytest.raises(ValueError, match=r"duplicate node_ids"):
            RawPlanOutput.model_validate(data)

    def test_schedule_not_sequential(self):
        """Schedule not sequential from 1 should be auto-corrected to start from 1."""
        data = _valid_raw_plan()
        # Start from order 2 instead of 1
        for item in data["schedule"]:
            item["order"] += 1
        # Should NOT raise - schedule should be auto-corrected
        validated = RawPlanOutput.model_validate(data)
        # Verify correction: orders should now be sequential from 1
        orders = [item.order for item in validated.schedule]
        assert orders == list(range(1, len(validated.schedule) + 1))

    def test_wrong_node_count_for_size(self):
        """Wrong node count for plan size should raise ValueError."""
        data = _valid_raw_plan()
        data["plan_size"] = "basic"
        # basic requires 4-12 nodes, create 13
        for i in range(4, 13):
            nid = f"node_{i}"
            data["nodes"].append({
                "node_id": nid,
                "title": f"Node {i} Title Here",
                "objectives": [f"Objective for node {i}"],
                "prerequisites": [],
                "estimated_minutes": 30,
            })
            data["schedule"].append({"order": i + 1, "node_id": nid})
        with pytest.raises(ValueError, match=r"requires 4-12 nodes, got 13"):
            RawPlanOutput.model_validate(data)

    def test_valid_plan_passes(self):
        """Valid plan should pass all integrity checks."""
        data = _valid_raw_plan()
        # Should not raise any errors
        validated = RawPlanOutput.model_validate(data)
        assert validated is not None
        assert len(validated.nodes) == 4

    def test_schedule_auto_corrected_to_topological_order(self):
        """Schedule with wrong order should be auto-corrected to valid topological order."""
        data = _valid_raw_plan()
        # Create a misordering: node_3 depends on node_2, but schedule has node_3 before node_2
        data["nodes"][3]["prerequisites"] = ["node_2"]  # node_3 depends on node_2

        # Deliberately misorder the schedule
        data["schedule"][2]["order"] = 4  # node_2 gets order 4
        data["schedule"][3]["order"] = 2  # node_3 gets order 2 (before its prerequisite!)

        # Should NOT raise - schedule should be auto-corrected
        validated = RawPlanOutput.model_validate(data)

        # Verify the correction: node_2 should come before node_3
        schedule_order = {item.node_id: item.order for item in validated.schedule}
        assert schedule_order["node_2"] < schedule_order["node_3"]
