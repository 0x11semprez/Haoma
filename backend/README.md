# Haoma Backend

Python backend for Haoma. Runs the patient simulator, feature engine, PINN model, SHAP explainer, and the FastAPI + WebSocket API that feeds the frontend dashboard.

## Requirements

- **Python 3.11 or 3.12** (not 3.13 — PyTorch compatibility)
- Linux / WSL Ubuntu / macOS
- ~5 GB of free disk space (PyTorch CPU wheel is ~900 MB)
- No GPU required — everything runs on CPU

## Setup (any machine)

```bash
cd backend
./scripts/setup.sh
source .venv/bin/activate
```

The setup script creates a virtual environment and installs all dependencies pinned in `pyproject.toml`. Reproducible on any machine with Python 3.11+.

### Manual setup (if the script fails)

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -e ".[dev]"
```

## Project layout

```
backend/
├── pyproject.toml              # Dependencies and tool config
├── README.md                   # This file
├── scripts/
│   ├── setup.sh                # Create venv + install deps
│   ├── train.sh                # Train the PINN (Dev 2)
│   └── precompute_demo.sh      # Pre-compute the demo scenario (Dev 2 + Dev 3)
├── src/haoma/
│   ├── simulator/              # Patient physiological simulator (Dev 1)
│   ├── features/               # Feature engine (Dev 1)
│   ├── model/                  # PINN multi-head PyTorch model (Dev 2)
│   ├── xai/                    # SHAP pre-computation (Dev 2)
│   ├── api/                    # FastAPI + WebSocket server (Dev 3)
│   └── demo/                   # Demo orchestrator + scenario JSON files (Dev 3)
├── tests/                      # Pytest suite
└── data/
    ├── weights/                # Saved PINN weights (gitignored)
    └── precomputed/            # Pre-computed demo scenarios (gitignored)
```

## Running the stack

### Dev mode (auto-reload)

```bash
source .venv/bin/activate
uvicorn haoma.api.main:app --reload --port 8000
```

### Demo mode (deterministic, reads pre-computed scenario)

```bash
HAOMA_DEMO_MODE=1 uvicorn haoma.api.main:app --port 8000
```

The API is then consumed by the frontend at `ws://localhost:8000/ws`.

## Training the PINN (Dev 2)

```bash
./scripts/train.sh
```

- Generates 500-1000 synthetic patient trajectories via the simulator
- Trains the 3-head PINN (R̂, Q̂, Haoma Index) with composite loss
- Saves weights to `data/weights/pinn.pt`
- CPU i7: ~5-15 minutes

## Pre-computing the demo scenario (before the hackathon demo)

```bash
./scripts/precompute_demo.sh src/haoma/demo/scenarios/stable_to_degradation.json
```

- Runs the simulator on the full demo scenario
- Computes features, PINN outputs, and SHAP values for every timestep
- Saves to `data/precomputed/<scenario_name>.json`
- During the demo, the API replays this file (zero live compute, zero lag risk)

## Testing

```bash
pytest
```

## Conventions

- Type hints everywhere
- Pydantic models for all API schemas
- `ruff check src tests` for lint
- Comments only on non-obvious WHY (physical constraints, clinical thresholds, empirical calibrations)

See the project-wide `../CLAUDE.md` for architectural decisions and non-negotiables.
