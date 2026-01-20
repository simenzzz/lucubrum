"""Query suggestions model for YouTube search queries."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from .metadata import ArtifactMetadata


class QuerySuggestions(BaseModel):
    """Suggested YouTube search queries for a learning node."""

    schema_version: Literal["query_suggestions.v1"] = "query_suggestions.v1"
    plan_id: UUID
    node_id: str = Field(..., description="Reference to node within plan")
    queries: list[str] = Field(
        ...,
        min_length=1,
        max_length=5,
        description="1-5 search query strings",
    )
    metadata: ArtifactMetadata

    @field_validator("queries")
    @classmethod
    def validate_query_length(cls, v: list[str]) -> list[str]:
        """Ensure each query has at least 3 characters."""
        for i, query in enumerate(v):
            if len(query) < 3:
                raise ValueError(
                    f"Query at index {i} must have at least 3 characters, got: '{query}'"
                )
        return v
