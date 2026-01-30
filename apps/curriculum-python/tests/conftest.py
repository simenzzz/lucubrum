import pytest
import asyncio
import os
import asyncpg

# Set test environment
os.environ["ENVIRONMENT"] = "test"


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
            "database": "learning_helper_test"
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
                "database": "learning_helper_test"
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
        # Log the error instead of silently passing
        import logging
        logging.warning(f"Database cleanup failed: {e}")


# Pytest configuration
def pytest_configure(config):
    """Configure pytest markers."""
    config.addinivalue_line("markers", "unit: Unit tests")
    config.addinivalue_line("markers", "integration: Integration tests")
    config.addinivalue_line("markers", "contract: Contract tests")
    config.addinivalue_line("markers", "e2e: End-to-end tests")
    config.addinivalue_line("markers", "slow: Slow running tests")
    config.addinivalue_line("markers", "llm: Tests that call LLM providers")
