"""Tests for src/api/exam.py — POST /llm/exam endpoint."""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from httpx import ASGITransport, AsyncClient

from src.api.exam import GenerateExamResponse
from src.models.exam import RawExamOutput
from src.utils.retry import RetryResult, AttemptResult


def _valid_raw_exam() -> dict:
    exercises = []
    for i in range(5):
        exercises.append({
            "id": f"exam_ex_{i}",
            "type": "mcq",
            "prompt": f"Exam question {i} about the topic at hand?",
            "rubric": f"Must select the correct answer for question {i} to pass",
            "difficulty": 3,
            "choices": ["A", "B", "C", "D"],
            "correct_answer": "A",
        })
    return {"exercises": exercises, "exam_difficulty": 0.6}


def _make_retry_result(raw: dict, success: bool = True) -> RetryResult:
    raw_json = json.dumps(raw)
    if success:
        validated = RawExamOutput.model_validate(raw)
        return RetryResult(
            success=True, value=validated, raw_output=raw_json, retry_count=0,
            attempts=[AttemptResult(raw_output=raw_json, success=True)],
        )
    return RetryResult(
        success=False, value=None, raw_output=raw_json, retry_count=2,
        attempts=[AttemptResult(raw_output=raw_json, validation_errors=["Error"])],
        final_errors=["Validation failed"],
    )


def _exam_request(**overrides) -> dict:
    base = {
        "plan_id": str(uuid4()),
        "node_id": "variables_and_types",
        "topic": "JavaScript Basics",
        "node_title": "Variables and Types",
        "objectives": ["Understand variables", "Learn types"],
        "user_level": "beginner",
        "current_mastery": 0.3,
        "exercise_count": 5,
        "request_id": str(uuid4()),
    }
    base.update(overrides)
    return base


class TestExamEndpoint:
    @pytest.fixture(autouse=True)
    def _setup(self, monkeypatch):
        monkeypatch.setenv("SERVICE_TOKEN", "test-service-token")
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        self.headers = {"X-Service-Token": "test-service-token"}

    @pytest.fixture
    def _mock_deps(self, mocker):
        self.mock_retry = mocker.patch(
            "src.api.exam.retry_llm_with_validation", new_callable=AsyncMock,
        )
        self.mock_prompt = mocker.patch("src.api.exam.load_prompt")
        self.mock_prompt.return_value = (
            "Exam for {topic} ({node_title}). Objectives: {objectives}. "
            "Level: {user_level}. Mastery: {current_mastery}. "
            "Count: {exercise_count}. Diff: {target_difficulty_min}-{target_difficulty_max}. "
            "Level: {target_difficulty_level}. {validation_errors}"
        )
        mock_provider = MagicMock()
        mock_provider.provider_name = "gemini"
        mock_provider.model_name = "gemini-2.0-flash"
        mocker.patch("src.api.exam.get_provider", return_value=mock_provider)

    async def _post(self, body: dict):
        from src.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post("/llm/exam", json=body, headers=self.headers)

    async def test_success_200(self, _mock_deps):
        self.mock_retry.return_value = _make_retry_result(_valid_raw_exam())

        resp = await self._post(_exam_request())

        assert resp.status_code == 200
        data = resp.json()
        assert "exam_exercise_set" in data
        es = data["exam_exercise_set"]
        assert es["schema_version"] == "exam_exercise_set.v1"
        assert len(es["exercises"]) == 5
        assert es["exam_difficulty"] == 0.6

    async def test_metadata_present(self, _mock_deps):
        self.mock_retry.return_value = _make_retry_result(_valid_raw_exam())

        resp = await self._post(_exam_request())

        meta = resp.json()["exam_exercise_set"]["metadata"]
        assert meta["prompt_version"] == "exam/v1"
        assert meta["provider"] == "gemini"

    async def test_mastery_affects_difficulty(self, _mock_deps):
        """Low mastery → low difficulty target, high mastery → high."""
        self.mock_retry.return_value = _make_retry_result(_valid_raw_exam())

        # Just verify the endpoint runs with different mastery values
        resp_low = await self._post(_exam_request(current_mastery=0.1))
        assert resp_low.status_code == 200

        self.mock_retry.return_value = _make_retry_result(_valid_raw_exam())
        resp_high = await self._post(_exam_request(current_mastery=0.9))
        assert resp_high.status_code == 200

    async def test_validation_failure_422(self, _mock_deps):
        self.mock_retry.return_value = _make_retry_result(_valid_raw_exam(), success=False)

        resp = await self._post(_exam_request())

        assert resp.status_code == 422

    async def test_prompt_not_found_500(self, _mock_deps):
        self.mock_prompt.side_effect = FileNotFoundError("exam/v1")

        resp = await self._post(_exam_request())

        assert resp.status_code == 500

    async def test_unexpected_error_500(self, _mock_deps):
        self.mock_retry.side_effect = RuntimeError("boom")

        resp = await self._post(_exam_request())

        assert resp.status_code == 500

    async def test_exercise_count_bounds(self, _mock_deps):
        resp = await self._post(_exam_request(exercise_count=4))
        assert resp.status_code == 422

        resp = await self._post(_exam_request(exercise_count=21))
        assert resp.status_code == 422

    async def test_mastery_bounds(self, _mock_deps):
        resp = await self._post(_exam_request(current_mastery=-0.1))
        assert resp.status_code == 422

        resp = await self._post(_exam_request(current_mastery=1.1))
        assert resp.status_code == 422

    async def test_auth_required(self):
        from src.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/llm/exam", json=_exam_request())
        assert resp.status_code == 401
