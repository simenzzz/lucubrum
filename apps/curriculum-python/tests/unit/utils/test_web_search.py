"""Tests for src/utils/web_search.py — Brave Search for exercise inspiration."""

import pytest
import respx
from httpx import Response

from src.utils.web_search import (
    search_exercises,
    _build_search_query,
    _parse_search_results,
    BRAVE_SEARCH_URL,
)


# --- Helpers ---

MOCK_BRAVE_RESPONSE = {
    "web": {
        "results": [
            {
                "title": "Python Quiz Questions",
                "description": "Practice Python MCQ questions.",
                "url": "https://example.com/python-quiz",
            },
            {
                "title": "JavaScript Exercises",
                "description": "Coding practice for JS.",
                "url": "https://example.com/js-exercises",
            },
        ]
    }
}


class TestSearchExercises:
    @respx.mock
    async def test_success(self, monkeypatch):
        monkeypatch.setenv("WEB_SEARCH_ENABLED", "true")
        monkeypatch.setenv("BRAVE_SEARCH_API_KEY", "test-api-key")

        respx.get(BRAVE_SEARCH_URL).mock(return_value=Response(200, json=MOCK_BRAVE_RESPONSE))

        results = await search_exercises("Python", "mcq")

        # Results include original items (dicts) + parsed SearchResult TypedDicts
        assert len(results) >= 2

    @respx.mock
    async def test_disabled_via_env(self, monkeypatch):
        monkeypatch.setenv("WEB_SEARCH_ENABLED", "false")
        monkeypatch.setenv("BRAVE_SEARCH_API_KEY", "test-api-key")

        results = await search_exercises("Python", "mcq")

        assert results == []

    async def test_missing_api_key_returns_empty(self, monkeypatch):
        monkeypatch.setenv("WEB_SEARCH_ENABLED", "true")
        monkeypatch.delenv("BRAVE_SEARCH_API_KEY", raising=False)

        results = await search_exercises("Python", "mcq")

        assert results == []

    @respx.mock
    async def test_429_quota_exceeded(self, monkeypatch):
        monkeypatch.setenv("WEB_SEARCH_ENABLED", "true")
        monkeypatch.setenv("BRAVE_SEARCH_API_KEY", "test-key")

        respx.get(BRAVE_SEARCH_URL).mock(return_value=Response(429, text="Rate limited"))

        results = await search_exercises("Python", "mcq")

        assert results == []

    @respx.mock
    async def test_500_server_error(self, monkeypatch):
        monkeypatch.setenv("WEB_SEARCH_ENABLED", "true")
        monkeypatch.setenv("BRAVE_SEARCH_API_KEY", "test-key")

        respx.get(BRAVE_SEARCH_URL).mock(return_value=Response(500, text="Server error"))

        results = await search_exercises("Python", "mcq")

        assert results == []

    @respx.mock
    async def test_timeout(self, monkeypatch):
        import httpx as httpx_lib
        monkeypatch.setenv("WEB_SEARCH_ENABLED", "true")
        monkeypatch.setenv("BRAVE_SEARCH_API_KEY", "test-key")

        respx.get(BRAVE_SEARCH_URL).mock(side_effect=httpx_lib.TimeoutException("timeout"))

        results = await search_exercises("Python", "mcq")

        assert results == []

    @respx.mock
    async def test_max_results_clamped(self, monkeypatch):
        monkeypatch.setenv("WEB_SEARCH_ENABLED", "true")
        monkeypatch.setenv("BRAVE_SEARCH_API_KEY", "test-key")

        route = respx.get(BRAVE_SEARCH_URL).mock(
            return_value=Response(200, json={"web": {"results": []}})
        )

        await search_exercises("Python", "mcq", max_results=50)

        assert route.calls[0].request.url.params["count"] == "10"


class TestBuildSearchQuery:
    def test_mcq(self):
        q = _build_search_query("Python", "mcq")
        assert "Python" in q
        assert "multiple choice" in q

    def test_coding(self):
        q = _build_search_query("Python", "coding")
        assert "programming" in q

    def test_unknown_type_fallback(self):
        q = _build_search_query("Python", "unknown_type")
        assert "practice questions" in q


class TestParseSearchResults:
    def test_parses_brave_response(self):
        results = _parse_search_results(MOCK_BRAVE_RESPONSE)
        assert len(results) >= 2

    def test_empty_response(self):
        results = _parse_search_results({"web": {"results": []}})
        assert results == []

    def test_missing_web_key(self):
        results = _parse_search_results({})
        assert results == []
