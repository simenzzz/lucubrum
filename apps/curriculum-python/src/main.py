"""FastAPI entry point for the Curriculum service."""

from fastapi import FastAPI

app = FastAPI(
    title="Learning Helper Curriculum Service",
    version="0.1.0",
    description="LLM-powered curriculum generation service",
)


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "curriculum-python"}
