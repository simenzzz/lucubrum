"""Mock fixtures for LLM provider clients."""

from dataclasses import dataclass
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest


# --- Claude mock helpers ---


@dataclass
class ClaudeTextBlock:
    """Mimics an Anthropic TextBlock."""

    text: str
    type: str = "text"


@dataclass
class ClaudeMessage:
    """Mimics an Anthropic Message response."""

    content: list[ClaudeTextBlock]
    id: str = "msg_test"
    model: str = "claude-3-sonnet-20240229"
    role: str = "assistant"
    stop_reason: str = "end_turn"


def create_claude_response(content: str) -> ClaudeMessage:
    """Create a mock Claude API response with the given text content."""
    return ClaudeMessage(content=[ClaudeTextBlock(text=content)])


def create_claude_multi_block_response(blocks: list[str]) -> ClaudeMessage:
    """Create a mock Claude response with multiple text blocks."""
    return ClaudeMessage(content=[ClaudeTextBlock(text=t) for t in blocks])


@pytest.fixture
def mock_claude_client(mocker):
    """Patch anthropic.AsyncAnthropic and return the mock client.

    Usage:
        def test_something(mock_claude_client):
            mock_claude_client.messages.create.return_value = create_claude_response('{"key": "val"}')
    """
    mock_client = AsyncMock()
    mock_client.messages.create = AsyncMock()
    mocker.patch(
        "src.providers.claude.anthropic.AsyncAnthropic",
        return_value=mock_client,
    )
    return mock_client


# --- Gemini mock helpers ---


@dataclass
class GeminiResponse:
    """Mimics a google.genai GenerateContentResponse."""

    text: str


def create_gemini_response(content: str) -> GeminiResponse:
    """Create a mock Gemini API response with the given text content."""
    return GeminiResponse(text=content)


@pytest.fixture
def mock_gemini_client(mocker):
    """Patch google.genai.Client and return the mock client.

    Usage:
        def test_something(mock_gemini_client):
            mock_gemini_client.aio.models.generate_content.return_value = create_gemini_response('{}')
    """
    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock()
    mocker.patch(
        "src.providers.gemini.genai.Client",
        return_value=mock_client,
    )
    return mock_client
