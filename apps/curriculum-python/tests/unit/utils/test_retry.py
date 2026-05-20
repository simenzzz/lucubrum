"""Tests for src/utils/retry.py — retry logic with Pydantic validation."""

import json
import os
import pytest
from unittest.mock import AsyncMock

from pydantic import BaseModel, Field

from src.utils.retry import (
    RetryConfig,
    RetryResult,
    AttemptResult,
    _extract_json_from_response,
    _parse_and_validate,
    format_errors_for_prompt,
    retry_llm_with_validation,
)


# --- Minimal Pydantic model for testing ---


class SimpleModel(BaseModel):
    name: str = Field(..., min_length=1)
    value: int = Field(..., ge=0)


# --- Helpers ---

VALID_JSON = json.dumps({"name": "test", "value": 42})
INVALID_JSON = '{"name": "test", "value": }'
VALID_BUT_FAILS_VALIDATION = json.dumps({"name": "", "value": -1})


# ============================================================
# _extract_json_from_response
# ============================================================


class TestExtractJsonFromResponse:
    def test_plain_json(self):
        result = _extract_json_from_response('{"key": "val"}')
        assert json.loads(result) == {"key": "val"}

    def test_json_code_block(self):
        raw = '```json\n{"key": "val"}\n```'
        assert _extract_json_from_response(raw) == '{"key": "val"}'

    def test_generic_code_block(self):
        raw = '```\n{"key": "val"}\n```'
        assert _extract_json_from_response(raw) == '{"key": "val"}'

    def test_strips_whitespace(self):
        raw = '  \n {"key": "val"} \n  '
        result = _extract_json_from_response(raw)
        assert json.loads(result) == {"key": "val"}

    def test_no_code_block_passthrough(self):
        raw = '{"a":1}'
        result = _extract_json_from_response(raw)
        assert json.loads(result) == {"a": 1}


class TestExtractJsonFromResponseEdgeCases:
    @pytest.mark.parametrize("raw,expected_parsed", [
        # Plain JSON (existing behavior)
        ('{"key": "value"}', {"key": "value"}),

        # Thinking tokens wrapping JSON
        ('<thinking>\nLet me think...\n</thinking>\n{"key": "value"}', {"key": "value"}),

        # Prose before and after JSON
        ('Here is the plan:\n{"key": "value"}\nHope this helps!', {"key": "value"}),

        # Markdown fence with surrounding prose
        ('Sure! Here it is:\n```json\n{"key": "value"}\n```\nLet me know.', {"key": "value"}),

        # Array-style JSON
        ('[{"id": 1}, {"id": 2}]', [{"id": 1}, {"id": 2}]),

        # Array with prose wrapping
        ('The items are:\n[{"id": 1}]\nDone.', [{"id": 1}]),
    ])
    def test_extract_various_formats(self, raw, expected_parsed):
        result = _extract_json_from_response(raw)
        # Verify it parses as valid JSON matching expected structure
        assert json.loads(result) == expected_parsed

    def test_trailing_brace_in_prose_does_not_corrupt(self):
        """raw_decode correctly stops at end of JSON object, ignoring trailing braces."""
        raw = '{"topic": "Python"} Hope this helps!}'
        result = _extract_json_from_response(raw)
        assert json.loads(result) == {"topic": "Python"}

    def test_json_fence_preferred_over_untagged(self):
        """JSON-tagged fences are preferred over untagged fences."""
        raw = '```python\n{"wrong": true}\n```\n```json\n{"right": true}\n```'
        result = _extract_json_from_response(raw)
        assert json.loads(result) == {"right": True}

    def test_multiple_fences_chooses_longest(self):
        raw = '''Example:
```json
{"small": true}
```
Actual:
```json
{"key": "value", "data": [1,2,3]}
```
'''
        result = _extract_json_from_response(raw)
        import json
        parsed = json.loads(result)
        assert "data" in parsed  # Should extract the longer match


# ============================================================
# _parse_and_validate
# ============================================================


class TestParseAndValidate:
    def test_valid_json_valid_model(self):
        success, model, parsed, errors = _parse_and_validate(VALID_JSON, SimpleModel)
        assert success is True
        assert model is not None
        assert model.name == "test"
        assert model.value == 42
        assert errors == []

    def test_invalid_json(self):
        success, model, parsed, errors = _parse_and_validate(INVALID_JSON, SimpleModel)
        assert success is False
        assert model is None
        assert parsed is None
        assert any("JSON parse error" in e for e in errors)

    def test_valid_json_invalid_model(self):
        bad = json.dumps({"name": "", "value": -1})
        success, model, parsed, errors = _parse_and_validate(bad, SimpleModel)
        assert success is False
        assert model is None
        assert parsed is not None  # JSON parsed OK
        assert len(errors) >= 1
        assert any("Validation error" in e for e in errors)

    def test_strips_code_block_before_parsing(self):
        raw = f"```json\n{VALID_JSON}\n```"
        success, model, _, _ = _parse_and_validate(raw, SimpleModel)
        assert success is True
        assert model.name == "test"


# ============================================================
# format_errors_for_prompt
# ============================================================


class TestFormatErrorsForPrompt:
    def test_empty_errors(self):
        assert format_errors_for_prompt([]) == ""

    def test_single_error(self):
        result = format_errors_for_prompt(["Something went wrong"])
        assert "1. Something went wrong" in result
        assert "previous response" in result

    def test_multiple_errors(self):
        result = format_errors_for_prompt(["Error A", "Error B"])
        assert "1. Error A" in result
        assert "2. Error B" in result


# ============================================================
# retry_llm_with_validation (async)
# ============================================================


class TestRetryLlmWithValidation:
    """Test the main retry orchestration function."""

    async def test_first_attempt_success(self):
        generate_fn = AsyncMock(return_value=VALID_JSON)
        template = "Generate something about {topic}. {validation_errors}"

        result = await retry_llm_with_validation(
            generate_fn=generate_fn,
            prompt_template=template,
            prompt_kwargs={"topic": "python"},
            model_class=SimpleModel,
        )

        assert result.success is True
        assert result.value is not None
        assert result.value.name == "test"
        assert result.retry_count == 0
        assert len(result.attempts) == 1
        generate_fn.assert_called_once()

    async def test_retry_on_json_parse_failure(self):
        generate_fn = AsyncMock(side_effect=[INVALID_JSON, VALID_JSON])
        template = "Generate {topic}. {validation_errors}"

        result = await retry_llm_with_validation(
            generate_fn=generate_fn,
            prompt_template=template,
            prompt_kwargs={"topic": "python"},
            model_class=SimpleModel,
        )

        assert result.success is True
        assert result.retry_count == 1
        assert len(result.attempts) == 2
        assert result.attempts[0].success is False
        assert result.attempts[1].success is True

    async def test_retry_on_pydantic_validation_failure(self):
        bad_output = json.dumps({"name": "", "value": -1})
        generate_fn = AsyncMock(side_effect=[bad_output, VALID_JSON])
        template = "Generate {topic}. {validation_errors}"

        result = await retry_llm_with_validation(
            generate_fn=generate_fn,
            prompt_template=template,
            prompt_kwargs={"topic": "python"},
            model_class=SimpleModel,
        )

        assert result.success is True
        assert result.retry_count == 1

    async def test_max_retries_exhausted(self):
        generate_fn = AsyncMock(return_value=INVALID_JSON)
        template = "Generate {topic}. {validation_errors}"
        config = RetryConfig(max_retries=2, include_errors_in_prompt=True)

        result = await retry_llm_with_validation(
            generate_fn=generate_fn,
            prompt_template=template,
            prompt_kwargs={"topic": "python"},
            model_class=SimpleModel,
            config=config,
        )

        assert result.success is False
        assert result.value is None
        assert result.retry_count == 2
        assert len(result.attempts) == 3  # initial + 2 retries
        assert len(result.final_errors) > 0

    async def test_error_feedback_included_in_retry_prompt(self):
        """On retry, validation errors should be formatted into the prompt."""
        bad_output = json.dumps({"name": "", "value": -1})
        calls = []

        async def capture_fn(prompt: str) -> str:
            calls.append(prompt)
            if len(calls) == 1:
                return bad_output
            return VALID_JSON

        template = "Generate {topic}. {validation_errors}"
        config = RetryConfig(max_retries=1, include_errors_in_prompt=True)

        result = await retry_llm_with_validation(
            generate_fn=capture_fn,
            prompt_template=template,
            prompt_kwargs={"topic": "python"},
            model_class=SimpleModel,
            config=config,
        )

        assert result.success is True
        # First call should have empty validation_errors
        assert "previous response" not in calls[0]
        # Second call should contain error feedback
        assert "previous response" in calls[1]
        assert "Validation error" in calls[1]

    async def test_markdown_code_block_stripped(self):
        wrapped = f"```json\n{VALID_JSON}\n```"
        generate_fn = AsyncMock(return_value=wrapped)
        template = "Generate {topic}. {validation_errors}"

        result = await retry_llm_with_validation(
            generate_fn=generate_fn,
            prompt_template=template,
            prompt_kwargs={"topic": "python"},
            model_class=SimpleModel,
        )

        assert result.success is True
        assert result.value.name == "test"

    async def test_llm_generation_error_triggers_retry(self):
        generate_fn = AsyncMock(
            side_effect=[Exception("API timeout"), VALID_JSON]
        )
        template = "Generate {topic}. {validation_errors}"

        result = await retry_llm_with_validation(
            generate_fn=generate_fn,
            prompt_template=template,
            prompt_kwargs={"topic": "python"},
            model_class=SimpleModel,
        )

        assert result.success is True
        assert len(result.attempts) == 2
        assert "LLM generation error" in result.attempts[0].validation_errors[0]

    async def test_llm_generation_errors_are_reported_when_retries_exhausted(self):
        generate_fn = AsyncMock(side_effect=RuntimeError("provider unavailable"))
        template = "Generate {topic}. {validation_errors}"
        config = RetryConfig(max_retries=2, include_errors_in_prompt=True)

        result = await retry_llm_with_validation(
            generate_fn=generate_fn,
            prompt_template=template,
            prompt_kwargs={"topic": "python"},
            model_class=SimpleModel,
            config=config,
        )

        assert result.success is False
        assert len(result.attempts) == 3
        assert result.final_errors == ["LLM generation error: provider unavailable"]

    async def test_missing_prompt_variable_returns_failure(self):
        generate_fn = AsyncMock(return_value=VALID_JSON)
        template = "Generate {topic} with {missing_var}. {validation_errors}"

        result = await retry_llm_with_validation(
            generate_fn=generate_fn,
            prompt_template=template,
            prompt_kwargs={"topic": "python"},
            model_class=SimpleModel,
        )

        assert result.success is False
        assert any("Missing prompt variable" in e for e in result.final_errors)
        generate_fn.assert_not_called()

    async def test_total_attempts_property(self):
        generate_fn = AsyncMock(return_value=VALID_JSON)
        template = "{topic} {validation_errors}"

        result = await retry_llm_with_validation(
            generate_fn=generate_fn,
            prompt_template=template,
            prompt_kwargs={"topic": "x"},
            model_class=SimpleModel,
        )

        assert result.total_attempts == 1
        assert result.retry_count == 0

    async def test_config_default_max_retries(self):
        """RetryConfig reads LLM_MAX_RETRIES at class-definition time (default 2)."""
        config = RetryConfig()
        assert config.max_retries == int(os.getenv("LLM_MAX_RETRIES", 2))

    async def test_config_custom_max_retries(self):
        config = RetryConfig(max_retries=5)
        assert config.max_retries == 5

    async def test_errors_not_in_prompt_when_disabled(self):
        bad_output = json.dumps({"name": "", "value": -1})
        calls = []

        async def capture_fn(prompt: str) -> str:
            calls.append(prompt)
            if len(calls) == 1:
                return bad_output
            return VALID_JSON

        template = "Generate {topic}. {validation_errors}"
        config = RetryConfig(max_retries=1, include_errors_in_prompt=False)

        await retry_llm_with_validation(
            generate_fn=capture_fn,
            prompt_template=template,
            prompt_kwargs={"topic": "python"},
            model_class=SimpleModel,
            config=config,
        )

        # Second call should NOT contain error feedback
        assert "previous response" not in calls[1]
