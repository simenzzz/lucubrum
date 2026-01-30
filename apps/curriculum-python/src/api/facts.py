"""Facts API endpoint for MCP-based fact gathering."""

from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..mcp import FactsService
from ..utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/llm", tags=["facts"])


class GetFactsRequest(BaseModel):
    """Request to get facts about a topic."""

    normalized_topic: str = Field(..., description="The normalized topic name (e.g., 'machine_learning')")
    keywords: List[str] = Field(default=[], description="Optional related keywords for search")
    request_id: str = Field(..., description="Unique request ID for tracing")


class GetFactsResponse(BaseModel):
    """Response with gathered facts."""

    facts: List[str] = Field(..., description="List of fact strings about the topic")
    sources: List[str] = Field(..., description="Sources of the facts (e.g., ['context7', 'brave_search'])")


@router.post("/get-facts", response_model=GetFactsResponse)
async def get_facts(request: GetFactsRequest, http_request: Request) -> GetFactsResponse:
    """Gather current facts about a topic from MCP sources.

    This endpoint combines information from:
    - Context7 (documentation, library references)
    - Brave Search (recent developments, news)

    Uses fail-open behavior: if Context7 is unavailable, uses Brave Search only.
    If both fail, returns empty facts array.

    Args:
        request: Request containing normalized_topic, keywords, and request_id
        http_request: FastAPI Request object

    Returns:
        GetFactsResponse with facts and sources

    Raises:
        HTTPException(500): On unexpected errors
    """
    try:
        # Get or create FactsService
        # For now, create a new instance each time (could be optimized to use app.state)
        facts_service = FactsService()

        # Gather facts
        facts = await facts_service.get_facts(
            normalized_topic=request.normalized_topic,
            keywords=request.keywords,
        )

        # Determine which sources were used
        sources = []
        if facts:
            # For now, we can't easily determine which source provided which facts
            # without modifying FactsService. Use a heuristic:
            sources.append("mcp_sources")

        logger.info(
            "Facts retrieved",
            request_id=request.request_id,
            topic=request.normalized_topic,
            fact_count=len(facts),
            sources=sources,
        )

        return GetFactsResponse(facts=facts, sources=sources)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Unexpected error in get_facts",
            request_id=request.request_id,
            topic=request.normalized_topic,
            error=str(e),
        )
        raise HTTPException(
            status_code=500,
            detail={
                "error": "INTERNAL_ERROR",
                "message": "An unexpected error occurred",
                "details": {},
                "request_id": request.request_id,
                "timestamp": datetime.now(timezone.utc)
                .isoformat()
                .replace("+00:00", "Z"),
            },
        )
