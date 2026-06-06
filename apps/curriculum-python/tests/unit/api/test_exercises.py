"""Tests for src/api/exercises.py — POST /llm/exercises endpoint."""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from httpx import ASGITransport, AsyncClient

from src.api.exercises import RawExerciseOutput
from src.utils.retry import RetryResult, AttemptResult


# --- Helpers ---


def _valid_raw_exercises() -> dict:
    return {
        "exercises": [
            {
                "id": "ex_1",
                "type": "mcq",
                "prompt": "What keyword declares a constant in JavaScript?",
                "rubric": "Must select the correct keyword that declares a constant",
                "difficulty": 2,
                "choices": ["var", "let", "const", "define"],
                "correct_answer": "const",
            },
            {
                "id": "ex_2",
                "type": "short_answer",
                "prompt": "What is the typeof null in JavaScript?",
                "rubric": "Must answer with the correct primitive type string",
                "difficulty": 3,
                "correct_answer": "object",
            },
        ]
    }


def _make_retry_result(raw: dict, success: bool = True) -> RetryResult:
    raw_json = json.dumps(raw)
    if success:
        validated = RawExerciseOutput.model_validate(raw)
        return RetryResult(
            success=True,
            value=validated,
            raw_output=raw_json,
            retry_count=0,
            attempts=[AttemptResult(raw_output=raw_json, success=True)],
        )
    return RetryResult(
        success=False,
        value=None,
        raw_output=raw_json,
        retry_count=2,
        attempts=[AttemptResult(raw_output=raw_json, validation_errors=["Error"])],
        final_errors=["Validation failed"],
    )


def _exercise_request(**overrides) -> dict:
    base = {
        "plan_id": str(uuid4()),
        "node_id": "variables_and_types",
        "topic": "JavaScript Basics",
        "node_title": "Variables and Types",
        "objectives": ["Understand variables", "Learn data types"],
        "user_level": "beginner",
        "exercise_types": ["mcq", "short_answer"],
        "count": 5,
        "difficulty_target": 3,
        "request_id": str(uuid4()),
    }
    base.update(overrides)
    return base


class TestExercisesEndpoint:
    """Tests for POST /llm/exercises."""

    @pytest.fixture(autouse=True)
    def _setup(self, monkeypatch):
        monkeypatch.setenv("SERVICE_TOKEN", "test-service-token")
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        self.headers = {"X-Service-Token": "test-service-token"}

    @pytest.fixture
    def _mock_deps(self, mocker):
        self.mock_retry = mocker.patch(
            "src.api.exercises.retry_llm_with_validation",
            new_callable=AsyncMock,
        )
        self.mock_prompt = mocker.patch("src.api.exercises.load_prompt")
        self.mock_prompt.return_value = (
            "Generate exercises for {topic} ({node_title}). "
            "Objectives: {objectives}. Level: {user_level}. "
            "Difficulty: {difficulty_target}. Types: {exercise_types}. "
            "Count: {count}. {validation_errors}"
        )
        mock_provider = MagicMock()
        mock_provider.provider_name = "gemini"
        mock_provider.model_name = "gemini-2.0-flash"
        mock_provider.generate = AsyncMock()
        mocker.patch("src.api.exercises.get_provider", return_value=mock_provider)
        self.mock_provider = mock_provider

    async def _post(self, body: dict) -> "httpx.Response":
        from src.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post("/llm/exercises", json=body, headers=self.headers)

    async def test_success_200(self, _mock_deps):
        raw = _valid_raw_exercises()
        self.mock_retry.return_value = _make_retry_result(raw)

        resp = await self._post(_exercise_request())

        assert resp.status_code == 200
        data = resp.json()
        assert "exercise_set" in data
        es = data["exercise_set"]
        assert es["schema_version"] == "exercise_set.v1"
        assert len(es["exercises"]) == 2

    async def test_metadata_present(self, _mock_deps):
        self.mock_retry.return_value = _make_retry_result(_valid_raw_exercises())

        resp = await self._post(_exercise_request())

        meta = resp.json()["exercise_set"]["metadata"]
        assert meta["provider"] == "gemini"
        assert len(meta["raw_output_hash"]) == 64

    async def test_discriminated_types_preserved(self, _mock_deps):
        self.mock_retry.return_value = _make_retry_result(_valid_raw_exercises())

        resp = await self._post(_exercise_request())

        exercises = resp.json()["exercise_set"]["exercises"]
        types = {e["type"] for e in exercises}
        assert "mcq" in types
        assert "short_answer" in types

    async def test_validation_failure_422(self, _mock_deps):
        self.mock_retry.return_value = _make_retry_result(_valid_raw_exercises(), success=False)

        resp = await self._post(_exercise_request())

        assert resp.status_code == 422
        assert resp.json()["detail"]["error"] == "VALIDATION_FAILED"

    async def test_prompt_not_found_500(self, _mock_deps):
        self.mock_prompt.side_effect = FileNotFoundError("not found")

        resp = await self._post(_exercise_request())

        assert resp.status_code == 500
        assert resp.json()["detail"]["error"] == "CONFIGURATION_ERROR"

    async def test_unexpected_error_500(self, _mock_deps):
        self.mock_retry.side_effect = RuntimeError("boom")

        resp = await self._post(_exercise_request())

        assert resp.status_code == 500

    async def test_count_bounds_validation(self, _mock_deps):
        resp = await self._post(_exercise_request(count=0))
        assert resp.status_code == 422

        resp = await self._post(_exercise_request(count=21))
        assert resp.status_code == 422

    async def test_auth_required(self):
        from src.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/llm/exercises", json=_exercise_request())
        assert resp.status_code == 401
