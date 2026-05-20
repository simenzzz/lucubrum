"""Retry logic utility for LLM calls with validation."""

import json
import logging
import os
import re
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Generic, TypeVar

from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

# Maximum text length to prevent ReDoS attacks
MAX_TEXT_LENGTH = 100_000  # 100KB limit


@dataclass
class RetryConfig:
    """Configuration for retry behavior."""

    max_retries: int = int(os.getenv("LLM_MAX_RETRIES", 2))
    include_errors_in_prompt: bool = True


@dataclass
class AttemptResult:
    """Result of a single LLM attempt."""

    raw_output: str
    parsed_json: dict[str, Any] | None = None
    validation_errors: list[str] = field(default_factory=list)
    success: bool = False


@dataclass
class RetryResult(Generic[T]):
    """Result of the retry operation."""

    success: bool
    value: T | None = None
    raw_output: str = ""
    retry_count: int = 0
    attempts: list[AttemptResult] = field(default_factory=list)
    final_errors: list[str] = field(default_factory=list)

    @property
    def total_attempts(self) -> int:
        """Return total number of attempts made (retry_count + 1 for initial)."""
        return self.retry_count + 1


def _extract_json_from_response(raw_output: str) -> str:
    """Extract JSON from LLM response, handling various output artifacts.

    Strategies applied in order:
    1. Enforce MAX_TEXT_LENGTH to prevent ReDoS attacks
    2. Strip <thinking>...</thinking> blocks (Gemini extended thinking)
    3. Extract content from markdown code fences
    4. Find outermost JSON object/array by brace matching
    5. Return stripped text as-is (let json.loads produce a descriptive error)
    """
    text = raw_output.strip()

    # 0. Enforce text length limit to prevent ReDoS attacks
    if len(text) > MAX_TEXT_LENGTH:
        original_length = len(text)
        logger.warning(
            f"Input text ({original_length} chars) exceeds MAX_TEXT_LENGTH ({MAX_TEXT_LENGTH}), "
            f"truncating {original_length - MAX_TEXT_LENGTH} chars"
        )
        text = text[:MAX_TEXT_LENGTH]

    # 1. Strip thinking blocks
    text = re.sub(r"<thinking>.*?</thinking>", "", text, flags=re.DOTALL).strip()

    # 2. Prefer explicitly JSON-tagged fences first
    json_fence = re.compile(r"```json\s*\n?(.*?)```", re.DOTALL)
    json_matches = json_fence.findall(text)
    if json_matches:
        candidate = max(json_matches, key=len).strip()
        if candidate and candidate[0] in "{[":
            return candidate

    # Fall back to untagged fences
    any_fence = re.compile(r"```\s*\n?(.*?)```", re.DOTALL)
    any_matches = any_fence.findall(text)
    if any_matches:
        candidate = max(any_matches, key=len).strip()
        if candidate and candidate[0] in "{[":
            return candidate

    # 3. Try parsing JSON from the first { or [ using raw_decode
    decoder = json.JSONDecoder()
    for i, ch in enumerate(text):
        if ch in "{[":
            try:
                obj, _ = decoder.raw_decode(text, i)
                return json.dumps(obj)
            except json.JSONDecodeError:
                continue

    # 4. Fallback
    return text.strip()


def _parse_and_validate(
    raw_output: str,
    model_class: type[T],
) -> tuple[bool, T | None, dict[str, Any] | None, list[str]]:
    """Parse JSON and validate against Pydantic model.

    Returns:
        Tuple of (success, validated_model, parsed_dict, errors)
    """
    errors: list[str] = []

    # Extract JSON from response
    json_text = _extract_json_from_response(raw_output)

    # Parse JSON
    try:
        parsed = json.loads(json_text)
    except json.JSONDecodeError as e:
        errors.append(f"JSON parse error: {e}")
        return False, None, None, errors

    # Validate against Pydantic model
    try:
        validated = model_class.model_validate(parsed)
        return True, validated, parsed, []
    except ValidationError as e:
        for error in e.errors():
            loc = ".".join(str(x) for x in error["loc"])
            msg = error["msg"]
            errors.append(f"Validation error at '{loc}': {msg}")
        return False, None, parsed, errors


def format_errors_for_prompt(errors: list[str]) -> str:
    """Format validation errors for inclusion in retry prompt."""
    if not errors:
        return ""

    formatted = "Your previous response had the following issues:\n"
    for i, error in enumerate(errors, 1):
        formatted += f"{i}. {error}\n"
    return formatted


async def retry_llm_with_validation(
    generate_fn: Callable[[str], Awaitable[str]],
    prompt_template: str,
    prompt_kwargs: dict[str, Any],
    model_class: type[T],
    config: RetryConfig | None = None,
) -> RetryResult[T]:
    """Retry LLM generation with validation until success or max retries.

    Args:
        generate_fn: Async function that takes a prompt and returns LLM output.
        prompt_template: The prompt template with placeholders.
        prompt_kwargs: Initial kwargs for prompt formatting.
        model_class: Pydantic model class to validate against.
        config: Retry configuration.

    Returns:
        RetryResult containing the validated model or error information.
    """
    if config is None:
        config = RetryConfig()

    attempts: list[AttemptResult] = []
    validation_errors: list[str] = []

    for attempt_num in range(config.max_retries + 1):
        # Prepare prompt kwargs with validation errors for retries
        current_kwargs = prompt_kwargs.copy()
        if attempt_num > 0 and config.include_errors_in_prompt:
            current_kwargs["validation_errors"] = format_errors_for_prompt(
                validation_errors
            )
        else:
            current_kwargs["validation_errors"] = ""

        # Format prompt
        try:
            prompt = prompt_template.format(**current_kwargs)
        except KeyError as e:
            logger.error(f"Missing prompt variable: {e}")
            return RetryResult(
                success=False,
                retry_count=attempt_num,
                attempts=attempts,
                final_errors=[f"Missing prompt variable: {e}"],
            )

        # Call LLM
        logger.info(f"LLM attempt {attempt_num + 1}/{config.max_retries + 1}")
        try:
            raw_output = await generate_fn(prompt)
        except Exception as e:
            logger.error(f"LLM generation error: {e}")
            attempts.append(
                AttemptResult(
                    raw_output="",
                    validation_errors=[f"LLM generation error: {e}"],
                )
            )
            continue

        # Parse and validate
        success, validated, parsed_dict, validation_errors = _parse_and_validate(
            raw_output, model_class
        )

        attempt_result = AttemptResult(
            raw_output=raw_output,
            parsed_json=parsed_dict,
            validation_errors=validation_errors,
            success=success,
        )
        attempts.append(attempt_result)

        if success and validated is not None:
            logger.info(
                f"Validation succeeded on attempt {attempt_num + 1}"
            )
            return RetryResult(
                success=True,
                value=validated,
                raw_output=raw_output,
                retry_count=attempt_num,
                attempts=attempts,
            )

        # Log retry info
        if attempt_num < config.max_retries:
            logger.warning(
                f"Validation failed on attempt {attempt_num + 1}, "
                f"retrying... Errors: {validation_errors}"
            )
        else:
            logger.error(
                f"Validation failed after {config.max_retries + 1} attempts. "
                f"Final errors: {validation_errors}"
            )

    # All retries exhausted
    return RetryResult(
        success=False,
        retry_count=config.max_retries,
        attempts=attempts,
        final_errors=validation_errors,
        raw_output=attempts[-1].raw_output if attempts else "",
    )
