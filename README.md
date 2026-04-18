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

## For developers

Full project instructions are in [`CLAUDE.md`](CLAUDE.md). Quick start:

```bash
# Backend
cd backend
./scripts/setup.sh
source .venv/bin/activate
pytest                   # must pass before coding

# Frontend
cd vite
npm install
npm run dev
```

See [`backend/README.md`](backend/README.md) and [`vite/CLAUDE.md`](vite/CLAUDE.md) for more.
