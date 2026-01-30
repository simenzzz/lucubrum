"""MCP Facts Service for gathering current information about topics.

Combines data from:
- Context7 REST API (documentation, library references)
- Brave Search (recent developments, news)

Uses fail-open behavior: if Context7 is unavailable, falls back to Brave Search.
If both fail, returns empty array (caller treats as "assume fresh").
"""

import os
from typing import List

import httpx

from ..utils.logger import get_logger

logger = get_logger(__name__)


class FactsService:
    """Service for gathering current facts about topics from multiple sources."""

    def __init__(self):
        """Initialize the facts service."""
        self.context7_available = os.getenv("CONTEXT7_ENABLED", "true").lower() == "true"
        self.brave_search_available = os.getenv("WEB_SEARCH_ENABLED", "true").lower() == "true"

    async def get_facts(self, normalized_topic: str, keywords: List[str] = None) -> List[str]:
        """Gather current facts about a topic from multiple sources.

        Args:
            normalized_topic: The canonical topic name (e.g., "machine_learning")
            keywords: Optional list of related keywords to enhance search

        Returns:
            List of fact strings about the topic. Empty if all sources fail.
        """
        all_facts = []
        sources = []

        # Try Context7 first (for documentation/library info)
        if self.context7_available:
            try:
                context7_facts = await self._get_context7_facts(normalized_topic, keywords or [])
                all_facts.extend(context7_facts)
                if context7_facts:
                    sources.append("context7")
                logger.debug(
                    "Context7 facts gathered",
                    topic=normalized_topic,
                    count=len(context7_facts),
                )
            except Exception as e:
                logger.warning(
                    "Context7 unavailable, falling back to Brave Search",
                    topic=normalized_topic,
                    error=str(e),
                )

        # Always try Brave Search (for recent developments)
        if self.brave_search_available:
            try:
                brave_facts = await self._get_brave_facts(normalized_topic, keywords or [])
                all_facts.extend(brave_facts)
                if brave_facts:
                    sources.append("brave_search")
                logger.debug(
                    "Brave Search facts gathered",
                    topic=normalized_topic,
                    count=len(brave_facts),
                )
            except Exception as e:
                logger.warning(
                    "Brave Search unavailable",
                    topic=normalized_topic,
                    error=str(e),
                )

        # Deduplicate facts while preserving order
        seen = set()
        unique_facts = []
        for fact in all_facts:
            # Normalize for comparison (lowercase, strip)
            normalized = fact.lower().strip()
            if normalized and normalized not in seen:
                seen.add(normalized)
                unique_facts.append(fact)

        # Limit to ~10 facts to avoid overwhelming the LLM
        result = unique_facts[:10]

        logger.info(
            "Facts gathered",
            topic=normalized_topic,
            total_facts=len(result),
            sources=sources,
        )

        return result

    async def _get_context7_facts(self, topic: str, keywords: List[str]) -> List[str]:
        """Get facts from Context7 REST API.

        Uses the /docs/info endpoint for documentation content about a topic.
        """
        api_key = os.getenv("CONTEXT7_API_KEY")
        if not api_key:
            logger.warning("CONTEXT7_API_KEY not set, skipping Context7")
            return []

        # Map topic to library ID (common mappings)
        library_mappings = {
            "react": "facebook/react",
            "next.js": "vercel/next.js",
            "nextjs": "vercel/next.js",
            "python": "python/cpython",
            "typescript": "microsoft/TypeScript",
            "node": "nodejs/node",
            "nodejs": "nodejs/node",
            "django": "django/django",
            "flask": "pallets/flask",
            "fastapi": "tiangolo/fastapi",
            "tensorflow": "tensorflow/tensorflow",
            "pytorch": "pytorch/pytorch",
            "vue": "vuejs/core",
            "angular": "angular/angular",
            "svelte": "sveltejs/svelte",
            "rust": "rust-lang/rust",
            "go": "golang/go",
            # Add more as needed
        }

        # Find best library match
        topic_lower = topic.lower().replace("_", " ")
        library_id = None
        for key, lib in library_mappings.items():
            if key in topic_lower:
                library_id = lib
                break

        if not library_id:
            logger.debug(f"No library mapping for topic: {topic}")
            return []

        headers = {"Authorization": f"Bearer {api_key}"}
        params = {"topic": topic_lower}

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Try info endpoint for documentation content
                response = await client.get(
                    f"https://context7.com/api/v2/docs/info/{library_id}",
                    headers=headers,
                    params=params
                )

                if response.status_code != 200:
                    logger.debug(f"Context7 returned {response.status_code} for {library_id}")
                    return []

                data = response.json()
                facts = []

                for snippet in data.get("snippets", [])[:5]:
                    content = snippet.get("content", "")
                    if content:
                        # Extract key facts from content (first 200 chars)
                        facts.append(content[:200].strip())

                return facts

        except Exception as e:
            logger.debug(f"Context7 API call failed: {e}")
            return []

    async def _get_brave_facts(self, topic: str, keywords: List[str]) -> List[str]:
        """Get facts from Brave Search.

        Uses the existing web_search utility.
        """
        try:
            from ..utils.web_search import search_web

            # Build search query
            query = topic.replace("_", " ")
            if keywords:
                query += f" {keywords[0]}"

            # Search and extract facts from snippets
            search_results = await search_web(query, num_results=5)

            facts = []
            for result in search_results:
                # Create a fact from the title + snippet
                if result.get("snippet"):
                    fact = f"{result.get('title', '')}: {result['snippet']}"
                    facts.append(fact[:500])  # Limit length

            return facts
        except ImportError:
            logger.warning("web_search utility not available")
            return []
        except Exception as e:
            logger.error("Brave Search failed", error=str(e))
            return []
