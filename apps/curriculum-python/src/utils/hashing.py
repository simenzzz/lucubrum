"""Hashing utilities for artifact verification."""

import hashlib


def compute_sha256(data: str) -> str:
    """Compute SHA-256 hash of a string.

    Args:
        data: The string to hash.

    Returns:
        64-character lowercase hex string representing the hash.
    """
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def compute_sha256_bytes(data: bytes) -> str:
    """Compute SHA-256 hash of bytes.

    Args:
        data: The bytes to hash.

    Returns:
        64-character lowercase hex string representing the hash.
    """
    return hashlib.sha256(data).hexdigest()
