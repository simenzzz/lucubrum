"""Artifact metadata model for audit and reproducibility."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class ArtifactMetadata(BaseModel):
    """Metadata attached to every LLM-generated artifact for auditing."""

    provider: Literal["gemini", "claude"]
    model: str
    prompt_version: str = Field(..., description="e.g., 'plan/v1'")
    created_at: datetime
    request_id: UUID
    raw_output_hash: str = Field(
        ..., description="SHA-256 hash of raw LLM response (64 hex chars)"
    )
    artifact_hash: str = Field(
        ..., description="SHA-256 hash of validated JSON artifact (64 hex chars)"
    )
    validation_retry_count: int = Field(
        ..., ge=0, le=2, description="Number of schema retries (0-2)"
    )

    @field_validator("raw_output_hash", "artifact_hash")
    @classmethod
    def validate_sha256_hash(cls, v: str) -> str:
        """Validate that the hash is a valid SHA-256 hex string."""
        import re

        if not re.match(r"^[a-f0-9]{64}$", v):
            raise ValueError("Hash must be a 64-character lowercase hex string (SHA-256)")
        return v
