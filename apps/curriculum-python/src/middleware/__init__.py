"""Middleware modules for the Curriculum service."""

from .service_auth import ServiceTokenMiddleware

__all__ = ["ServiceTokenMiddleware"]
