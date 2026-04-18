"""API adapter tests — backend-schema → TypeScript-UI shape translation.

Catches silent drift at the wire edge: if the frontend renames a field in
``vite/src/types/api.ts`` without updating the adapter, these tests should
fail loudly (the UI contract is the test subject).
"""

from __future__ import annotations

import pytest

from haoma.api.adapters import (
    DEMO_START,
    frame_to_ui,
    patient_detail,
    ward_summary,
)
from haoma.simulator.scenarios import DEMO_SCENARIO_CONFIG

# Representative raw frame in the backend's native shape.
RAW_FRAME = {
    "timestamp": 180.0,
    "patient_id": "demo_patient",
    "vitals": {
        "timestamp": 180.0,
        "patient_id": "demo_patient",
        "hr": 112.5,
        "spo2": 96.2,
        "bp_sys": 91.1,
        "bp_dia": 57.8,
        "rr": 28.0,
        "t_central": 37.6,
        "t_periph": 35.9,
        "pi": 2.1,
        "rr_intervals": [540.0, 538.0, 542.0],
        "pleth_waveform": None,
    },
    "features": {
        "delta_t": 1.7,
        "hrv_trend": -0.05,
        "pi_hr_ratio": 0.019,
        "degradation_slope": 0.004,
    },
    "physics": {"resistance": 1.6, "flow": 0.75},
    "haoma_index": 0.42,
    "alert_level": "orange",
    "shap_contributions": [
        {"feature": "delta_t", "value": 0.12, "label": "Gradient thermique"},
    ],
    "recommendation": None,
}


# ---------------------------------------------------------------------------
# Vitals / features / physics key renames
# ---------------------------------------------------------------------------


def test_vitals_field_renames() -> None:
    out = frame_to_ui(RAW_FRAME)
    v = out["vitals"]
    assert v == {
        "heart_rate": 112.5,
        "spo2": 96.2,
        "bp_systolic": 91.1,
        "bp_diastolic": 57.8,
        "temp_central": 37.6,
        "temp_peripheral": 35.9,
        "perfusion_index": 2.1,
        "respiratory_rate": 28.0,
    }


def test_feature_field_renames() -> None:
    out = frame_to_ui(RAW_FRAME)
    assert set(out["features"].keys()) == {
        "delta_t",
        "hrv_trend_30min",
        "pi_fc_ratio",
        "degradation_slope_30min",
    }
    assert out["features"]["pi_fc_ratio"] == 0.019
    assert out["features"]["hrv_trend_30min"] == -0.05


def test_physics_expanded_with_delta_pct() -> None:
    out = frame_to_ui(RAW_FRAME)
    phy = out["physics"]
    assert set(phy.keys()) == {
        "resistance",
        "resistance_delta_pct",
        "flow",
        "flow_delta_pct",
    }
    # R = 1.6, baseline = 1.0 → +60 %
    assert phy["resistance"] == 1.6
    assert phy["resistance_delta_pct"] == pytest.approx(60.0)
    # Q = 0.75, baseline = 1.0 → −25 %
    assert phy["flow"] == 0.75
    assert phy["flow_delta_pct"] == pytest.approx(-25.0)


# ---------------------------------------------------------------------------
# Frame-level shape
# ---------------------------------------------------------------------------


def test_frame_full_top_level_keys() -> None:
    out = frame_to_ui(RAW_FRAME)
    assert set(out.keys()) == {
        "timestamp",
        "patient_id",
        "vitals",
        "features",
        "physics",
        "haoma_index",
        "haoma_trend",
        "alert_level",
        "macro_vitals_state",
        "shap_contributions",
        "projected_trajectory",
        "divergence",
        "recommendation",
    }


def test_timestamp_is_iso() -> None:
    out = frame_to_ui(RAW_FRAME)
    # 180 s after DEMO_START
    from datetime import timedelta

    expected = (DEMO_START + timedelta(seconds=180.0)).isoformat()
    assert out["timestamp"] == expected


def test_recommendation_null_coerced_to_empty_string() -> None:
    out = frame_to_ui(RAW_FRAME)
    assert out["recommendation"] == ""


def test_projected_trajectory_defaults_to_empty_list() -> None:
    out = frame_to_ui(RAW_FRAME)
    assert out["projected_trajectory"] == []


# ---------------------------------------------------------------------------
# Heuristics — trend, macro state, divergence
# ---------------------------------------------------------------------------


def test_haoma_trend_rising() -> None:
    history = [
        {**RAW_FRAME, "haoma_index": 0.10 + 0.005 * i} for i in range(30)
    ]
    out = frame_to_ui({**RAW_FRAME, "haoma_index": 0.28}, history=history)
    assert out["haoma_trend"] == "rising"


def test_haoma_trend_stable_when_short_history() -> None:
    out = frame_to_ui(RAW_FRAME, history=[])
    assert out["haoma_trend"] == "stable"


def test_macro_state_abnormal_on_collapse() -> None:
    crashing = {**RAW_FRAME, "vitals": {**RAW_FRAME["vitals"], "bp_sys": 60.0, "spo2": 88.0}}
    out = frame_to_ui(crashing)
    assert out["macro_vitals_state"] == "abnormal"


def test_divergence_active_on_silent_compensation() -> None:
    """Haoma rising (>0.4) while macro vitals still nominal = Phase-2 wow."""
    frame = {**RAW_FRAME, "haoma_index": 0.55}  # vitals in RAW_FRAME are nominal
    out = frame_to_ui(frame)
    assert out["divergence"]["active"] is True
    assert out["divergence"]["lead_minutes"] == 30.0


def test_divergence_inactive_when_macro_worsens() -> None:
    frame = {
        **RAW_FRAME,
        "haoma_index": 0.55,
        "vitals": {**RAW_FRAME["vitals"], "bp_sys": 62.0, "spo2": 85.0},
    }
    out = frame_to_ui(frame)
    assert out["divergence"]["active"] is False


# ---------------------------------------------------------------------------
# REST payloads
# ---------------------------------------------------------------------------


def test_ward_summary_shape() -> None:
    ward = ward_summary(RAW_FRAME)
    assert ward["hospital_name"]
    assert ward["ward_name"]
    assert ward["ward_short"]
    assert isinstance(ward["patients"], list)
    assert len(ward["patients"]) == 1

    p = ward["patients"][0]
    assert set(p.keys()) == {
        "patient_id",
        "room_number",
        "display_name",
        "age_years",
        "pathology",
        "haoma_index",
        "alert_level",
        "last_update",
    }
    assert p["patient_id"] == DEMO_SCENARIO_CONFIG["patient_id"]
    assert p["haoma_index"] == 0.42
    assert p["alert_level"] == "orange"


def test_patient_detail_shape() -> None:
    d = patient_detail()
    assert set(d.keys()) == {
        "patient_id",
        "room_number",
        "display_name",
        "age_years",
        "weight_kg",
        "pathology",
        "admission_date",
        "hospital_name",
        "ward_name",
    }
    assert d["patient_id"] == DEMO_SCENARIO_CONFIG["patient_id"]
    assert d["age_years"] == DEMO_SCENARIO_CONFIG["age_years"]
    assert d["weight_kg"] == DEMO_SCENARIO_CONFIG["weight_kg"]


# ---------------------------------------------------------------------------
# Live API smoke — new routes actually work through FastAPI
# ---------------------------------------------------------------------------


def test_patients_endpoint_live() -> None:
    from fastapi.testclient import TestClient

    from haoma.api.server import app

    c = TestClient(app)
    r = c.get("/patients")
    assert r.status_code == 200
    body = r.json()
    assert "patients" in body and len(body["patients"]) == 1


def test_patient_detail_endpoint_live() -> None:
    from fastapi.testclient import TestClient

    from haoma.api.server import app

    c = TestClient(app)
    r = c.get(f"/patients/{DEMO_SCENARIO_CONFIG['patient_id']}")
    assert r.status_code == 200
    assert r.json()["patient_id"] == DEMO_SCENARIO_CONFIG["patient_id"]


def test_patient_detail_unknown_id_404() -> None:
    from fastapi.testclient import TestClient

    from haoma.api.server import app

    c = TestClient(app)
    r = c.get("/patients/nonexistent")
    assert r.status_code == 404
