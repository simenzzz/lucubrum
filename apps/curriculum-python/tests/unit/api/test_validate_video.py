"""Tests for src/api/validate_video.py — POST /llm/validate-video endpoint."""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from httpx import ASGITransport, AsyncClient


def _validate_request(**overrides) -> dict:
    base = {
        "video_id": "dQw4w9WgXcQ",
        "plan_id": str(uuid4()),
        "node_id": "intro_node",
        "node_title": "Variables and Types",
        "node_objectives": ["Understand variables", "Learn data types"],
        "transcript_text": "In this video we will learn about variables and types in JavaScript.",
        "request_id": str(uuid4()),
    }
    base.update(overrides)
    return base


class TestValidateVideoEndpoint:
    @pytest.fixture(autouse=True)
    def _setup(self, monkeypatch):
        monkeypatch.setenv("SERVICE_TOKEN", "test-token")
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        self.headers = {"X-Service-Token": "test-token"}

    @pytest.fixture
    def _mock_deps(self, mocker):
        self.mock_prompt = mocker.patch("src.api.validate_video.load_prompt")
        self.mock_prompt.return_value = "{node_title} {node_objectives} {transcript_excerpt}"
        self.mock_format = mocker.patch("src.api.validate_video.format_prompt")
        self.mock_format.return_value = "formatted prompt"

        mock_provider = MagicMock()
        mock_provider.provider_name = "gemini"
        mock_provider.model_name = "gemini-2.0-flash"
        mock_provider.generate = AsyncMock()
        mocker.patch("src.api.validate_video.get_provider", return_value=mock_provider)
        self.mock_provider = mock_provider

    async def _post(self, body: dict):
        from src.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post("/llm/validate-video", json=body, headers=self.headers)

    async def test_success_relevant(self, _mock_deps):
        llm_response = json.dumps({
            "is_relevant": True,
            "relevance_score": 0.85,
            "matched_objectives": ["Understand variables"],
            "rejection_reason": None,
        })
        self.mock_provider.generate.return_value = llm_response

        resp = await self._post(_validate_request())

        assert resp.status_code == 200
        val = resp.json()["validation"]
        assert val["is_relevant"] is True
        assert val["relevance_score"] == 0.85
        assert "Understand variables" in val["matched_objectives"]

    async def test_success_not_relevant(self, _mock_deps):
        llm_response = json.dumps({
            "is_relevant": False,
            "relevance_score": 0.2,
            "matched_objectives": [],
            "rejection_reason": "Video is about cooking, not programming",
        })
        self.mock_provider.generate.return_value = llm_response

        resp = await self._post(_validate_request())

        val = resp.json()["validation"]
        assert val["is_relevant"] is False
        assert val["rejection_reason"] is not None

    async def test_metadata_present(self, _mock_deps):
        llm_response = json.dumps({
            "is_relevant": True, "relevance_score": 0.9,
            "matched_objectives": [], "rejection_reason": None,
        })
        self.mock_provider.generate.return_value = llm_response

        resp = await self._post(_validate_request())

        meta = resp.json()["validation"]["metadata"]
        assert meta["prompt_version"] == "validate_video/v1"
        assert len(meta["raw_output_hash"]) == 64

    async def test_invalid_json_422(self, _mock_deps):
        self.mock_provider.generate.return_value = "not json"

        resp = await self._post(_validate_request())

        assert resp.status_code == 422

    async def test_transcript_truncation(self, _mock_deps):
        llm_response = json.dumps({
            "is_relevant": True, "relevance_score": 0.5,
            "matched_objectives": [], "rejection_reason": None,
        })
        self.mock_provider.generate.return_value = llm_response

        long_transcript = "A" * 10000
        resp = await self._post(_validate_request(transcript_text=long_transcript))

        assert resp.status_code == 200

    async def test_video_id_must_be_11_chars(self, _mock_deps):
        resp = await self._post(_validate_request(video_id="short"))
        assert resp.status_code == 422

    async def test_prompt_not_found_500(self, _mock_deps):
        self.mock_prompt.side_effect = FileNotFoundError("not found")
        resp = await self._post(_validate_request())
        assert resp.status_code == 500

    async def test_auth_required(self):
        from src.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/llm/validate-video", json=_validate_request())
        assert resp.status_code == 401
