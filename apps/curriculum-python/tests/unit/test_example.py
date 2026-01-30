"""Placeholder test to verify infrastructure works."""
import pytest


@pytest.mark.unit
def test_placeholder():
    """Placeholder test to verify pytest works."""
    assert True


@pytest.mark.unit
def test_environment():
    """Test that environment is set correctly."""
    import os
    assert os.environ.get("ENVIRONMENT") == "test"
