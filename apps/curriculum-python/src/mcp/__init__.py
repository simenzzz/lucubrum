"""MCP (Model Context Protocol) integration package.

This package provides integration with MCP servers for fetching up-to-date
information about topics, used for staleness detection.
"""

from .facts import FactsService

__all__ = ["FactsService"]
