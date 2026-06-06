"""Tests for src/api/staleness.py — POST /llm/check-staleness endpoint."""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from httpx import ASGITransport, AsyncClient


def _staleness_request(**overrides) -> dict:
    base = {
        "cache_key": "plan:javascript-basics:beginner",
        "topic": "JavaScript Basics",
        "plan_summary": "A beginner plan covering variables, functions, and DOM.",
        "resources": [
            {"video_id": "dQw4w9WgXcQ", "title": "JS Tutorial", "transcript_excerpt": "var is old..."},
        ],
        "mcp_facts": ["ES2024 adds new array methods", "let/const are preferred over var"],
        "request_id": str(uuid4()),
    }
    base.update(overrides)
    return base


class TestStalenessEndpoint:
    @pytest.fixture(autouse=True)
    def _setup(self, monkeypatch):
        monkeypatch.setenv("SERVICE_TOKEN", "test-service-token")
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        self.headers = {"X-Service-Token": "test-service-token"}

    @pytest.fixture
    def _mock_deps(self, mocker):
        self.mock_prompt = mocker.patch("src.api.staleness.load_prompt")
        self.mock_prompt.return_value = "{topic} {plan_summary} {resources_text} {mcp_facts}"
        self.mock_format = mocker.patch("src.api.staleness.format_prompt")
        self.mock_format.return_value = "formatted prompt"

        mock_provider = MagicMock()
        mock_provider.provider_name = "gemini"
        mock_provider.model_name = "gemini-2.0-flash"
        mock_provider.generate = AsyncMock()
        mocker.patch("src.api.staleness.get_provider", return_value=mock_provider)
        self.mock_provider = mock_provider

    async def _post(self, body: dict):
        from src.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post("/llm/check-staleness", json=body, headers=self.headers)

    async def test_no_facts_returns_not_stale(self):
        """No MCP facts → not stale, no LLM call."""
        resp = await self._post(_staleness_request(mcp_facts=[]))
        assert resp.status_code == 200
        result = resp.json()["result"]
        assert result["is_stale"] is False
        assert result["contradiction_rate"] == 0.0

    async def test_success_not_stale(self, _mock_deps):
        llm_response = json.dumps({
            "contradictions_found": [],
            "sources_checked": ["llm_knowledge"],
            "stale_reason": None,
        })
        self.mock_provider.generate.return_value = llm_response

        resp = await self._post(_staleness_request())

        assert resp.status_code == 200
        result = resp.json()["result"]
        assert result["is_stale"] is False
        assert result["contradiction_rate"] == 0.0

    async def test_success_stale(self, _mock_deps, monkeypatch):
        monkeypatch.setenv("STALENESS_CONTRADICTION_THRESHOLD", "0.10")
        # 2 facts, 1 contradiction → rate 0.5 >= 0.10 → stale
        llm_response = json.dumps({
            "contradictions_found": ["var is deprecated in favor of let/const"],
            "sources_checked": ["llm_knowledge"],
            "stale_reason": "Outdated variable declaration advice",
        })
        self.mock_provider.generate.return_value = llm_response

        resp = await self._post(_staleness_request())

        assert resp.status_code == 200
        result = resp.json()["result"]
        assert result["is_stale"] is True
        assert result["contradiction_rate"] > 0

    async def test_contradiction_rate_calculation(self, _mock_deps):
        # 2 mcp_facts, 1 contradiction → rate = 1/2 = 0.5
        llm_response = json.dumps({
            "contradictions_found": ["one contradiction"],
            "sources_checked": ["src1"],
        })
        self.mock_provider.generate.return_value = llm_response

        resp = await self._post(_staleness_request())

        result = resp.json()["result"]
        assert result["contradiction_rate"] == 0.5

    async def test_invalid_json_422(self, _mock_deps):
        self.mock_provider.generate.return_value = "not valid json at all"

        resp = await self._post(_staleness_request())

        assert resp.status_code == 422
        assert "invalid response" in resp.json()["detail"]["message"]

    async def test_markdown_code_block_handled(self, _mock_deps):
        llm_response = '```json\n{"contradictions_found": [], "sources_checked": []}\n```'
        self.mock_provider.generate.return_value = llm_response

        resp = await self._post(_staleness_request())

        assert resp.status_code == 200

    async def test_prompt_not_found_500(self, _mock_deps):
        self.mock_prompt.side_effect = FileNotFoundError("staleness/v1 not found")

        resp = await self._post(_staleness_request())

        assert resp.status_code == 500

    async def test_auth_required(self):
        from src.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/llm/check-staleness", json=_staleness_request())
        assert resp.status_code == 401
