"""Claude (Anthropic) LLM provider implementation."""

import os

import anthropic

from .base import LLMProvider


class ClaudeProvider(LLMProvider):
    """Anthropic Claude LLM provider."""

    def __init__(self, model: str | None = None):
        """Initialize the Claude provider.

        Args:
            model: Optional model name override. Defaults to LLM_MODEL env var
                   or 'claude-3-sonnet-20240229'.
        """
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable is required")

        self._client = anthropic.AsyncAnthropic(api_key=api_key)
        self._model_name = model or os.getenv("LLM_MODEL", "claude-3-sonnet-20240229")

    async def generate(
        self,
        prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> str:
        """Generate a response from Claude.

        Args:
            prompt: The prompt to send.
            temperature: Sampling temperature (0.0-1.0).
            max_tokens: Maximum tokens in response.

        Returns:
            Raw string response from the model.
        """
        message = await self._client.messages.create(
            model=self._model_name,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=[{"role": "user", "content": prompt}],
        )

        # Extract text from response
        text_blocks = [
            block.text for block in message.content if hasattr(block, "text")
        ]
        return "\n".join(text_blocks)

    @property
    def provider_name(self) -> str:
        return "claude"

    @property
    def model_name(self) -> str:
        return self._model_name
