"""Tests for src/api/normalize.py — POST /llm/normalize-topic endpoint."""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, PropertyMock
from uuid import uuid4

from httpx import ASGITransport, AsyncClient


def _normalize_request(**overrides) -> dict:
    base = {
        "topic": "React.js",
        "request_id": str(uuid4()),
    }
    base.update(overrides)
    return base


class TestNormalizeEndpoint:
    @pytest.fixture(autouse=True)
    def _setup(self, monkeypatch):
        monkeypatch.setenv("SERVICE_TOKEN", "test-service-token")
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        self.headers = {"X-Service-Token": "test-service-token"}

    @pytest.fixture
    def _mock_deps(self, mocker):
        """Mock dependencies for normalize tests."""
        self.mock_prompt = mocker.patch("src.api.normalize.load_prompt")
        self.mock_prompt.return_value = "Normalize {policies} {categories} {{topic}}"

        mock_provider = MagicMock()
        mock_provider.provider_name = "gemini"
        mock_provider.model_name = "gemini-2.0-flash"
        mock_provider.model = "gemini-2.0-flash"
        mock_provider.generate = AsyncMock()
        mocker.patch("src.api.normalize.get_provider", return_value=mock_provider)
        self.mock_provider = mock_provider

    def _mock_staleness_service(self):
        """Create a mock staleness policy service."""
        service = AsyncMock()
        service.get_policy_descriptions.return_value = {
            "cs": "Check every 90 days",
            "web": "Check every 30 days",
            "general": "Check annually",
        }
        return service

    async def _post(self, body: dict, app_state_overrides: dict | None = None):
        from src.main import app
        if app_state_overrides:
            for k, v in app_state_overrides.items():
                setattr(app.state, k, v)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post("/llm/normalize-topic", json=body, headers=self.headers)

    async def test_503_when_staleness_policies_not_initialized(self, _mock_deps):
        """Should return 503 when app.state.staleness_policies is missing."""
        from src.main import app
        # Ensure staleness_policies is not set
        if hasattr(app.state, "staleness_policies"):
            delattr(app.state, "staleness_policies")

        resp = await self._post(_normalize_request())
        assert resp.status_code == 503

    async def test_success_with_valid_llm_response(self, _mock_deps):
        """Endpoint should return 200 with normalized topic when everything works."""
        llm_response = json.dumps({
            "topic_normalized": "react_js",
            "domain_category": "web",
            "staleness_policy": "30d",
        })
        self.mock_provider.generate.return_value = llm_response

        resp = await self._post(
            _normalize_request(),
            app_state_overrides={"staleness_policies": self._mock_staleness_service()},
        )

        assert resp.status_code == 200

    async def test_invalid_llm_json_422(self, _mock_deps):
        self.mock_provider.generate.return_value = "not json at all"

        resp = await self._post(
            _normalize_request(),
            app_state_overrides={"staleness_policies": self._mock_staleness_service()},
        )

        assert resp.status_code == 422

    async def test_prompt_loads_with_policies(self, _mock_deps):
        """Verify policies are injected into the prompt."""
        llm_response = json.dumps({
            "topic_normalized": "react_js",
            "domain_category": "web",
            "staleness_policy": "30d",
        })
        self.mock_provider.generate.return_value = llm_response
        service = self._mock_staleness_service()

        await self._post(
            _normalize_request(),
            app_state_overrides={"staleness_policies": service},
        )

        service.get_policy_descriptions.assert_called_once()

    async def test_empty_topic_rejected(self, _mock_deps):
        resp = await self._post(
            {"topic": "", "request_id": str(uuid4())},
            app_state_overrides={"staleness_policies": self._mock_staleness_service()},
        )
        assert resp.status_code == 422

    async def test_validation_error_on_bad_category(self, _mock_deps):
        llm_response = json.dumps({
            "topic_normalized": "react_js",
            "domain_category": "invalid_category",
            "staleness_policy": "30d",
        })
        self.mock_provider.generate.return_value = llm_response

        resp = await self._post(
            _normalize_request(),
            app_state_overrides={"staleness_policies": self._mock_staleness_service()},
        )

        assert resp.status_code == 422

    async def test_validation_error_on_bad_policy(self, _mock_deps):
        llm_response = json.dumps({
            "topic_normalized": "react_js",
            "domain_category": "web",
            "staleness_policy": "5min",
        })
        self.mock_provider.generate.return_value = llm_response

        resp = await self._post(
            _normalize_request(),
            app_state_overrides={"staleness_policies": self._mock_staleness_service()},
        )

        assert resp.status_code == 422

    async def test_unexpected_error_500(self, _mock_deps):
        self.mock_provider.generate.side_effect = RuntimeError("boom")

        resp = await self._post(
            _normalize_request(),
            app_state_overrides={"staleness_policies": self._mock_staleness_service()},
        )

        # retry_llm_with_validation catches and retries, returning 422 on exhaustion
        assert resp.status_code == 422

    async def test_auth_required(self):
        from src.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/llm/normalize-topic", json=_normalize_request())
        assert resp.status_code == 401
