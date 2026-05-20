"""Base LLM provider interface."""

import os
from abc import ABC, abstractmethod
from typing import Any


class LLMProvider(ABC):
    """Abstract base class for LLM providers."""

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        system_prompt: str | None = None,
    ) -> str:
        """Generate a response from the LLM.

        Args:
            prompt: The user-provided prompt to send to the LLM.
            temperature: Sampling temperature (0.0-1.0).
            max_tokens: Maximum tokens in response.
            system_prompt: Optional system-level instructions, separated from
                user content to reduce prompt injection risk.

        Returns:
            Raw string response from the LLM.
        """
        pass

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return the provider name (e.g., 'gemini', 'claude')."""
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Return the model name being used."""
        pass


def get_provider() -> LLMProvider:
    """Get the configured LLM provider based on environment variables.

    Returns:
        An instance of the configured LLM provider.

    Raises:
        ValueError: If the provider is not supported or not configured.
    """
    provider_name = os.getenv("LLM_PROVIDER", "gemini").lower()

    if provider_name == "gemini":
        from .gemini import GeminiProvider
        return GeminiProvider()
    elif provider_name == "claude":
        from .claude import ClaudeProvider
        return ClaudeProvider()
    else:
        raise ValueError(f"Unsupported LLM provider: {provider_name}")
