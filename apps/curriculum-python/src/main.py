"""FastAPI entry point for the Curriculum service."""

import logging

from fastapi import FastAPI

from .api.plan import router as plan_router
from .api.queries import router as queries_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

app = FastAPI(
    title="Learning Helper Curriculum Service",
    version="0.1.0",
    description="LLM-powered curriculum generation service",
)

# Register routers
app.include_router(plan_router)
app.include_router(queries_router)


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "curriculum-python"}
