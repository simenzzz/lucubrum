"""Z.ai LLM provider implementation."""

import asyncio
import os
from typing import Any

from zai import ZaiClient

from .base import LLMProvider


class ZaiProvider(LLMProvider):
    """Z.ai GLM provider."""

    def __init__(self, model: str | None = None):
        """Initialize the Z.ai provider.

        Args:
            model: Optional model name override. Defaults to LLM_MODEL env var
                   or 'glm-5.1'.
        """
        api_key = os.getenv("ZAI_API_KEY")
        if not api_key:
            raise ValueError("ZAI_API_KEY environment variable is required")

        client_kwargs: dict[str, Any] = {"api_key": api_key}
        base_url = os.getenv("ZAI_BASE_URL")
        if base_url:
            client_kwargs["base_url"] = base_url

        self._client = ZaiClient(**client_kwargs)
        self._model_name = model or os.getenv("LLM_MODEL", "glm-5.1")

    async def generate(
        self,
        prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        system_prompt: str | None = None,
    ) -> str:
        """Generate a response from Z.ai."""
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        response = await asyncio.to_thread(
            self._client.chat.completions.create,
            model=self._model_name,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )

        choices = getattr(response, "choices", None) or []
        if not choices:
            return ""

        message = getattr(choices[0], "message", None)
        content = getattr(message, "content", None)
        return content or ""

    @property
    def provider_name(self) -> str:
        return "zai"

    @property
    def model_name(self) -> str:
        return self._model_name
