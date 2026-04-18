"""FastAPI entry point for the Haoma backend.

Run:  uvicorn haoma.api.main:app --reload --port 8000

Two modes:
  - default: live simulation + feature engine + PINN inference + SHAP
  - HAOMA_DEMO_MODE=1: replays a pre-computed scenario file (zero live compute)
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from haoma import __version__

app = FastAPI(
    title="Haoma",
    version=__version__,
    description="Physics-informed detection of pediatric microvascular collapse.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "version": __version__,
        "mode": "demo" if os.environ.get("HAOMA_DEMO_MODE") == "1" else "live",
    }


# TODO Dev 3: implement
#   - POST /observations  (FHIR-like Observation ingest with LOINC codes)
#   - WebSocket /ws       (push full frames every 2-3s — see CLAUDE.md for payload schema)
