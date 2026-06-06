"""Helpers for mapping LLM provider errors to API responses."""

import logging
from uuid import UUID

from fastapi import HTTPException

from ..utils.retry import NonRetryableLLMError


def raise_llm_provider_http_exception(
    error: NonRetryableLLMError,
    request_id: UUID,
    logger: logging.Logger,
    operation: str,
) -> None:
    """Raise a clear HTTP error for provider failures that retries cannot fix."""
    logger.error(
        f"Non-retryable LLM provider error during {operation}: "
        f"{error.provider_error or error.message}"
    )
    raise HTTPException(
        status_code=error.status_code,
        detail={
            "error": error.error_code,
            "message": error.message,
            "provider_error": error.provider_error,
            "request_id": str(request_id),
        },
    )
