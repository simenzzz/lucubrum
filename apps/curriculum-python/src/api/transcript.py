"""Transcript fetching API endpoint."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..models.transcript import Transcript
from ..utils.transcripts import fetch_transcript, TranscriptNotAvailableError

router = APIRouter(prefix="/llm", tags=["transcripts"])


class TranscriptRequest(BaseModel):
    """Request body for transcript fetching."""

    video_id: str = Field(
        ..., min_length=11, max_length=11, description="YouTube video ID"
    )
    language: str | None = Field(
        default=None, description="Preferred language code (e.g., 'en')"
    )


class TranscriptResponse(BaseModel):
    """Response body for transcript fetching."""

    transcript: Transcript


@router.post("/transcript", response_model=TranscriptResponse)
async def get_transcript(request: TranscriptRequest) -> TranscriptResponse:
    """Fetch the transcript for a YouTube video.

    Args:
        request: Request containing video_id and optional language.

    Returns:
        TranscriptResponse containing the transcript data.

    Raises:
        HTTPException(404): If transcript is not available.
        HTTPException(500): On unexpected errors.
    """
    try:
        transcript = await fetch_transcript(request.video_id, request.language)
        return TranscriptResponse(transcript=transcript)
    except TranscriptNotAvailableError as e:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "TRANSCRIPT_NOT_AVAILABLE",
                "message": str(e),
                "video_id": e.video_id,
                "reason": e.reason,
            },
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "INTERNAL_ERROR",
                "message": f"Unexpected error fetching transcript: {str(e)}",
            },
        )
