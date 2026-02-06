"""Pytest configuration and shared fixtures."""

import asyncio
import os

import asyncpg
import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, MagicMock

# Set test environment before any app imports
os.environ["ENVIRONMENT"] = "test"
os.environ.setdefault("SERVICE_TOKEN", "test-service-token")


@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def test_postgres():
    """PostgreSQL container for integration tests."""
    if os.environ.get("DOCKER_TEST_ENV"):
        # Running in Docker Compose
        yield {
            "host": "test-postgres",
            "port": 5432,
            "user": "test_user",
            "password": "test_password",
            "database": "learning_helper_test",
        }
    else:
        # Fallback to testcontainers for local dev
        try:
            from testcontainers.postgres import PostgresContainer

            with PostgresContainer("postgres:15-alpine") as postgres:
                yield {
                    "host": postgres.get_container_host_ip(),
                    "port": postgres.get_exposed_port(5432),
                    "user": postgres.username,
                    "password": postgres.password,
                    "database": postgres.dbname,
                }
        except ImportError:
            # Local fallback without testcontainers
            yield {
                "host": "localhost",
                "port": 5433,
                "user": "test_user",
                "password": "test_password",
                "database": "learning_helper_test",
            }


@pytest.fixture
async def cleanup_database(test_postgres):
    """Clean database between integration tests.

    Note: This fixture is NOT autouse - only apply to tests marked with @pytest.mark.integration
    to avoid unnecessary database connections in unit tests.
    """
    yield
    # Truncate tables after each test for isolation
    dsn = (
        f"postgresql://{test_postgres['user']}:{test_postgres['password']}@"
        f"{test_postgres['host']}:{test_postgres['port']}/{test_postgres['database']}"
    )
    try:
        conn = await asyncpg.connect(dsn)
        await conn.execute("""
            TRUNCATE user_plans, staleness_policies, plans, nodes, exercises,
                    attempts, user_mastery, resources, refresh_tokens,
                    quality_metrics CASCADE
        """)
        await conn.close()
    except Exception as e:
        import logging
        logging.warning(f"Database cleanup failed: {e}")


# Register LLM mock fixtures so they're available to all tests
pytest_plugins = ["tests.fixtures.llm_mocks"]


# --- Unit test fixtures ---


@pytest.fixture
def test_client():
    """Async HTTP client wired to the FastAPI app via ASGI transport.

    Automatically injects a valid X-Service-Token header so tests
    don't need to worry about auth unless they're specifically testing it.
    """
    from src.main import app

    async def _make_client(headers: dict | None = None):
        default_headers = {"X-Service-Token": "test-service-token"}
        if headers:
            default_headers.update(headers)
        transport = ASGITransport(app=app)
        return AsyncClient(transport=transport, base_url="http://test", headers=default_headers)

    return _make_client


@pytest.fixture
def mock_service_token(monkeypatch):
    """Set SERVICE_TOKEN env var and return auth headers dict."""
    token = "test-service-token"
    monkeypatch.setenv("SERVICE_TOKEN", token)
    return {"X-Service-Token": token}


@pytest.fixture
def mock_load_prompt(mocker):
    """Patch load_prompt to return a controllable template string.

    Returns the mock so tests can set .return_value or .side_effect.
    """
    mock = mocker.patch("src.utils.prompts.load_prompt")
    mock.return_value = "Generate {topic} for {user_level}. {validation_errors}"
    return mock


@pytest.fixture
def mock_provider(mocker):
    """Patch get_provider to return a mock LLMProvider.

    Returns the mock provider instance.
    """
    provider = AsyncMock()
    provider.provider_name = "gemini"
    provider.model_name = "gemini-2.0-flash"
    provider.generate = AsyncMock(return_value='{"stub": true}')
    mocker.patch("src.providers.base.get_provider", return_value=provider)
    return provider


# Pytest configuration
def pytest_configure(config):
    """Configure pytest markers."""
    config.addinivalue_line("markers", "unit: Unit tests")
    config.addinivalue_line("markers", "integration: Integration tests")
    config.addinivalue_line("markers", "contract: Contract tests")
    config.addinivalue_line("markers", "e2e: End-to-end tests")
    config.addinivalue_line("markers", "slow: Slow running tests")
    config.addinivalue_line("markers", "llm: Tests that call LLM providers")
