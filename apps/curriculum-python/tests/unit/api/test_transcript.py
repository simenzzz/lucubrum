"""Tests for src/api/transcript.py — POST /llm/transcript endpoint."""

import pytest
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from httpx import ASGITransport, AsyncClient

from src.models.transcript import Transcript, TranscriptSegment
from src.utils.transcripts import TranscriptNotAvailableError


def _transcript_request(**overrides) -> dict:
    base = {"video_id": "dQw4w9WgXcQ"}
    base.update(overrides)
    return base


def _mock_transcript() -> Transcript:
    return Transcript(
        video_id="dQw4w9WgXcQ",
        language="en",
        segments=[
            TranscriptSegment(start_seconds=0.0, duration_seconds=5.0, text="Hello world"),
        ],
        full_text="Hello world",
        duration_seconds=5,
        fetch_source="youtube_transcript_api",
    )


class TestTranscriptEndpoint:
    @pytest.fixture(autouse=True)
    def _setup(self, monkeypatch):
        monkeypatch.setenv("SERVICE_TOKEN", "test-token")
        self.headers = {"X-Service-Token": "test-token"}

    async def _post(self, body: dict):
        from src.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post("/llm/transcript", json=body, headers=self.headers)

    @patch("src.api.transcript.fetch_transcript", new_callable=AsyncMock)
    async def test_success(self, mock_fetch):
        mock_fetch.return_value = _mock_transcript()

        resp = await self._post(_transcript_request())

        assert resp.status_code == 200
        data = resp.json()["transcript"]
        assert data["video_id"] == "dQw4w9WgXcQ"
        assert len(data["segments"]) == 1

    @patch("src.api.transcript.fetch_transcript", new_callable=AsyncMock)
    async def test_with_language(self, mock_fetch):
        mock_fetch.return_value = _mock_transcript()

        resp = await self._post(_transcript_request(language="es"))

        assert resp.status_code == 200
        mock_fetch.assert_called_with("dQw4w9WgXcQ", "es")

    @patch("src.api.transcript.fetch_transcript", new_callable=AsyncMock)
    async def test_not_available_404(self, mock_fetch):
        mock_fetch.side_effect = TranscriptNotAvailableError("dQw4w9WgXcQ", "disabled")

        resp = await self._post(_transcript_request())

        assert resp.status_code == 404
        detail = resp.json()["detail"]
        assert detail["error"] == "TRANSCRIPT_NOT_AVAILABLE"
        assert detail["video_id"] == "dQw4w9WgXcQ"

    @patch("src.api.transcript.fetch_transcript", new_callable=AsyncMock)
    async def test_unexpected_error_500(self, mock_fetch):
        mock_fetch.side_effect = RuntimeError("unexpected")

        resp = await self._post(_transcript_request())

        assert resp.status_code == 500

    async def test_video_id_length_validation(self):
        resp = await self._post({"video_id": "short"})
        assert resp.status_code == 422

    async def test_auth_required(self):
        from src.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/llm/transcript", json=_transcript_request())
        assert resp.status_code == 401
