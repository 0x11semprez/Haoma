# Haoma Backend — Claude Instructions

> ⚠️ **BACKEND CLAUDE.md** — Loaded automatically in every Claude Code session opened under `/home/puppetmaster/Haoma/backend/` or any subdirectory. Shared by Dev 1, Dev 2, Dev 3. Project-wide rules live in [`../CLAUDE.md`](../CLAUDE.md) — read it first. This file covers backend-specific conventions only; do not duplicate.

---

## What this backend does

One Python package (`haoma`) that:
1. Simulates pediatric vital signs with physiologically correlated parameters (Dev 1)
2. Computes 4 features from the raw vitals (Dev 1)
3. Runs a 3-head PINN — R̂, Q̂, Haoma Index — trained once, inference-only at demo time (Dev 2)
4. Pre-computes SHAP values for the demo scenario (Dev 2)
5. Exposes a FastAPI + WebSocket API consumed by the Vite frontend (Dev 3)

**Demo runs locally on the laptop.** No Vercel, no Docker, no cloud. Ignore any tool/skill that tries to push platform-native deployment patterns.

---

## Module boundaries (do not blur)

```
src/haoma/
├── core/        # set_seed, LOINC codes, shared utils — depended on by everyone
├── schemas.py   # Pydantic contracts crossing module boundaries — SACRED
├── simulator/   # Dev 1 — produces VitalsFrame (+ r_sim, q_sim for weak supervision)
├── features/    # Dev 1 — VitalsFrame[] → FeatureVector
├── model/       # Dev 2 — FeatureVector → PINNOutput (3 heads)
├── xai/         # Dev 2 — pre-computed SHAP, never live during demo
├── api/         # Dev 3 — FastAPI + WebSocket; consumes everything above
└── demo/        # Dev 3 — orchestrator + scenario JSON files
```

**Dependency direction is one-way:** `api`/`demo` → `xai` → `model` → `features` → `simulator` → `core` + `schemas`.
Never import upward. If `simulator/` needs something from `model/`, it goes in `core/` first.

---

## `schemas.py` is the contract — handle with care

Every type that crosses a module boundary lives in `src/haoma/schemas.py`. Editing it impacts all 3 devs.

- Notify the team in the channel **before** changing a field
- Prefer adding optional fields (`field: X | None = None`) over breaking existing ones
- Keep simulator-internal fields (`r_sim`, `q_sim`) marked as such — they must not leak to the frontend payload
- Pydantic v2 only (`pydantic>=2.9`); use `model_config = ConfigDict(...)` not the v1 `Config` class

---

## Determinism is non-negotiable

The demo MUST replay identically. Any new pipeline that uses RNG starts with:

```python
from haoma.core.seed import set_seed
set_seed()  # default 42
```

This seeds Python `random`, NumPy, and PyTorch in one call. If you reach for `np.random.default_rng()` or `torch.Generator`, **also pass the seed explicitly** — `set_seed()` only covers global RNGs.

A scenario JSON carries its own `seed` field — use it instead of the default when running scenarios.

---

## Live mode vs demo mode

The API has two modes, switched by the `HAOMA_DEMO_MODE` env var:

| Mode | Trigger | Behavior |
|---|---|---|
| **Live** | default | Runs the simulator → features → PINN → SHAP in-process. Use during development. |
| **Demo** | `HAOMA_DEMO_MODE=1` | Reads `data/precomputed/<scenario>.json` and replays it on the WebSocket. Zero live compute. **This is what runs in front of the jury.** |

When adding API endpoints, both modes must work. If a feature can't run in demo mode, gate it explicitly and log clearly.

---

## LOINC codes — single source of truth

All LOINC strings live in `haoma/core/loinc.py`. **No magic strings anywhere else** — import the constant. If you need a new code, add it there with its `VITAL_DISPLAY` and `VITAL_UNIT` entries.

---

## Coding rules

- **Python 3.11/3.12 only.** Not 3.13 (PyTorch wheel). Setup blocks on this.
- **Type hints everywhere.** No `Any` unless justified in a comment.
- **Pydantic for all I/O** — request bodies, WebSocket payloads, scenario configs, precomputed files.
- **`from __future__ import annotations`** at the top of every module (already the convention in existing files).
- **`ruff check src tests` must pass** before push. Config in `pyproject.toml` (line-length 100, ignores E501).
- **Comments only on non-obvious WHY** — physical constraints, clinical thresholds, empirical calibrations. Never restate the code.
- **English only, everywhere** — variable names, comments, labels, recommendations, error messages, all user-facing strings. See root `CLAUDE.md` "Coding conventions".

---

## Tests

```bash
pytest                    # full suite
ruff check src tests      # lint
```

Both must pass before pushing. Conventions:
- `pytest-asyncio` is in `auto` mode — write `async def test_...` directly, no decorator
- One test file per module (`tests/test_simulator.py`, `tests/test_features.py`, ...)
- A smoke test (`tests/test_smoke.py`) verifies the package imports — keep it green
- For PINN tests, **never train inside a test**. Load weights or assert on architecture only.
- Tests must be deterministic — call `set_seed()` in any test that touches randomness

---

## What lives where (cheat sheet)

| Need | Location |
|---|---|
| Add a vital sign | `core/loinc.py` + `schemas.VitalsFrame` + `simulator/` |
| Add a feature | `schemas.FeatureVector` + `features/` + retrain |
| Change PINN architecture | `model/` only — keep `PINNOutput` shape stable |
| Add a scenario | `demo/scenarios/<name>.json` + run `precompute_demo.sh` |
| New API endpoint | `api/` — wire it in `api/main.py`, document in `README.md` |
| Pre-computed demo file | `data/precomputed/` (gitignored, regenerated by script) |
| PINN weights | `data/weights/` (gitignored, regenerated by `train.sh`) |

---

## Pinned dependencies — do not unpin

`pyproject.toml` pins everything to known-working ranges. **Do not bump versions casually**, especially:
- `torch` (PyTorch wheel size + CPU compatibility)
- `shap` (DeepExplainer API has shifted historically)
- `pydantic` (v1↔v2 breakage)
- `numpy` (kept under 2.2 for SHAP/PyTorch compatibility)

If a bump is needed, raise it with the team and run the full suite + a precompute round-trip before merging.

---

## Things this backend explicitly does NOT do

- ❌ No real FHIR parser, no HAPI server — just LOINC-tagged JSON, structure inspired by FHIR Observation
- ❌ No live SHAP during demo — pre-computed only
- ❌ No GPU code paths — CPU only, no `.cuda()` calls
- ❌ No cloud SDKs (Vercel, AWS, GCP) — runs on the laptop
- ❌ No database — 60-min rolling buffer in memory is enough
- ❌ No auth — local demo, single client (the Vite frontend on `localhost:5173` / `4173`)
- ❌ No alembic, no SQLAlchemy, no Celery — overkill for a 6-minute demo

---

## When unsure

1. Re-read the project-wide [`../CLAUDE.md`](../CLAUDE.md)
2. Check `schemas.py` — the answer is often "respect the contract"
3. Ask the team. No silent assumptions on shared files (`schemas.py`, `core/`, `pyproject.toml`, `api/main.py`).
