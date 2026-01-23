"""Transcript and video validation models for YouTube content analysis."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from .metadata import ArtifactMetadata


class TranscriptSegment(BaseModel):
    """A single timed segment of transcript."""

    start_seconds: float = Field(..., ge=0, description="Start time in seconds")
    duration_seconds: float = Field(..., ge=0, description="Segment duration in seconds")
    text: str = Field(..., min_length=1, description="Transcript text for this segment")


class Transcript(BaseModel):
    """Raw transcript data for a YouTube video."""

    schema_version: Literal["transcript.v1"] = "transcript.v1"
    video_id: str = Field(..., min_length=11, max_length=11, description="YouTube video ID")
    language: str = Field(default="en", description="Transcript language code")
    segments: list[TranscriptSegment] = Field(..., description="Timed transcript segments")
    full_text: str = Field(..., description="Concatenated transcript text")
    duration_seconds: int = Field(..., ge=0, description="Total video duration in seconds")
    fetch_source: Literal["youtube_transcript_api", "youtube_api", "manual"] = Field(
        ..., description="Source of the transcript data"
    )


class VideoValidation(BaseModel):
    """Result of validating a video against a learning topic."""

    schema_version: Literal["video_validation.v1"] = "video_validation.v1"
    video_id: str = Field(..., min_length=11, max_length=11, description="YouTube video ID")
    plan_id: UUID = Field(..., description="Associated plan UUID")
    node_id: str = Field(..., description="Associated node ID within the plan")
    is_relevant: bool = Field(..., description="Whether the video is relevant to the node")
    relevance_score: float = Field(
        ..., ge=0.0, le=1.0, description="Relevance score from 0.0 to 1.0"
    )
    matched_objectives: list[str] = Field(
        default_factory=list, description="Which node objectives this video covers"
    )
    rejection_reason: str | None = Field(
        default=None, description="If not relevant, explanation why"
    )
    metadata: ArtifactMetadata


class StalenessResult(BaseModel):
    """Result of checking if cached content is stale."""

    schema_version: Literal["staleness_result.v1"] = "staleness_result.v1"
    cache_key: str = Field(..., description="Cache key being checked")
    is_stale: bool = Field(..., description="Whether the content is considered stale")
    contradiction_rate: float = Field(
        ..., ge=0.0, le=1.0, description="Rate of contradictions found (0.0-1.0)"
    )
    stale_reason: str | None = Field(
        default=None, description="If stale, explanation why"
    )
    sources_checked: list[str] = Field(
        default_factory=list, description="List of sources that were checked"
    )
    contradictions_found: list[str] = Field(
        default_factory=list, description="Specific contradictions discovered"
    )
    metadata: ArtifactMetadata
