"""Tests for src/api/validate_video.py — POST /llm/validate-video endpoint."""

import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from httpx import ASGITransport, AsyncClient

from src.api.validate_video import RawVideoValidationOutput
from src.utils.retry import RetryResult


def _validate_request(**overrides) -> dict:
    base = {
        "video_id": "dQw4w9WgXcQ",
        "plan_id": str(uuid4()),
        "node_id": "intro_node",
        "node_title": "Variables and Types",
        "node_objectives": ["Understand variables", "Learn data types"],
        "content_text": "In this video we will learn about variables and types in JavaScript.",
        "video_title": "JavaScript Tutorial",
        "channel_name": "Code Academy",
        "request_id": str(uuid4()),
    }
    base.update(overrides)
    return base


def _success_result(
    is_relevant: bool = True,
    relevance_score: float = 0.85,
    matched_objectives: list[str] | None = None,
    rejection_reason: str | None = None,
    retry_count: int = 0,
) -> RetryResult[RawVideoValidationOutput]:
    """Build a successful RetryResult for mocking."""
    value = RawVideoValidationOutput(
        is_relevant=is_relevant,
        relevance_score=relevance_score,
        matched_objectives=matched_objectives or [],
        rejection_reason=rejection_reason,
    )
    return RetryResult(
        success=True,
        value=value,
        raw_output=value.model_dump_json(),
        retry_count=retry_count,
        attempts=[],
    )


def _failure_result(
    errors: list[str] | None = None,
    retry_count: int = 2,
) -> RetryResult[RawVideoValidationOutput]:
    """Build a failed RetryResult for mocking."""
    return RetryResult(
        success=False,
        value=None,
        raw_output="bad json",
        retry_count=retry_count,
        attempts=[],
        final_errors=errors or ["JSON parse error: Expecting value"],
    )


class TestValidateVideoEndpoint:
    @pytest.fixture(autouse=True)
    def _setup(self, monkeypatch):
        monkeypatch.setenv("SERVICE_TOKEN", "test-service-token")
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        self.headers = {"X-Service-Token": "test-service-token"}

    @pytest.fixture
    def _mock_deps(self, mocker):
        self.mock_prompt = mocker.patch("src.api.validate_video.load_prompt")
        self.mock_prompt.return_value = "prompt template {node_title} {validation_errors}"

        mock_provider = MagicMock()
        mock_provider.provider_name = "gemini"
        mock_provider.model_name = "gemini-2.0-flash"
        mocker.patch("src.api.validate_video.get_provider", return_value=mock_provider)
        self.mock_provider = mock_provider

        self.mock_retry = mocker.patch(
            "src.api.validate_video.retry_llm_with_validation",
            new_callable=AsyncMock,
        )

    async def _post(self, body: dict):
        from src.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post("/llm/validate-video", json=body, headers=self.headers)

    async def test_success_relevant(self, _mock_deps):
        self.mock_retry.return_value = _success_result(
            is_relevant=True,
            relevance_score=0.85,
            matched_objectives=["Understand variables"],
        )

        resp = await self._post(_validate_request())

        assert resp.status_code == 200
        val = resp.json()["validation"]
        assert val["is_relevant"] is True
        assert val["relevance_score"] == 0.85
        assert "Understand variables" in val["matched_objectives"]

    async def test_success_not_relevant(self, _mock_deps):
        self.mock_retry.return_value = _success_result(
            is_relevant=False,
            relevance_score=0.2,
            matched_objectives=[],
            rejection_reason="Video is about cooking, not programming",
        )

        resp = await self._post(_validate_request())

        val = resp.json()["validation"]
        assert val["is_relevant"] is False
        assert val["rejection_reason"] is not None

    async def test_metadata_present(self, _mock_deps):
        self.mock_retry.return_value = _success_result(
            is_relevant=True, relevance_score=0.9
        )

        resp = await self._post(_validate_request())

        meta = resp.json()["validation"]["metadata"]
        assert meta["prompt_version"] == "validate_video/v2"
        assert len(meta["raw_output_hash"]) == 64

    async def test_invalid_json_422(self, _mock_deps):
        self.mock_retry.return_value = _failure_result(
            errors=["JSON parse error: Expecting value"]
        )

        resp = await self._post(_validate_request())

        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert detail["error"] == "VALIDATION_FAILED"
        assert detail["attempts"] == 3  # retry_count=2 → total_attempts=3

    async def test_retry_count_in_metadata(self, _mock_deps):
        self.mock_retry.return_value = _success_result(retry_count=1)

        resp = await self._post(_validate_request())

        meta = resp.json()["validation"]["metadata"]
        assert meta["validation_retry_count"] == 1

    async def test_description_validation(self, _mock_deps):
        self.mock_retry.return_value = _success_result(relevance_score=0.5)

        brief_description = "Learn JavaScript variables and types."
        resp = await self._post(_validate_request(content_text=brief_description))

        assert resp.status_code == 200

    async def test_video_id_must_be_11_chars(self, _mock_deps):
        resp = await self._post(_validate_request(video_id="short"))
        assert resp.status_code == 422

    async def test_optional_fields_none(self, _mock_deps):
        """Test that video_title and channel_name can be None/null."""
        self.mock_retry.return_value = _success_result(
            matched_objectives=["Understand variables"]
        )

        resp = await self._post(_validate_request(video_title=None, channel_name=None))
        assert resp.status_code == 200

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
