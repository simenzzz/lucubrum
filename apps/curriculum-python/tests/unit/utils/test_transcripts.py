"""Tests for src/utils/transcripts.py — YouTube transcript fetching."""

import pytest
from unittest.mock import patch, MagicMock

from src.utils.transcripts import (
    TranscriptFetcher,
    TranscriptNotAvailableError,
    fetch_transcript,
    truncate_transcript,
)
from src.models.transcript import Transcript, TranscriptSegment


# --- Helpers ---

MOCK_TRANSCRIPT_DATA = [
    {"start": 0.0, "duration": 5.0, "text": "Hello world"},
    {"start": 5.0, "duration": 3.0, "text": "Welcome to the tutorial"},
    {"start": 8.0, "duration": 4.0, "text": "Let's get started"},
]


def _make_transcript(full_text="Hello world. This is a test.", video_id="dQw4w9WgXcQ"):
    return Transcript(
        video_id=video_id,
        language="en",
        segments=[
            TranscriptSegment(start_seconds=0.0, duration_seconds=5.0, text="Hello world."),
            TranscriptSegment(start_seconds=5.0, duration_seconds=3.0, text="This is a test."),
        ],
        full_text=full_text,
        duration_seconds=8,
        fetch_source="youtube_transcript_api",
    )


# ============================================================
# TranscriptFetcher
# ============================================================


class TestTranscriptFetcher:
    @pytest.fixture
    def fetcher(self):
        return TranscriptFetcher()

    @patch("src.utils.transcripts.YouTubeTranscriptApi.get_transcript")
    async def test_fetch_success(self, mock_api, fetcher):
        mock_api.return_value = MOCK_TRANSCRIPT_DATA

        result = await fetcher.fetch("dQw4w9WgXcQ")

        assert result.video_id == "dQw4w9WgXcQ"
        assert len(result.segments) == 3
        assert result.full_text == "Hello world Welcome to the tutorial Let's get started"
        assert result.duration_seconds == 12  # 8 + 4
        assert result.fetch_source == "youtube_transcript_api"

    @patch("src.utils.transcripts.YouTubeTranscriptApi.get_transcript")
    async def test_fetch_with_language(self, mock_api, fetcher):
        mock_api.return_value = MOCK_TRANSCRIPT_DATA

        await fetcher.fetch("dQw4w9WgXcQ", language="es")

        mock_api.assert_called_once_with("dQw4w9WgXcQ", languages=["es"])

    @patch("src.utils.transcripts.YouTubeTranscriptApi.get_transcript")
    async def test_fetch_no_transcript_found(self, mock_api, fetcher):
        from youtube_transcript_api._errors import NoTranscriptFound
        mock_api.side_effect = NoTranscriptFound("vid", ["en"], {})

        with pytest.raises(TranscriptNotAvailableError) as exc_info:
            await fetcher.fetch("dQw4w9WgXcQ")
        assert exc_info.value.video_id == "dQw4w9WgXcQ"

    @patch("src.utils.transcripts.YouTubeTranscriptApi.get_transcript")
    async def test_fetch_transcripts_disabled(self, mock_api, fetcher):
        from youtube_transcript_api._errors import TranscriptsDisabled
        mock_api.side_effect = TranscriptsDisabled("dQw4w9WgXcQ")

        with pytest.raises(TranscriptNotAvailableError) as exc_info:
            await fetcher.fetch("dQw4w9WgXcQ")
        assert "disabled" in exc_info.value.reason.lower()

    @patch("src.utils.transcripts.YouTubeTranscriptApi.get_transcript")
    async def test_fetch_video_unavailable(self, mock_api, fetcher):
        from youtube_transcript_api._errors import VideoUnavailable
        mock_api.side_effect = VideoUnavailable("dQw4w9WgXcQ")

        with pytest.raises(TranscriptNotAvailableError) as exc_info:
            await fetcher.fetch("dQw4w9WgXcQ")
        assert "unavailable" in exc_info.value.reason.lower()

    @patch("src.utils.transcripts.YouTubeTranscriptApi.get_transcript")
    async def test_fetch_batch_mixed(self, mock_api, fetcher):
        def side_effect(vid, languages=None):
            if vid == "good_vid_1234":
                return MOCK_TRANSCRIPT_DATA
            from youtube_transcript_api._errors import VideoUnavailable
            raise VideoUnavailable(vid)

        mock_api.side_effect = side_effect

        results = await fetcher.fetch_batch(["good_vid_1234", "bad_video_123"])

        assert isinstance(results["good_vid_1234"], Transcript)
        assert isinstance(results["bad_video_123"], TranscriptNotAvailableError)

    def test_default_languages(self, fetcher):
        assert fetcher.preferred_languages == ["en", "en-US", "en-GB"]

    def test_custom_languages(self):
        fetcher = TranscriptFetcher(preferred_languages=["es", "fr"])
        assert fetcher.preferred_languages == ["es", "fr"]


# ============================================================
# truncate_transcript
# ============================================================


class TestTruncateTranscript:
    def test_short_text_unchanged(self):
        transcript = _make_transcript("Short text.")
        assert truncate_transcript(transcript, max_chars=100) == "Short text."

    def test_truncates_at_sentence_boundary(self):
        long_text = "First sentence. " * 50 + "Last sentence."
        transcript = _make_transcript(long_text)
        result = truncate_transcript(transcript, max_chars=100)
        assert result.endswith(".")
        assert len(result) <= 100

    def test_truncates_long_text(self):
        long_text = "a " * 5000
        transcript = _make_transcript(long_text)
        result = truncate_transcript(transcript, max_chars=100)
        assert len(result) <= 103  # 100 + "..."
