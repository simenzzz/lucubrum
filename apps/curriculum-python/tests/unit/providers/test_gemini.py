"""Tests for src/providers/gemini.py — GeminiProvider."""

import pytest
from unittest.mock import AsyncMock

from tests.fixtures.llm_mocks import create_gemini_response


class TestGeminiProvider:
    """Tests for GeminiProvider initialization and generation."""

    @pytest.fixture(autouse=True)
    def _setup(self, monkeypatch, mock_gemini_client):
        monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")
        monkeypatch.delenv("LLM_MODEL", raising=False)
        self.mock_client = mock_gemini_client

    def _make_provider(self, model=None):
        from src.providers.gemini import GeminiProvider
        return GeminiProvider(model=model)

    def test_provider_name(self):
        provider = self._make_provider()
        assert provider.provider_name == "gemini"

    def test_default_model_name(self, monkeypatch):
        monkeypatch.delenv("LLM_MODEL", raising=False)
        provider = self._make_provider()
        assert provider.model_name == "gemini-2.0-flash"

    def test_custom_model_name(self):
        provider = self._make_provider(model="gemini-1.5-pro")
        assert provider.model_name == "gemini-1.5-pro"

    def test_model_from_env(self, monkeypatch):
        monkeypatch.setenv("LLM_MODEL", "gemini-1.5-pro-latest")
        provider = self._make_provider()
        assert provider.model_name == "gemini-1.5-pro-latest"

    def test_missing_api_key_raises(self, monkeypatch):
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        with pytest.raises(ValueError, match="GEMINI_API_KEY"):
            from src.providers.gemini import GeminiProvider
            GeminiProvider()

    async def test_generate_success(self):
        provider = self._make_provider()
        self.mock_client.aio.models.generate_content.return_value = create_gemini_response(
            '{"plan": "test"}'
        )

        result = await provider.generate("Generate a plan", temperature=0.5)

        assert result == '{"plan": "test"}'
        self.mock_client.aio.models.generate_content.assert_called_once()
        call_kwargs = self.mock_client.aio.models.generate_content.call_args.kwargs
        assert call_kwargs["model"] == "gemini-2.0-flash"
        assert call_kwargs["contents"] == "Generate a plan"

    async def test_generate_passes_config(self):
        provider = self._make_provider()
        self.mock_client.aio.models.generate_content.return_value = create_gemini_response("ok")

        await provider.generate("test", temperature=0.3, max_tokens=1024)

        call_kwargs = self.mock_client.aio.models.generate_content.call_args.kwargs
        config = call_kwargs["config"]
        assert config.temperature == 0.3
        assert config.max_output_tokens == 1024

    async def test_generate_returns_text(self):
        provider = self._make_provider()
        self.mock_client.aio.models.generate_content.return_value = create_gemini_response(
            "Simple text response"
        )

        result = await provider.generate("test")
        assert result == "Simple text response"
