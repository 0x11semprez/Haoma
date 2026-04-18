# Haoma

> Detecting microvascular collapse in critically ill children — **hours before vital signs show anything is wrong.**

Hackathon project — MIT Hacking Medicine Paris.

## Problem

In pediatric ICU, monitoring relies on macro-circulation: blood pressure, heart rate, SpO2. But cellular damage starts in the micro-circulation (capillaries), hours before the numbers on the monitor move. By the time vital signs react, it is too late.

## What Haoma does

A Physics-Informed Neural Network (PINN) detects silent micro-vascular degradation from standard hospital monitoring data. It outputs:

- **R̂** — estimated peripheral vascular resistance
- **Q̂** — estimated micro-vascular flow
- **Haoma Index** — clinical risk score (0-1)
- **SHAP explanations** — which features are driving the risk

The PINN constrains physical outputs via Navier-Stokes-inspired loss terms, so the model's predictions stay physically coherent.

## Architecture

```
Scope data (sim) → FHIR-like API → Feature engine → PINN (3 heads) → SHAP → WebSocket → Dashboard
```

- **Backend** — Python, FastAPI, PyTorch, SHAP
- **Frontend** — React + Vite + Tailwind + Recharts (in `vite/`)
- **Runtime** — CPU only (i7, 16 GB RAM, WSL). Model trained once, inference only during demo.

## Repository layout

```
Haoma/
├── CLAUDE.md      # Project-wide instructions (loaded in every Claude Code session)
├── README.md      # You are here
├── backend/       # Python backend — simulator, PINN, API, SHAP
│   └── README.md  # Backend setup & usage
└── vite/          # Frontend React app
```

## Quick start

```bash
# Backend
cd backend
./scripts/setup.sh
source .venv/bin/activate
uvicorn haoma.api.main:app --reload

# Frontend (separate terminal)
cd vite
npm install
npm run dev
```

Full setup instructions: see [`backend/README.md`](backend/README.md).

## Team

Three developers and one medical advisor. Dev roles split across simulator / model / API+frontend — see `CLAUDE.md`.

## Status

Hackathon prototype. Not a medical device. Decision-support concept only — clinical judgment remains sovereign.
