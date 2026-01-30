"""Models for topic normalization."""

from typing import Literal
from pydantic import BaseModel, Field

from .metadata import ArtifactMetadata


class NormalizeTopicRequest(BaseModel):
    """Request to normalize a topic."""

    topic: str = Field(..., description="The raw topic string to normalize", min_length=1)
    request_id: str = Field(..., description="Unique request ID for tracing")


class DomainCategory(str):
    """Allowed domain categories for staleness policies.

    These must match the domain_category values in the staleness_policies table.
    """

    MATH = "math"
    CS = "cs"
    NETWORKING = "networking"
    CLOUD = "cloud"
    WEB = "web"
    AI = "ai"
    GENERAL = "general"


class StalenessPolicyValue(str):
    """Allowed staleness policy values.

    These determine how often cached plans should be checked for freshness.
    """

    NEVER = "never"
    SEVEN_DAYS = "7d"
    THIRTY_DAYS = "30d"
    NINETY_DAYS = "90d"
    ANNUAL = "annual"


class NormalizeTopicResponse(BaseModel):
    """Response from topic normalization."""

    topic_normalized: str = Field(
        ..., description="Canonical form of the topic (lowercase with underscores)"
    )
    domain_category: Literal[
        "math", "cs", "networking", "cloud", "web", "ai", "general"
    ] = Field(..., description="The domain category for staleness determination")
    staleness_policy: Literal["never", "7d", "30d", "90d", "annual"] = Field(
        ..., description="How often cached plans for this topic should be checked"
    )
    metadata: ArtifactMetadata = Field(..., description="LLM generation metadata")
