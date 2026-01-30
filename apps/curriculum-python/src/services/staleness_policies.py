"""Staleness Policy Service

Loads and caches staleness policies from the database.
Policies define how often cached plans should be checked for freshness.
"""

import os
from datetime import datetime, timedelta
from typing import Dict
import asyncpg

from ..utils.logger import get_logger

logger = get_logger(__name__)


class StalenessPolicyService:
    """Service for managing staleness policies with database-backed caching."""

    def __init__(self, pool: asyncpg.Pool):
        """Initialize the policy service with a database connection pool.

        Args:
            pool: asyncpg connection pool
        """
        self.pool = pool
        self._cache: Dict[str, str] = {}
        self._cache_loaded_at: datetime | None = None
        self._cache_ttl = int(os.getenv("STALENESS_POLICIES_CACHE_TTL", "300"))

    async def get_policy(self, domain_category: str) -> str:
        """Get staleness policy for a domain, with fallback to 'general'.

        Args:
            domain_category: The domain category (e.g., 'ai', 'web', 'math')

        Returns:
            The policy value (e.g., '7d', '30d', 'never')
        """
        await self._ensure_cache()
        return self._cache.get(domain_category, self._cache.get("general", "30d"))

    async def get_all_policies(self) -> Dict[str, str]:
        """Get all active policies (for prompt injection).

        Returns:
            Dictionary mapping domain_category to policy_value
        """
        await self._ensure_cache()
        return self._cache.copy()

    async def get_policy_descriptions(self) -> Dict[str, str]:
        """Get all active policies with descriptions for the prompt.

        Returns:
            Dictionary mapping domain_category to description string
        """
        await self._ensure_cache()
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT domain_category, policy_value, description
                   FROM staleness_policies
                   WHERE is_active = true
                   ORDER BY domain_category"""
            )

            return {
                row["domain_category"]: f"{row['policy_value']} ({row['description']})"
                for row in rows
            }

    async def invalidate_cache(self) -> None:
        """Force reload the cache from database.

        Called via admin endpoint when policies are updated.
        """
        self._cache_loaded_at = None
        logger.info("Staleness policies cache invalidated")

    async def _ensure_cache(self) -> None:
        """Reload cache if expired."""
        now = datetime.now()
        if (
            self._cache_loaded_at is None
            or (now - self._cache_loaded_at).total_seconds() > self._cache_ttl
        ):
            await self._load_from_db()

    async def _load_from_db(self) -> None:
        """Load active policies from database into cache."""
        try:
            async with self.pool.acquire() as conn:
                rows = await conn.fetch(
                    """SELECT domain_category, policy_value
                       FROM staleness_policies
                       WHERE is_active = true"""
                )
                self._cache = {row["domain_category"]: row["policy_value"] for row in rows}
                self._cache_loaded_at = datetime.now()
                logger.info(
                    f"Loaded {len(self._cache)} staleness policies from database",
                    categories=list(self._cache.keys()),
                )
        except Exception as e:
            logger.error(f"Failed to load staleness policies from database: {e}")
            # Fallback to minimal defaults if database is unavailable
            self._cache = {"general": "30d"}
            self._cache_loaded_at = datetime.now()
