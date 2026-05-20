"""Tests for src/providers/zai.py - ZaiProvider."""

import pytest

from tests.fixtures.llm_mocks import ZaiResponse, create_zai_response


class TestZaiProvider:
    """Tests for ZaiProvider initialization and generation."""

    @pytest.fixture(autouse=True)
    def _setup(self, monkeypatch, mock_zai_client):
        monkeypatch.setenv("ZAI_API_KEY", "test-zai-key")
        monkeypatch.delenv("ZAI_BASE_URL", raising=False)
        monkeypatch.delenv("LLM_MODEL", raising=False)
        self.mock_client = mock_zai_client

        async def inline_to_thread(func, /, *args, **kwargs):
            return func(*args, **kwargs)

        monkeypatch.setattr("src.providers.zai.asyncio.to_thread", inline_to_thread)

    def _make_provider(self, model=None):
        from src.providers.zai import ZaiProvider
        return ZaiProvider(model=model)

    def test_provider_name(self):
        provider = self._make_provider()
        assert provider.provider_name == "zai"

    def test_default_model_name(self):
        provider = self._make_provider()
        assert provider.model_name == "glm-5.1"

    def test_custom_model_name(self):
        provider = self._make_provider(model="glm-4.7")
        assert provider.model_name == "glm-4.7"

    def test_model_from_env(self, monkeypatch):
        monkeypatch.setenv("LLM_MODEL", "glm-5-air")
        provider = self._make_provider()
        assert provider.model_name == "glm-5-air"

    def test_base_url_from_env(self, monkeypatch, mocker):
        monkeypatch.setenv("ZAI_BASE_URL", "https://example.test/v4/")
        zai_client = mocker.patch("src.providers.zai.ZaiClient")

        self._make_provider()

        zai_client.assert_called_once_with(
            api_key="test-zai-key",
            base_url="https://example.test/v4/",
        )

    def test_missing_api_key_raises(self, monkeypatch):
        monkeypatch.delenv("ZAI_API_KEY", raising=False)
        with pytest.raises(ValueError, match="ZAI_API_KEY"):
            from src.providers.zai import ZaiProvider
            ZaiProvider()

    async def test_generate_success(self):
        provider = self._make_provider()
        self.mock_client.chat.completions.create.return_value = create_zai_response(
            '{"plan": "test"}'
        )

        result = await provider.generate("Generate a plan", temperature=0.5)

        assert result == '{"plan": "test"}'
        self.mock_client.chat.completions.create.assert_called_once()
        call_kwargs = self.mock_client.chat.completions.create.call_args.kwargs
        assert call_kwargs["model"] == "glm-5.1"
        assert call_kwargs["temperature"] == 0.5
        assert call_kwargs["messages"] == [
            {"role": "user", "content": "Generate a plan"},
        ]

    async def test_generate_passes_system_prompt_and_max_tokens(self):
        provider = self._make_provider()
        self.mock_client.chat.completions.create.return_value = create_zai_response("ok")

        await provider.generate(
            "test",
            temperature=0.3,
            max_tokens=1024,
            system_prompt="Return valid JSON.",
        )

        call_kwargs = self.mock_client.chat.completions.create.call_args.kwargs
        assert call_kwargs["max_tokens"] == 1024
        assert call_kwargs["messages"] == [
            {"role": "system", "content": "Return valid JSON."},
            {"role": "user", "content": "test"},
        ]

    async def test_generate_returns_empty_string_for_empty_content(self):
        provider = self._make_provider()
        self.mock_client.chat.completions.create.return_value = create_zai_response(None)

        result = await provider.generate("test")
        assert result == ""

    async def test_generate_returns_empty_string_for_no_choices(self):
        provider = self._make_provider()
        self.mock_client.chat.completions.create.return_value = ZaiResponse(choices=[])

        result = await provider.generate("test")
        assert result == ""
