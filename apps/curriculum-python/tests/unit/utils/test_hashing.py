"""Tests for src/utils/hashing.py — SHA-256 hashing utilities."""

from src.utils.hashing import compute_sha256, compute_sha256_bytes


class TestComputeSha256:
    def test_returns_64_char_hex(self):
        result = compute_sha256("hello")
        assert len(result) == 64
        assert all(c in "0123456789abcdef" for c in result)

    def test_deterministic(self):
        assert compute_sha256("test") == compute_sha256("test")

    def test_different_inputs_different_hashes(self):
        assert compute_sha256("a") != compute_sha256("b")

    def test_empty_string(self):
        result = compute_sha256("")
        assert len(result) == 64


class TestComputeSha256Bytes:
    def test_returns_64_char_hex(self):
        result = compute_sha256_bytes(b"hello")
        assert len(result) == 64

    def test_consistent_with_string_version(self):
        assert compute_sha256("hello") == compute_sha256_bytes(b"hello")
