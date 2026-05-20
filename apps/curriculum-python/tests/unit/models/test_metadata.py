"""Tests for shared artifact metadata validation."""

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.models.metadata import ArtifactMetadata


def _metadata_payload(**overrides) -> dict:
    payload = {
        "provider": "gemini",
        "model": "test-model",
        "prompt_version": "test/v1",
        "created_at": datetime.now(timezone.utc),
        "request_id": uuid4(),
        "raw_output_hash": "a" * 64,
        "artifact_hash": "b" * 64,
        "validation_retry_count": 0,
    }
    payload.update(overrides)
    return payload


@pytest.mark.parametrize("provider", ["gemini", "claude", "zai", "local", "none"])
def test_metadata_accepts_supported_providers(provider):
    metadata = ArtifactMetadata(**_metadata_payload(provider=provider))

    assert metadata.provider == provider


def test_metadata_rejects_unknown_provider():
    with pytest.raises(ValidationError):
        ArtifactMetadata(**_metadata_payload(provider="openai"))


def test_metadata_accepts_retry_count_above_default():
    metadata = ArtifactMetadata(**_metadata_payload(validation_retry_count=3))

    assert metadata.validation_retry_count == 3


def test_metadata_rejects_negative_retry_count():
    with pytest.raises(ValidationError):
        ArtifactMetadata(**_metadata_payload(validation_retry_count=-1))
