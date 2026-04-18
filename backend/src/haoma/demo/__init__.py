"""Demo orchestrator — Dev 3.

Runs deterministic demo scenarios for the jury. The actual demo reads a pre-computed
JSON file (simulator + features + PINN outputs + SHAP) and pushes it via WebSocket
at ~2-3s cadence. Zero live compute during the demo.

Scenarios are JSON files in haoma/demo/scenarios/.
Pre-computed outputs land in backend/data/precomputed/ (gitignored).

See ../../CLAUDE.md section "Script de démo (Dev 3) — 4 phases" for specs.
"""
