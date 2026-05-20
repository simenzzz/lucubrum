"""FastAPI entry point for the Curriculum service."""

import os
from datetime import datetime, timezone
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from dotenv import load_dotenv

from .api.exercises import router as exercises_router
from .api.grade import router as grade_router
from .api.plan import router as plan_router
from .api.queries import router as queries_router
from .api.reading_material import router as reading_material_router
from .api.staleness import router as staleness_router
from .api.validate_video import router as validate_video_router
from .api.normalize import router as normalize_router
from .api.facts import router as facts_router
from .api.exam import router as exam_router
from .middleware import ServiceTokenMiddleware
from .services import StalenessPolicyService
from .utils.logger import configure_logging, get_logger

load_dotenv()

# Configure structured logging
configure_logging(os.getenv("ENVIRONMENT", "development"))
logger = get_logger(__name__)

# Database URL from environment
DATABASE_URL = os.getenv("DATABASE_URL", "")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown events."""
    # Startup
    db_pool = None
    if DATABASE_URL:
        try:
            db_pool = await asyncpg.create_pool(
                DATABASE_URL,
                min_size=2,
                max_size=10,
                command_timeout=30,
            )
            app.state.db_pool = db_pool

            # Initialize StalenessPolicyService
            policy_service = StalenessPolicyService(db_pool)
            await policy_service._load_from_db()
            app.state.staleness_policies = policy_service

            logger.info("Database pool and services initialized")
        except Exception as e:
            logger.error(f"Failed to initialize database pool: {e}")

    yield

    # Shutdown
    if db_pool:
        await db_pool.close()
        logger.info("Database pool closed")


# Detect if we're in development
is_dev = os.getenv("ENVIRONMENT", "development") == "development"

app = FastAPI(
    title="Lucubrum Curriculum Service",
    version="0.1.0",
    description="LLM-powered curriculum generation service",
    lifespan=lifespan,
    docs_url="/docs" if is_dev else None,
    redoc_url="/redoc" if is_dev else None,
    openapi_url="/openapi.json" if is_dev else None,
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
app.include_router(reading_material_router)
app.include_router(exercises_router)
app.include_router(grade_router)
app.include_router(staleness_router)
app.include_router(validate_video_router)
app.include_router(normalize_router)
app.include_router(facts_router)
app.include_router(exam_router)


@app.get("/health")
async def health():
    """Health check endpoint — returns minimal status only.

    Internal dependency details are logged server-side but not exposed
    to callers, to avoid leaking infrastructure topology.
    """
    llm_status = "healthy"
    db_status = "healthy"

    # Check if at least one LLM provider is configured
    provider = os.getenv("LLM_PROVIDER", "gemini")
    if provider == "gemini" and not os.getenv("GEMINI_API_KEY"):
        llm_status = "unhealthy"
    elif provider == "claude" and not os.getenv("ANTHROPIC_API_KEY"):
        llm_status = "unhealthy"

    # Check database connection
    if hasattr(app.state, "db_pool") and app.state.db_pool:
        try:
            async with app.state.db_pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
        except Exception as e:
            logger.warning("Database health check failed", error=str(e))
            db_status = "unhealthy"
    else:
        db_status = "not_configured"

    overall_status = "healthy"
    if llm_status == "unhealthy" or db_status == "unhealthy":
        overall_status = "unhealthy"
    elif db_status == "not_configured":
        overall_status = "degraded"

    # Log details server-side for debugging
    if overall_status != "healthy":
        logger.warning(
            "Health check degraded",
            overall=overall_status,
            llm=llm_status,
            db=db_status,
        )

    # Return only aggregate status — no dependency topology
    return {"status": overall_status}


logger.info("Curriculum service started")
