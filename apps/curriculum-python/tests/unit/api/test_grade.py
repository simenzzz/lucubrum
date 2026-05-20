"""Tests for src/api/grade.py — POST /llm/grade endpoint."""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from httpx import ASGITransport, AsyncClient

from src.api.grade import RawGradeOutput, _normalize_answer, _format_answer_for_prompt
from src.utils.retry import RetryResult, AttemptResult


# --- Helpers ---


def _grade_request(**overrides) -> dict:
    base = {
        "plan_id": str(uuid4()),
        "node_id": "variables_and_types",
        "exercise_id": "ex_1",
        "exercise_type": "mcq",
        "prompt": "What keyword declares a constant in JavaScript?",
        "rubric": "Must select the correct keyword from options provided",
        "correct_answer": "const",
        "user_answer": "const",
        "user_level": "beginner",
        "request_id": str(uuid4()),
    }
    base.update(overrides)
    return base


def _make_llm_grade_result(
    score: float = 0.85,
    is_correct: bool = True,
    feedback: str = "Good answer! You demonstrated understanding of the concept well.",
    misconceptions: list[str] | None = None,
    success: bool = True,
) -> RetryResult:
    raw = {
        "score": score,
        "is_correct": is_correct,
        "feedback": feedback,
        "misconceptions": misconceptions,
    }
    raw_json = json.dumps(raw)
    if success:
        validated = RawGradeOutput.model_validate(raw)
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


class TestGradeEndpoint:
    """Tests for POST /llm/grade."""

    @pytest.fixture(autouse=True)
    def _setup(self, monkeypatch):
        monkeypatch.setenv("SERVICE_TOKEN", "test-service-token")
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        self.headers = {"X-Service-Token": "test-service-token"}

    @pytest.fixture
    def _mock_llm_deps(self, mocker):
        """Mock deps for LLM-graded tests (short_answer, coding, fill_blank)."""
        self.mock_retry = mocker.patch(
            "src.api.grade.retry_llm_with_validation",
            new_callable=AsyncMock,
        )
        self.mock_prompt = mocker.patch("src.api.grade.load_prompt")
        self.mock_prompt.return_value = (
            "Grade this {exercise_type}. Prompt: {prompt}. "
            "Rubric: {rubric}. Correct: {correct_answer}. "
            "User: {user_answer}. Level: {user_level}. {validation_errors}"
        )
        mock_provider = MagicMock()
        mock_provider.provider_name = "gemini"
        mock_provider.model_name = "gemini-2.0-flash"
        mock_provider.generate = AsyncMock()
        mocker.patch("src.api.grade.get_provider", return_value=mock_provider)
        self.mock_provider = mock_provider

    async def _post(self, body: dict) -> "httpx.Response":
        from src.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post("/llm/grade", json=body, headers=self.headers)

    # --- Local grading (MCQ & flashcard) ---

    async def test_mcq_correct(self):
        resp = await self._post(_grade_request(
            exercise_type="mcq", correct_answer="const", user_answer="const"
        ))
        assert resp.status_code == 200
        grade = resp.json()["grade"]
        assert grade["is_correct"] is True
        assert grade["score"] == 1.0

    async def test_mcq_incorrect(self):
        resp = await self._post(_grade_request(
            exercise_type="mcq", correct_answer="const", user_answer="let"
        ))
        assert resp.status_code == 200
        grade = resp.json()["grade"]
        assert grade["is_correct"] is False
        assert grade["score"] == 0.0
        assert "const" in grade["feedback"]

    async def test_mcq_case_insensitive(self):
        resp = await self._post(_grade_request(
            exercise_type="mcq", correct_answer="const", user_answer="CONST"
        ))
        grade = resp.json()["grade"]
        assert grade["is_correct"] is True

    async def test_mcq_whitespace_normalized(self):
        resp = await self._post(_grade_request(
            exercise_type="mcq", correct_answer="const", user_answer="  const  "
        ))
        grade = resp.json()["grade"]
        assert grade["is_correct"] is True

    async def test_flashcard_correct(self):
        resp = await self._post(_grade_request(
            exercise_type="flashcard",
            correct_answer="HTTP Stateless",
            user_answer="http stateless",
        ))
        grade = resp.json()["grade"]
        assert grade["is_correct"] is True
        assert grade["score"] == 1.0

    async def test_flashcard_incorrect(self):
        resp = await self._post(_grade_request(
            exercise_type="flashcard",
            correct_answer="HTTP Stateless",
            user_answer="TCP Stateful",
        ))
        grade = resp.json()["grade"]
        assert grade["is_correct"] is False

    async def test_local_grading_metadata(self):
        resp = await self._post(_grade_request(exercise_type="mcq"))
        meta = resp.json()["grade"]["metadata"]
        assert meta["model"] == "local_grading"
        assert meta["prompt_version"] == "grade/local"
        assert meta["validation_retry_count"] == 0

    # --- LLM grading (short_answer, coding) ---

    async def test_short_answer_llm_success(self, _mock_llm_deps):
        self.mock_retry.return_value = _make_llm_grade_result(score=0.85, is_correct=True)

        resp = await self._post(_grade_request(
            exercise_type="short_answer",
            correct_answer="object",
            user_answer="object, due to a legacy bug",
        ))

        assert resp.status_code == 200
        grade = resp.json()["grade"]
        assert grade["score"] == 0.85
        assert grade["is_correct"] is True
        assert grade["metadata"]["provider"] == "gemini"

    async def test_coding_llm_with_misconceptions(self, _mock_llm_deps):
        self.mock_retry.return_value = _make_llm_grade_result(
            score=0.3,
            is_correct=False,
            feedback="The solution doesn't handle edge cases properly at all.",
            misconceptions=["Off-by-one error in loop bounds"],
        )

        resp = await self._post(_grade_request(
            exercise_type="coding",
            correct_answer={"language": "python", "solution": "def f(): pass"},
            user_answer="def f(): return None",
        ))

        grade = resp.json()["grade"]
        assert grade["score"] == 0.3
        assert grade["is_correct"] is False
        assert len(grade["misconceptions"]) == 1

    async def test_llm_validation_failure_422(self, _mock_llm_deps):
        self.mock_retry.return_value = _make_llm_grade_result(success=False)

        resp = await self._post(_grade_request(exercise_type="short_answer"))

        assert resp.status_code == 422
        assert resp.json()["detail"]["error"] == "VALIDATION_FAILED"

    async def test_unexpected_error_500(self, _mock_llm_deps):
        self.mock_retry.side_effect = RuntimeError("boom")

        resp = await self._post(_grade_request(exercise_type="short_answer"))

        assert resp.status_code == 500

    async def test_auth_required(self):
        from src.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/llm/grade", json=_grade_request())
        assert resp.status_code == 401


class TestNormalizeAnswer:
    """Tests for the _normalize_answer helper."""

    def test_lowercase(self):
        assert _normalize_answer("CONST") == "const"

    def test_strip(self):
        assert _normalize_answer("  const  ") == "const"

    def test_collapse_whitespace(self):
        assert _normalize_answer("hello   world") == "hello world"

    def test_combined(self):
        assert _normalize_answer("  Hello   WORLD  ") == "hello world"


class TestFormatAnswerForPrompt:
    """Tests for the _format_answer_for_prompt helper."""

    def test_string(self):
        assert _format_answer_for_prompt("hello") == "hello"

    def test_dict(self):
        result = _format_answer_for_prompt({"key": "val"})
        parsed = json.loads(result)
        assert parsed["key"] == "val"

    def test_list(self):
        result = _format_answer_for_prompt([1, 2, 3])
        assert json.loads(result) == [1, 2, 3]

    def test_number(self):
        assert _format_answer_for_prompt(42) == "42"
