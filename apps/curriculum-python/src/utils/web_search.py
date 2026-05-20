"""
Web search utility for exercise inspiration.
Uses Brave Search API.

Graceful degradation: Returns empty list if quota exhausted or API fails.
TODO (Phase 7 MCP Migration): Replace with MCP web search tool.
"""

import logging
import os
from typing import TypedDict

import httpx

logger = logging.getLogger(__name__)

# Brave Search API endpoint
BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"

class SearchResult(TypedDict):
    """A single web search result."""

    title: str
    description: str
    url: str


async def search_exercises(
    topic: str,
    exercise_type: str,
    max_results: int = 5,
) -> list[SearchResult]:
    """Search for exercise examples/inspiration for a topic.

    Uses Brave Search API to find relevant exercises and examples
    that can inspire (not copy) exercise generation.

    Args:
        topic: The learning topic to search for exercises.
        exercise_type: Type of exercise (mcq, short_answer, coding, etc.).
        max_results: Maximum number of results to return (1-10).

    Returns:
        List of SearchResult dicts with title, snippet, and url.
        Returns empty list on any error (graceful degradation).

    Note:
        Brave Search has a monthly query limit. This function
        returns empty list when quota is exhausted or on any error.
    """
    # Check if web search is enabled
    if os.getenv("WEB_SEARCH_ENABLED", "true").lower() != "true":
        logger.debug("Web search disabled via WEB_SEARCH_ENABLED")
        return []

    # Get API credentials
    api_key = os.getenv("BRAVE_SEARCH_API_KEY")

    if not api_key:
        logger.warning(
            "Brave CSE credentials not configured. "
            "Set BRAVE_API_KEY to enable web search."
        )
        return []

    # Build search query
    query = _build_search_query(topic, exercise_type)
    max_results = max(1, min(max_results, 10))  # Clamp to 1-10

    headers = {"X-Subscription-Token": api_key}
    params = {"q": query, "count": max_results}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                BRAVE_SEARCH_URL, # (Updated URL)
                params=params, 
                headers=headers  
            )

            # Handle quota exceeded
            if response.status_code == 429:
                logger.warning("Brave Search quota exceeded (429). Returning empty results.")
                return []

            # Handle other errors
            if response.status_code != 200:
                logger.warning(
                    f"Brave Search returned status {response.status_code}. "
                    f"Response: {response.text[:200]}"
                )
                return []

            data = response.json()
            return _parse_search_results(data)

    except httpx.TimeoutException:
        logger.warning("Brave Search request timed out. Returning empty results.")
        return []
    except httpx.RequestError as e:
        logger.warning(f"Brave Search request failed: {e}. Returning empty results.")
        return []
    except Exception as e:
        logger.exception(f"Unexpected error in web search: {e}")
        return []


def _build_search_query(topic: str, exercise_type: str) -> str:
    """Build an effective search query for exercise inspiration.

    Args:
        topic: The learning topic.
        exercise_type: Type of exercise.

    Returns:
        Search query string optimized for finding exercises.
    """
    # Map exercise types to search terms
    type_terms = {
        "mcq": "multiple choice questions quiz",
        "short_answer": "practice questions answers",
        "fill_blank": "fill in the blank exercises",
        "coding": "programming exercises problems solutions",
        "flashcard": "flashcards study terms definitions",
    }

    search_term = type_terms.get(exercise_type, "practice questions exercises")
    return f"{topic} {search_term}"


def _parse_search_results(data: dict) -> list[SearchResult]:
    """Parse Brave Search response into SearchResult list.

    Args:
        data: The JSON response from Brave Search.

    Returns:
        List of parsed SearchResult dicts.
    """
    web_results = data.get("web", {}).get("results", [])
    parsed_results = []

    for item in web_results:
        title = item.get("title", "")
        description = item.get("description", "")
        url = item.get("url", "")

        if title and url:
            parsed_results.append(
                SearchResult(
                    title=title[:200],  # Truncate long titles
                    description=description[:500],  # Truncate long snippets
                    url=url,
                )
            )

    return parsed_results
