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


# TODO Dev 3: implement the routes listed in backend/CLAUDE.md §"API surface".
# Short form:
#   - POST /auth/badge           → AuthSession        (hackathon auth, any badge)
#   - GET  /patients             → WardSummary
#   - GET  /patients/{id}        → PatientDetail
#   - WS   /ws/patients/{id}     → WebSocketFrame stream (2–3 s cadence)
# Frame contract (projected_trajectory, macro_vitals_state, divergence, ...) is
# documented in backend/CLAUDE.md — keep it in sync with haoma.schemas.
#
# The Vite proxy strips the `/api` prefix, so mount REST at root (not `/api/...`).
