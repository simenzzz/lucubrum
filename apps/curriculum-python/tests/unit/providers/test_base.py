"""Tests for src/providers/base.py — get_provider factory."""

import pytest


class TestGetProvider:
    """Test the provider factory function."""

    def test_default_returns_gemini(self, monkeypatch, mock_gemini_client):
        monkeypatch.delenv("LLM_PROVIDER", raising=False)
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        from src.providers.base import get_provider
        provider = get_provider()
        assert provider.provider_name == "gemini"

    def test_gemini_explicit(self, monkeypatch, mock_gemini_client):
        monkeypatch.setenv("LLM_PROVIDER", "gemini")
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        from src.providers.base import get_provider
        provider = get_provider()
        assert provider.provider_name == "gemini"

    def test_claude_explicit(self, monkeypatch, mock_claude_client):
        monkeypatch.setenv("LLM_PROVIDER", "claude")
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        from src.providers.base import get_provider
        provider = get_provider()
        assert provider.provider_name == "claude"

    def test_unsupported_provider_raises(self, monkeypatch):
        monkeypatch.setenv("LLM_PROVIDER", "openai")
        from src.providers.base import get_provider
        with pytest.raises(ValueError, match="Unsupported LLM provider"):
            get_provider()

    def test_case_insensitive(self, monkeypatch, mock_gemini_client):
        monkeypatch.setenv("LLM_PROVIDER", "GEMINI")
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        from src.providers.base import get_provider
        provider = get_provider()
        assert provider.provider_name == "gemini"
