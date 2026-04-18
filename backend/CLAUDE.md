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

## API surface — what Dev 3 ships

The Vite frontend proxies `/api/*` → `http://localhost:8000/*` (prefix stripped — see `vite/vite.config.ts`). Mount routes at root, **not** under `/api`. WebSockets are proxied as-is under `/ws`.

**Required endpoints** (frontend already calls these via `vite/src/lib/api.ts`):

| Method | Path                | Response                               | Notes |
|--------|---------------------|----------------------------------------|---|
| GET    | `/health`           | `{ status, version, mode }`            | Already live; mode is `"live"` or `"demo"` |
| POST   | `/auth/badge`       | `AuthSession`                          | Body `{ badge_id: str }`. Hackathon auth: accept any badge, return a token |
| GET    | `/patients`         | `WardSummary`                          | Hospital + ward + list of `PatientSummary` |
| GET    | `/patients/{id}`    | `PatientDetail`                        | 404 if unknown |
| WS     | `/ws/patients/{id}` | stream of `WebSocketFrame` every 2–3 s | Closes on unsubscribe; on reconnect, resumes from live step — no replay |

Pydantic types for `AuthSession`, `WardSummary`, `PatientSummary`, `PatientDetail` **do not yet exist in `schemas.py`** — add them before wiring the routes (mirror the field names in `vite/src/types/ui.ts` 1:1).

### WebSocketFrame — the contract (updated 2026-04-18)

The frame is the single product the frontend renders. Every field below is **non-optional** — emit a sensible default rather than omitting a key, or the UI panels collapse.

| Field | Type | Produced by | Notes |
|---|---|---|---|
| `timestamp` | ISO-8601 string | `api/` | UTC, millisecond precision |
| `patient_id` | str | `api/` | Echo of the path param |
| `vitals` | `VitalsFrame` | `simulator/` | Raw simulator output. **Do not include `r_sim` / `q_sim` in the payload** — strip before send |
| `features` | `FeatureVector` | `features/` | Computed from the rolling buffer, not the single frame |
| `physics` | `PhysicsSummary` | `model/` | R̂, Q̂ and their % delta vs baseline (`R_BASELINE=1.2`, `Q_BASELINE=1.4`) |
| `haoma_index` | float ∈ [0,1] | `model/` | Head 3 of the PINN |
| `haoma_trend` | `rising` / `stable` / `falling` | `api/` | First-derivative of `haoma_index` over the last N frames — not a PINN output |
| `alert_level` | `green` / `orange` / `red` | `api/` | Thresholds live in the scenario JSON (`alert_thresholds`), not hardcoded here |
| `macro_vitals_state` | `nominal` / `borderline` / `abnormal` | `api/` | Classification of `vitals` against pediatric ranges — see below |
| `shap_contributions` | `ShapContribution[]` | `xai/` | Top-K (K ≥ 3). Label is a short English clause, not a feature-name dump |
| `projected_trajectory` | `ProjectedPoint[]` | `model/` (future: PINN forecast) · `api/` (today: slope extrapolation) | Horizon ~60 s; emit ≥ 20 samples so the dashed line looks smooth |
| `divergence` | `DivergenceSignal` | `api/` | Phase 2 moment — see below |
| `recommendation` | str | `api/` | English, imperative, ≤ 2 sentences. Sourced from the medical advisor's vocabulary list |

**`macro_vitals_state` classifier (pediatric 4-year-old):**
```
out_of_range = 0
if HR   < 80  or HR   > 120 : out_of_range += 1
if SpO2 < 95                : out_of_range += 1
if BPs  < 90  or BPs  > 110 : out_of_range += 1
if RR   < 20  or RR   > 30  : out_of_range += 1

if out_of_range == 0: "nominal"
elif out_of_range <= 2: "borderline"
else: "abnormal"
```
Thermal gradient (`features.delta_t`) is intentionally excluded — it belongs to the micro view, not the macro view. That exclusion IS the pitch.

**`divergence` rule:** set `active=True` iff `macro_vitals_state == "nominal"` AND `haoma_index >= 0.35`. When active, compute `lead_minutes` by scanning `projected_trajectory` for the first sample whose score ≥ 80 (critical threshold) and converting its `seconds_ahead` to minutes. `rationale` is an English one-liner — keep it medical, not marketing. When inactive, set all three fields to `False / None / None`.

### SHAP labels — two strategies (pick one before the demo)

The `shap_contributions[].label` field is what the jury actually reads. A feature name dump (`hrv_trend_30min`) is a pitch killer; a clinical phrase (*"Peripheral vasoconstriction · ΔT widened 2.3°C over 20 min"*) is the moment that sells the project. Two options — discuss with Dev 3 and the medical advisor before freezing:

**Option A — Backend-owned static labels (simple, safe, default).**
The `xai/` module owns a `feature → phrase` mapping validated by the medical advisor. Labels are short English clauses, invariant to the value magnitude. Frontend displays `label` verbatim.
- Pros: one source of truth, frontend has zero clinical logic, trivial to review.
- Cons: same phrase regardless of how large the effect is — the sentence doesn't "breathe" with the patient.
- Implementation: a `haoma.xai.phrases.PHRASES: dict[str, str]` keyed on feature name, 8-12 entries, validated by the medical advisor. Pick the entry for the feature with the highest `|value|`.

**Option B — Parametric phrases generated from value + vitals (ambitious).**
The backend still sends a short `label`, but the frontend overrides it via a `lib/clinical.ts` dictionary of `(feature, value, vitals) → phrase`, producing sentences like *"ΔT widened to {vitals.temp_central − vitals.temp_peripheral}°C"* or *"HRV dropped {|value|·100}% over 30 min"*. The phrase updates frame-by-frame, giving the jury a "live diagnostic" feel.
- Pros: wow factor — the explanation visibly tracks the physiology.
- Cons: the medical advisor must validate every template (pediatric phrasing ≠ adult phrasing), and a template bug during the demo is a jury-visible error. Any numeric value rendered in a phrase must be rounded to one decimal and carry its unit.
- Implementation: backend ships clean `value` and full `vitals` (already the case); frontend owns the phrasing dictionary. Backend still sets a sane fallback `label` so a missing dictionary entry degrades gracefully to Option A output.

**Decision rule.** Start with Option A (30 min of work, zero risk). Upgrade to Option B only if (a) the phrases are all signed off by the medical advisor at least 24 h before the demo, and (b) the Option-A fallback is wired so an unknown feature never renders a template placeholder.

**What the backend MUST NOT do either way:** do not hardcode values inside the label string server-side (e.g. *"ΔT widened to 2.3°C"*) — that couples the label to one frame. If the template is parametric, ship the raw value and let the frontend (Option B) or a fixed clause (Option A) handle rendering. That keeps a single timestamp of truth.

### Example `WebSocketFrame` (trimmed)

```json
{
  "timestamp": "2026-04-18T15:42:03.120Z",
  "patient_id": "p-001",
  "vitals": { "heart_rate": 118, "spo2": 97, "bp_systolic": 98, "bp_diastolic": 58, "temp_central": 37.6, "temp_peripheral": 34.8, "perfusion_index": 1.1, "respiratory_rate": 28 },
  "features": { "delta_t": 2.8, "hrv_trend_30min": -0.42, "pi_fc_ratio": 0.0093, "degradation_slope_30min": 0.018 },
  "physics": { "resistance": 2.1, "resistance_delta_pct": 75.0, "flow": 0.9, "flow_delta_pct": -35.7 },
  "haoma_index": 0.52,
  "haoma_trend": "rising",
  "alert_level": "orange",
  "macro_vitals_state": "nominal",
  "shap_contributions": [
    { "feature": "hrv_trend_30min", "value": 0.18, "label": "Heart-rate variability drifting downward" },
    { "feature": "delta_t", "value": 0.11, "label": "Thermal gradient slowly widening" }
  ],
  "projected_trajectory": [
    { "seconds_ahead": 2.0,  "score": 53.2 },
    { "seconds_ahead": 30.0, "score": 68.9 },
    { "seconds_ahead": 60.0, "score": 82.4 }
  ],
  "divergence": {
    "active": true,
    "lead_minutes": 1.0,
    "rationale": "Macro vitals still within pediatric range while the micro-score climbs — vascular reserve is being consumed silently."
  },
  "recommendation": "Close watch. Recheck vitals in 5 minutes."
}
```

### Testing the API locally

```bash
# 1. Start the backend (live mode)
cd backend && source .venv/bin/activate
uvicorn haoma.api.main:app --reload --port 8000

# 2. Smoke test REST
curl -s localhost:8000/health | jq
curl -s localhost:8000/patients | jq '.patients | length'
curl -s localhost:8000/patients/p-001 | jq
curl -s -X POST localhost:8000/auth/badge \
  -H 'content-type: application/json' \
  -d '{"badge_id":"test"}' | jq

# 3. Subscribe to the WebSocket and print one frame (requires `websocat`)
websocat -n1 ws://localhost:8000/ws/patients/p-001 | jq

# 4. Full Pydantic round-trip — validates the payload against schemas.py
python -c 'import json, sys; from haoma.schemas import WebSocketFrame; \
  WebSocketFrame.model_validate_json(sys.stdin.read()); print("OK")' \
  < sample_frame.json

# 5. End-to-end with the Vite frontend (mocks OFF)
#    vite/.env.development.local → set VITE_USE_MOCKS=0 (or remove the line)
#    then in vite/: npm run dev  (the DEVELOPER runs this, not Claude — see vite/CLAUDE.md)
```

**Local testing rules:**
- Validate every WS payload against `WebSocketFrame.model_validate()` in a unit test before shipping a new field. Silent drift breaks the UI.
- Write a `tests/test_api_frame.py` that subscribes, collects 5 frames over 10 s, and asserts all 13 top-level keys are present and typed.
- Demo-mode replay must emit the same shape as live mode — the only difference is where the values come from.

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
