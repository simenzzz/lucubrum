"""Reading material model for LLM-generated learning content."""

from typing import Literal

from pydantic import BaseModel, Field

from .metadata import ArtifactMetadata


class ReadingMaterialSection(BaseModel):
    """A single section of reading material."""
    heading: str = Field(..., min_length=5, max_length=50, description="Section heading")
    content: str = Field(..., min_length=50, description="Section content in markdown")


class ReadingMaterial(BaseModel):
    """LLM-generated reading material from video transcripts."""
    schema_version: Literal["reading_material.v1"] = "reading_material.v1"
    plan_id: str = Field(..., description="Associated plan UUID")
    node_id: str = Field(..., description="Associated node ID within the plan")
    sections: list[ReadingMaterialSection] = Field(
        ..., min_length=1, max_length=8, description="1-8 sections of reading material"
    )
    metadata: ArtifactMetadata
