"""Prompt loading and management utilities."""

import os
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=32)
def load_prompt(operation: str, version: str = "v1") -> str:
    """Load a prompt template from the prompts directory.

    Args:
        operation: The operation name (e.g., 'plan', 'validate_video').
        version: The prompt version (e.g., 'v1').

    Returns:
        The prompt template string.

    Raises:
        FileNotFoundError: If the prompt file doesn't exist.
    """
    prompts_dir = Path(__file__).parent.parent / "prompts"
    prompt_path = prompts_dir / operation / f"{version}.txt"

    if not prompt_path.exists():
        raise FileNotFoundError(f"Prompt not found: {prompt_path}")

    return prompt_path.read_text(encoding="utf-8")


def format_prompt(template: str, **kwargs) -> str:
    """Format a prompt template with provided variables.

    Uses Python's str.format() for variable substitution.

    Args:
        template: The prompt template string.
        **kwargs: Variables to substitute into the template.

    Returns:
        The formatted prompt string.
    """
    return template.format(**kwargs)
