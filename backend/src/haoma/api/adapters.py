"""Translate backend schema → TypeScript UI shape at the API boundary.

The backend (simulator / features / PINN / precompute) uses abbreviated field
names tuned for the pipeline — ``hr``, ``bp_sys``, ``pi_hr_ratio``, etc. The
Vite frontend's TypeScript types use the long FHIR-ish form — ``heart_rate``,
``bp_systolic``, ``pi_fc_ratio``. Rather than renaming across the whole
Python codebase + 51 tests, we translate once, here, at the wire edge.

Also owns the demo-ward hardcoded metadata (hospital / shift / charge nurse)
that the REST endpoints return. These values are scenario-specific and do
not belong in ``schemas.py``.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from haoma.config import R_BASELINE
from haoma.simulator.scenarios import DEMO_SCENARIO_CONFIG

# Synthetic demo clock. The WS loop advances 1 s per frame; REST endpoints
# derive timestamps from this base so the whole UI sees a coherent timeline.
DEMO_START = datetime(2026, 4, 18, 22, 30, 0, tzinfo=UTC)

HOSPITAL_NAME = "Hôpital pédiatrique Necker"
WARD_NAME = "Réanimation pédiatrique"
WARD_SHORT = "RÉA-PED"
BAY = "Box 3"
BEDS_TOTAL = 8
SHIFT_NAME = "Garde de nuit"
CHARGE_NURSE = "Pr. Bergounioux"
ADMISSION_DATE = "2026-04-17"
DISPLAY_NAME = "Enfant — 4 ans (post-greffe rénale)"

# Q baseline in the PINN's normalized output range. Q_sim = (ΔP/ΔP_ref)/R_sim
# ≈ 1.0 at stable → the delta-pct signal is relative to that unit flow.
Q_BASELINE = 1.0

# Trend detection thresholds (score delta per tick over a 30 s window).
_TREND_RISING = 0.003
_TREND_FALLING = -0.003


# ---------------------------------------------------------------------------
# Per-frame transform
# ---------------------------------------------------------------------------


def frame_to_ui(
    frame: dict[str, Any],
    history: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Translate one raw ``WebSocketFrame``-shape dict to the TS shape."""
    vitals = frame["vitals"]
    features = frame["features"]
    physics = frame["physics"]

    ts_iso = _iso_from_offset(float(frame["timestamp"]))
    macro_state = frame.get("macro_vitals_state") or _macro_state(vitals)

    return {
        "timestamp": ts_iso,
        "patient_id": frame["patient_id"],
        "vitals": _adapt_vitals(vitals),
        "features": _adapt_features(features),
        "physics": _adapt_physics(physics),
        "haoma_index": frame["haoma_index"],
        "haoma_trend": _haoma_trend(frame, history or []),
        "alert_level": frame["alert_level"],
        "macro_vitals_state": macro_state,
        "shap_contributions": frame["shap_contributions"],
        "projected_trajectory": frame.get("projected_trajectory") or [],
        "divergence": frame.get("divergence")
        or _divergence(frame["haoma_index"], macro_state),
        "recommendation": frame.get("recommendation") or "",
    }


def _adapt_vitals(v: dict[str, Any]) -> dict[str, Any]:
    return {
        "heart_rate": v["hr"],
        "spo2": v["spo2"],
        "bp_systolic": v["bp_sys"],
        "bp_diastolic": v["bp_dia"],
        "temp_central": v["t_central"],
        "temp_peripheral": v["t_periph"],
        "perfusion_index": v["pi"],
        "respiratory_rate": v["rr"],
    }


def _adapt_features(f: dict[str, Any]) -> dict[str, Any]:
    return {
        "delta_t": f["delta_t"],
        "hrv_trend_30min": f["hrv_trend"],
        "pi_fc_ratio": f["pi_hr_ratio"],
        "degradation_slope_30min": f["degradation_slope"],
    }


def _adapt_physics(p: dict[str, Any]) -> dict[str, Any]:
    R = p["resistance"]
    Q = p["flow"]
    return {
        "resistance": R,
        "resistance_delta_pct": (R - R_BASELINE) / R_BASELINE * 100.0,
        "flow": Q,
        "flow_delta_pct": (Q - Q_BASELINE) / Q_BASELINE * 100.0,
    }


def _haoma_trend(frame: dict[str, Any], history: list[dict[str, Any]]) -> str:
    """rising / falling / stable based on the last ~30 s of scores."""
    window = history[-30:] if history else []
    series = [f["haoma_index"] for f in window] + [frame["haoma_index"]]
    if len(series) < 3:
        return "stable"
    slope = (series[-1] - series[0]) / (len(series) - 1)
    if slope > _TREND_RISING:
        return "rising"
    if slope < _TREND_FALLING:
        return "falling"
    return "stable"


def _macro_state(v: dict[str, Any]) -> str:
    """Crude classical-vitals classifier — surfaced as a badge in the UI."""
    if v["bp_sys"] < 70 or v["spo2"] < 90:
        return "abnormal"
    if v["bp_sys"] < 80 or v["spo2"] < 94:
        return "borderline"
    return "nominal"


def _divergence(haoma_index: float, macro_state: str) -> dict[str, Any]:
    """Silent-compensation flag — the Phase-2 "wow" moment."""
    active = haoma_index > 0.4 and macro_state == "nominal"
    return {
        "active": active,
        "lead_minutes": 30.0 if active else None,
        "rationale": (
            "Haoma Index élevé alors que les constantes macro restent dans la norme."
            if active
            else None
        ),
    }


# ---------------------------------------------------------------------------
# REST payloads
# ---------------------------------------------------------------------------


def ward_summary(latest_frame: dict[str, Any]) -> dict[str, Any]:
    """Ward-view payload. ``latest_frame`` drives haoma / alert / last_update."""
    return {
        "hospital_name": HOSPITAL_NAME,
        "ward_name": WARD_NAME,
        "ward_short": WARD_SHORT,
        "bay": BAY,
        "beds_total": BEDS_TOTAL,
        "shift_name": SHIFT_NAME,
        "shift_end_iso": (DEMO_START + timedelta(hours=8)).isoformat(),
        "charge_nurse": CHARGE_NURSE,
        "monitoring_since_iso": DEMO_START.isoformat(),
        "frames_dropped": 0,
        "patients": [_patient_summary(latest_frame)],
    }


def _patient_summary(frame: dict[str, Any]) -> dict[str, Any]:
    return {
        "patient_id": DEMO_SCENARIO_CONFIG["patient_id"],
        "room_number": BAY,
        "display_name": DISPLAY_NAME,
        "age_years": DEMO_SCENARIO_CONFIG["age_years"],
        "pathology": DEMO_SCENARIO_CONFIG["pathology"],
        "haoma_index": frame["haoma_index"],
        "alert_level": frame["alert_level"],
        "last_update": _iso_from_offset(float(frame["timestamp"])),
    }


def patient_detail() -> dict[str, Any]:
    return {
        "patient_id": DEMO_SCENARIO_CONFIG["patient_id"],
        "room_number": BAY,
        "display_name": DISPLAY_NAME,
        "age_years": DEMO_SCENARIO_CONFIG["age_years"],
        "weight_kg": DEMO_SCENARIO_CONFIG["weight_kg"],
        "pathology": DEMO_SCENARIO_CONFIG["pathology"],
        "admission_date": ADMISSION_DATE,
        "hospital_name": HOSPITAL_NAME,
        "ward_name": WARD_NAME,
    }


def _iso_from_offset(seconds: float) -> str:
    return (DEMO_START + timedelta(seconds=seconds)).isoformat()
