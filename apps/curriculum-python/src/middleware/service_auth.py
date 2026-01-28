"""Service-to-service authentication middleware."""

import os
from datetime import datetime, timezone

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from ..utils.logger import get_logger

logger = get_logger(__name__)


class ServiceTokenMiddleware(BaseHTTPMiddleware):
    """
    Middleware that validates service-to-service authentication tokens.

    Protects /llm/* endpoints while allowing public access to health,
    documentation, and OpenAPI schema endpoints.
    """

    # Paths that don't require authentication
    EXCLUDED_PATHS = frozenset([
        "/health",
        "/docs",
        "/redoc",
        "/openapi.json",
    ])

    def __init__(self, app, excluded_paths: list[str] | None = None):
        """
        Initialize the middleware.

        Args:
            app: The FastAPI application.
            excluded_paths: Additional paths to exclude from auth.
        """
        super().__init__(app)
        self.token = os.getenv("SERVICE_TOKEN")
        self.excluded_paths = set(self.EXCLUDED_PATHS)
        if excluded_paths:
            self.excluded_paths.update(excluded_paths)

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        """Process the request and validate service token if required."""
        path = request.url.path

        # Skip auth for excluded paths
        if path in self.excluded_paths:
            return await call_next(request)

        # If no token configured, allow requests (development mode)
        if not self.token:
            logger.warning(
                "SERVICE_TOKEN not configured - allowing unauthenticated request",
                path=path,
            )
            return await call_next(request)

        # Validate the service token
        auth_header = request.headers.get("X-Service-Token")
        if auth_header != self.token:
            timestamp = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            request_id = request.headers.get("X-Request-ID", "unknown")

            logger.warning(
                "Invalid or missing service token",
                path=path,
                request_id=request_id,
            )

            return JSONResponse(
                status_code=401,
                content={
                    "error": "UNAUTHORIZED",
                    "message": "Invalid or missing service token",
                    "details": {},
                    "request_id": request_id,
                    "timestamp": timestamp,
                },
            )

        return await call_next(request)
