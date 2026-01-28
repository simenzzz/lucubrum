"""FastAPI entry point for the Curriculum service."""

import os
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from dotenv import load_dotenv

from .api.exercises import router as exercises_router
from .api.grade import router as grade_router
from .api.plan import router as plan_router
from .api.queries import router as queries_router
from .middleware import ServiceTokenMiddleware
from .utils.logger import configure_logging, get_logger

load_dotenv()

# Configure structured logging
configure_logging(os.getenv("ENVIRONMENT", "development"))
logger = get_logger(__name__)

app = FastAPI(
    title="Learning Helper Curriculum Service",
    version="0.1.0",
    description="LLM-powered curriculum generation service",
)

# Add service token authentication middleware
app.add_middleware(ServiceTokenMiddleware)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Global exception handler that ensures consistent error format with timestamp."""
    request_id = request.headers.get("X-Request-ID", "unknown")
    timestamp = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    logger.error(
        "Unhandled exception",
        error=str(exc),
        error_type=type(exc).__name__,
        request_id=request_id,
        path=str(request.url.path),
    )

    return JSONResponse(
        status_code=500,
        content={
            "error": "INTERNAL_ERROR",
            "message": "An unexpected error occurred",
            "details": {},
            "request_id": request_id,
            "timestamp": timestamp,
        },
    )


# Register routers
app.include_router(plan_router)
app.include_router(queries_router)
app.include_router(exercises_router)
app.include_router(grade_router)


@app.get("/health")
async def health():
    """Health check endpoint with dependency status."""
    timestamp = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    llm_status = "healthy"

    # Check if at least one LLM provider is configured
    provider = os.getenv("LLM_PROVIDER", "gemini")
    if provider == "gemini" and not os.getenv("GEMINI_API_KEY"):
        llm_status = "unhealthy"
    elif provider == "claude" and not os.getenv("ANTHROPIC_API_KEY"):
        llm_status = "unhealthy"

    overall_status = "healthy" if llm_status == "healthy" else "degraded"

    return {
        "status": overall_status,
        "service": "curriculum-python",
        "timestamp": timestamp,
        "dependencies": {
            "llm_provider": llm_status,
        },
    }


logger.info("Curriculum service started")
