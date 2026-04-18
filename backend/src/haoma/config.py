"""Centralized constants for Haoma.

Single source of truth. No magic numbers elsewhere in the code. Clinical ranges,
physics bounds, alert thresholds, loss weights, PINN architecture, feature order,
and training hyperparameters all live here.
"""

from __future__ import annotations

from typing import Final

PEDIATRIC_RANGES: Final[dict[str, dict[str, float | str]]] = {
    "hr":        {"baseline": 95,   "min": 60,   "max": 200,  "unit": "bpm"},
    "spo2":      {"baseline": 98,   "min": 60,   "max": 100,  "unit": "%"},
    "bp_sys":    {"baseline": 100,  "min": 40,   "max": 160,  "unit": "mmHg"},
    "bp_dia":    {"baseline": 62,   "min": 20,   "max": 100,  "unit": "mmHg"},
    "rr":        {"baseline": 24,   "min": 10,   "max": 60,   "unit": "/min"},
    "t_central": {"baseline": 37.0, "min": 35.0, "max": 40.0, "unit": "°C"},
    "t_periph":  {"baseline": 36.5, "min": 30.0, "max": 38.0, "unit": "°C"},
    "pi":        {"baseline": 3.5,  "min": 0.1,  "max": 10.0, "unit": "%"},
}
# HRV is not simulated directly — the simulator emits R-R intervals, and the
# feature engine derives HRV from them.

PHYSICS_RANGES: Final[dict[str, dict[str, float]]] = {
    "R": {"min": 0.5, "max": 5.0},   # peripheral vascular resistance
    "Q": {"min": 0.1, "max": 3.0},   # micro-vascular flow
}
# No compliance C — head removed to simplify the loss.

R_BASELINE: Final[float] = 1.0

ALERT_THRESHOLDS: Final[dict[str, float]] = {
    "green":  0.3,
    "orange": 0.6,
    "red":    0.8,
}

# Composite loss: L_data + α·L_supervision + λ₁·L_pressure_flow + λ₂·L_conservation
LOSS_WEIGHTS: Final[dict[str, float]] = {
    "alpha":   0.05,   # weak supervision on R, Q from the simulator
    "lambda1": 0.10,   # Q ≈ ΔP / R physical constraint
    "lambda2": 0.08,   # temporal coherence of dQ/dt
}
# No lambda3 — the compliance head has been cut.

PINN_ARCHITECTURE: Final[dict[str, int | str]] = {
    "input_dim": 4,            # 4 features (not 6)
    "hidden_dim": 64,
    "n_hidden_layers": 3,
    "activation": "tanh",      # not relu — unstable with the physics loss
    "output_heads": 3,         # R, Q, Haoma Index (not 4)
}

# 4 features only — FEATURE_ORDER is the canonical vector ordering fed to the PINN.
FEATURE_ORDER: Final[list[str]] = [
    "delta_t",              # T_central - T_periph
    "hrv_trend",            # HRV slope on rolling window, computed from R-R intervals
    "pi_hr_ratio",          # PI / HR
    "degradation_slope",    # aggregated 30-min temporal derivative
]

WARMUP_DURATION_S: Final[int] = 1800   # 30 min of warmup before each stay

SIMULATION_HZ: Final[int] = 1
DEMO_DURATION_S: Final[int] = 360      # ~6 min demo across 4 phases

TRAINING: Final[dict[str, object]] = {
    "n_stays": 500,                         # hardware ceiling for 5-15 min CPU training
    "stay_duration_range": (7200, 21600),   # 2h-6h
    "stable_ratio": 0.35,
    "steepness_multiplier_range": (0.3, 1.5),
    "base_steepness": 0.025,
    "age_range": (1, 12),
    "batch_size": 256,
    "epochs": 100,
    "learning_rate": 1e-3,
    "shap_background_n": 100,
}
