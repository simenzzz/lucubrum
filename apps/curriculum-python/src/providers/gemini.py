"""Gemini LLM provider implementation."""

import os

from google import genai
from google.genai import types

from .base import LLMProvider


class GeminiProvider(LLMProvider):
    """Google Gemini LLM provider."""

    def __init__(self, model: str | None = None):
        """Initialize the Gemini provider.

        Args:
            model: Optional model name override. Defaults to LLM_MODEL env var
                   or 'gemini-2.0-flash'.
        """
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable is required")

        self._client = genai.Client(api_key=api_key)
        self._model_name = model or os.getenv("LLM_MODEL", "gemini-2.0-flash")

    async def generate(
        self,
        prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        system_prompt: str | None = None,
    ) -> str:
        """Generate a response from Gemini.

        Args:
            prompt: The user-provided prompt to send.
            temperature: Sampling temperature (0.0-1.0).
            max_tokens: Maximum tokens in response.
            system_prompt: Optional system-level instructions.

        Returns:
            Raw string response from the model.
        """
        config = types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_tokens,
            response_mime_type='application/json',
            system_instruction=system_prompt if system_prompt else None,
        )

        response = await self._client.aio.models.generate_content(
            model=self._model_name,
            contents=prompt,
            config=config,
        )

        text = response.text
        if not text:
            return ""
        return text

    @property
    def provider_name(self) -> str:
        return "gemini"

    @property
    def model_name(self) -> str:
        return self._model_name
