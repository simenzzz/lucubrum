"""YouTube transcript fetching utility.

Supports multiple backends:
1. youtube-transcript-api (primary - free, no API key)
2. Manual/cached transcripts (for testing)
"""

import asyncio
from functools import lru_cache

from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    NoTranscriptFound,
    TranscriptsDisabled,
    VideoUnavailable,
)

from ..models.transcript import Transcript, TranscriptSegment


class TranscriptNotAvailableError(Exception):
    """Raised when a transcript cannot be fetched for a video."""

    def __init__(self, video_id: str, reason: str):
        self.video_id = video_id
        self.reason = reason
        super().__init__(f"Transcript unavailable for {video_id}: {reason}")


class TranscriptFetcher:
    """Fetches YouTube video transcripts."""

    def __init__(self, preferred_languages: list[str] | None = None):
        """Initialize the transcript fetcher.

        Args:
            preferred_languages: List of language codes in order of preference.
                                Defaults to ["en", "en-US", "en-GB"].
        """
        self.preferred_languages = preferred_languages or ["en", "en-US", "en-GB"]

    async def fetch(self, video_id: str, language: str | None = None) -> Transcript:
        """Fetch transcript for a YouTube video.

        Args:
            video_id: The 11-character YouTube video ID.
            language: Optional specific language code. If not provided,
                     uses preferred_languages list.

        Returns:
            Transcript object with segments and full text.

        Raises:
            TranscriptNotAvailableError: If transcript cannot be fetched.
        """
        languages = [language] if language else self.preferred_languages

        # Run the blocking call in a thread pool
        loop = asyncio.get_event_loop()
        try:
            transcript_list = await loop.run_in_executor(
                None,
                lambda: YouTubeTranscriptApi.get_transcript(video_id, languages=languages),
            )
        except NoTranscriptFound as e:
            raise TranscriptNotAvailableError(
                video_id, f"No transcript found for languages {languages}: {e}"
            )
        except TranscriptsDisabled:
            raise TranscriptNotAvailableError(
                video_id, "Transcripts are disabled for this video"
            )
        except VideoUnavailable:
            raise TranscriptNotAvailableError(video_id, "Video is unavailable")
        except Exception as e:
            raise TranscriptNotAvailableError(video_id, str(e))

        # Convert to our segment format
        segments = [
            TranscriptSegment(
                start_seconds=item["start"],
                duration_seconds=item["duration"],
                text=item["text"],
            )
            for item in transcript_list
        ]

        # Build full text
        full_text = " ".join(item["text"] for item in transcript_list)

        # Calculate total duration
        if transcript_list:
            last_segment = transcript_list[-1]
            total_duration = int(last_segment["start"] + last_segment["duration"])
        else:
            total_duration = 0

        # Detect actual language from first segment (if available)
        actual_language = language or self.preferred_languages[0]

        return Transcript(
            video_id=video_id,
            language=actual_language,
            segments=segments,
            full_text=full_text,
            duration_seconds=total_duration,
            fetch_source="youtube_transcript_api",
        )

    async def fetch_batch(
        self, video_ids: list[str], language: str | None = None
    ) -> dict[str, Transcript | TranscriptNotAvailableError]:
        """Fetch transcripts for multiple videos concurrently.

        Args:
            video_ids: List of YouTube video IDs.
            language: Optional specific language code.

        Returns:
            Dictionary mapping video_id to either Transcript or error.
        """
        results: dict[str, Transcript | TranscriptNotAvailableError] = {}

        async def fetch_one(vid: str) -> tuple[str, Transcript | TranscriptNotAvailableError]:
            try:
                transcript = await self.fetch(vid, language)
                return vid, transcript
            except TranscriptNotAvailableError as e:
                return vid, e

        tasks = [fetch_one(vid) for vid in video_ids]
        completed = await asyncio.gather(*tasks)

        for vid, result in completed:
            results[vid] = result

        return results


# Module-level convenience functions
_default_fetcher = TranscriptFetcher()


async def fetch_transcript(video_id: str, language: str | None = None) -> Transcript:
    """Convenience function to fetch a transcript using the default fetcher.

    Args:
        video_id: The 11-character YouTube video ID.
        language: Optional specific language code.

    Returns:
        Transcript object.

    Raises:
        TranscriptNotAvailableError: If transcript cannot be fetched.
    """
    return await _default_fetcher.fetch(video_id, language)


def truncate_transcript(transcript: Transcript, max_chars: int = 8000) -> str:
    """Truncate transcript text for LLM context windows.

    Attempts to truncate at sentence boundaries when possible.

    Args:
        transcript: The transcript to truncate.
        max_chars: Maximum character count.

    Returns:
        Truncated text string.
    """
    text = transcript.full_text

    if len(text) <= max_chars:
        return text

    # Try to find a sentence boundary near the limit
    truncated = text[:max_chars]

    # Look for the last sentence-ending punctuation
    for punct in [". ", "! ", "? "]:
        last_idx = truncated.rfind(punct)
        if last_idx > max_chars * 0.8:  # Don't cut too much
            return truncated[: last_idx + 1]

    # Fall back to word boundary
    last_space = truncated.rfind(" ")
    if last_space > max_chars * 0.9:
        return truncated[:last_space] + "..."

    return truncated + "..."
