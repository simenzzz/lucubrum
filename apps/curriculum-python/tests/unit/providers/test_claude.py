"""Tests for src/providers/claude.py — ClaudeProvider."""

import pytest
from unittest.mock import AsyncMock

from tests.fixtures.llm_mocks import (
    create_claude_response,
    create_claude_multi_block_response,
    ClaudeTextBlock,
    ClaudeMessage,
)


class TestClaudeProvider:
    """Tests for ClaudeProvider initialization and generation."""

    @pytest.fixture(autouse=True)
    def _setup(self, monkeypatch, mock_claude_client):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key-123")
        self.mock_client = mock_claude_client

    def _make_provider(self, model=None):
        from src.providers.claude import ClaudeProvider
        return ClaudeProvider(model=model)

    def test_provider_name(self):
        provider = self._make_provider()
        assert provider.provider_name == "claude"

    def test_default_model_name(self, monkeypatch):
        monkeypatch.delenv("LLM_MODEL", raising=False)
        provider = self._make_provider()
        assert provider.model_name == "claude-3-sonnet-20240229"

    def test_custom_model_name(self):
        provider = self._make_provider(model="claude-3-opus-20240229")
        assert provider.model_name == "claude-3-opus-20240229"

    def test_model_from_env(self, monkeypatch):
        monkeypatch.setenv("LLM_MODEL", "claude-3-haiku-20240307")
        provider = self._make_provider()
        assert provider.model_name == "claude-3-haiku-20240307"

    def test_missing_api_key_raises(self, monkeypatch):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        with pytest.raises(ValueError, match="ANTHROPIC_API_KEY"):
            from src.providers.claude import ClaudeProvider
            ClaudeProvider()

    async def test_generate_success(self):
        provider = self._make_provider()
        self.mock_client.messages.create.return_value = create_claude_response(
            '{"plan": "test"}'
        )

        result = await provider.generate("Generate a plan", temperature=0.5)

        assert result == '{"plan": "test"}'
        self.mock_client.messages.create.assert_called_once()
        call_kwargs = self.mock_client.messages.create.call_args.kwargs
        assert call_kwargs["temperature"] == 0.5
        assert call_kwargs["messages"] == [{"role": "user", "content": "Generate a plan"}]

    async def test_generate_multiple_text_blocks(self):
        provider = self._make_provider()
        self.mock_client.messages.create.return_value = create_claude_multi_block_response(
            ["Hello", " World"]
        )

        result = await provider.generate("test")
        assert result == "Hello\n World"

    async def test_generate_passes_max_tokens(self):
        provider = self._make_provider()
        self.mock_client.messages.create.return_value = create_claude_response("ok")

        await provider.generate("test", max_tokens=2048)

        call_kwargs = self.mock_client.messages.create.call_args.kwargs
        assert call_kwargs["max_tokens"] == 2048
