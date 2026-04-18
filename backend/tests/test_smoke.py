"""Smoke tests — verify the environment is set up correctly.

These must pass on every machine before any feature work begins.
"""

from fastapi.testclient import TestClient

from haoma import __version__
from haoma.api.main import app


def test_package_importable() -> None:
    assert __version__ == "0.1.0"


def test_core_dependencies_importable() -> None:
    import numpy  # noqa: F401
    import pydantic  # noqa: F401
    import shap  # noqa: F401
    import torch  # noqa: F401


def test_health_endpoint() -> None:
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["version"] == __version__
