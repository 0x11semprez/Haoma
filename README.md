# Haoma

> Detecting vascular collapse in critically ill children — **hours before vital signs show anything is wrong.**

## The problem

In pediatric ICU, doctors watch blood pressure, heart rate, and oxygen saturation. But by the time those numbers drop, the damage has already started — in the smallest blood vessels, where nothing is being measured.

## What Haoma does

Haoma reads the data the monitor is already collecting and detects the silent warning signs of vascular collapse *before* the visible vitals react.

It gives the clinician three things:

- **A risk score** (0 to 1) that rises as the situation deteriorates.
- **Physical quantities** (vascular resistance, capillary flow) that a doctor can interpret.
- **A plain-language explanation** of *why* the score is rising.

It is a **decision-support tool**. Clinical judgment remains sovereign.

## How it works (in one sentence)

A small AI model — constrained by the laws of fluid dynamics — learns to recognize the pattern of silent micro-vascular degradation from standard monitoring data.

## Status

Hackathon prototype (MIT Hacking Medicine Paris). Not a medical device.

---

## Run it locally

**Prerequisites:** Python **3.11 or 3.12** (not 3.13 — PyTorch), Node **20+**, Git. Linux / WSL Ubuntu / macOS. No GPU required.

### 1. One-time setup (fresh clone)

```bash
git clone <repo> Haoma
cd Haoma

# Backend — creates .venv and installs pinned deps (~5 GB, PyTorch CPU wheel)
cd backend
./scripts/setup.sh
source .venv/bin/activate
pytest                       # smoke test — MUST pass before anything else

# Frontend
cd ../vite
npm install
```

If `pytest` fails on first clone, **stop and fix the setup** before writing any code.

### 2. (Optional) Train the model and pre-compute the demo

Needed once per machine that will actually run the backend in a non-demo mode. The repo ships without weights — they live under `backend/data/` (gitignored).

```bash
cd backend
source .venv/bin/activate
./scripts/train.sh               # ~5–15 min on CPU, writes data/weights/
./scripts/precompute_demo.sh     # writes data/precomputed/demo_scenario.json
```

For the canned demo (`HAOMA_DEMO_MODE=1`), only the pre-computed JSON is required.

### 3. Launch — two terminals

**Start the backend FIRST** so the frontend health probe catches it on load.

```bash
# Terminal 1 — backend (FastAPI + WebSocket on :8000)
cd backend
source .venv/bin/activate
HAOMA_DEMO_MODE=1 uvicorn haoma.api.server:app --reload --port 8000
```

```bash
# Terminal 2 — frontend (Vite dev server on :5173, opens the browser)
cd vite
npm run dev
```

Open http://localhost:5173 and sign in via the badge stub.

- **Backend down?** The frontend shows an amber *"Monitoring backend unreachable"* banner within ~5 s. That is correct — click **Retry** once the backend is up.
- **Backend in mock mode?** The frontend refuses to trust it and keeps the banner up. Run in `live` or `demo` mode only.

### 4. Backend on another host?

Default assumes `http://localhost:8000`. If the backend is off-origin:

```bash
cp vite/.env.example vite/.env.local
# set VITE_API_URL (bare origin, no /api suffix) and VITE_WS_URL
```

---

## How the pieces talk

```
Vite dev server :5173  ──/api/*── (proxy strips /api) ──►  FastAPI :8000  /patients, /health, …
                       ──/ws/*──  (pass-through)       ──►                 /ws/patients/{id}
```

The backend **never sees `/api/*`** — that prefix is a frontend-only convention rewritten by the Vite dev proxy (and by the prod reverse proxy, when there is one). WebSocket paths keep `/ws` on both sides.

Full integration contract (endpoints, frame schema, env vars) lives in [`CLAUDE.md`](CLAUDE.md).

---

## Useful commands

```bash
# Backend
cd backend && source .venv/bin/activate
pytest                           # full test suite (simulator, features, PINN, XAI, API, integration)
ruff check src tests             # lint

# Frontend
cd vite
npm run build                    # type-check + build (runs the no-mocks guard)
npm run lint                     # ESLint
```

Run both before pushing.

---

## For developers

Full project instructions, architecture decisions, roles, and the demo script are in [`CLAUDE.md`](CLAUDE.md). See also [`backend/README.md`](backend/README.md) and [`vite/CLAUDE.md`](vite/CLAUDE.md) (frontend design system).
