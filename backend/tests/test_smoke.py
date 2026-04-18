"""Smoke tests — verify the environment is set up correctly.

These must pass on every machine before any feature work begins.
"""

import random

import numpy as np
from fastapi.testclient import TestClient

from haoma import __version__
from haoma.api.main import app
from haoma.core import DEFAULT_SEED, loinc, set_seed
from haoma.schemas import (
    FeatureVector,
    PINNOutput,
    VitalsFrame,
    WebSocketFrame,
)


def test_package_importable() -> None:
    assert __version__ == "0.1.0"


def test_core_dependencies_importable() -> None:
    import numpy  # noqa: F401
    import pydantic  # noqa: F401
    import shap  # noqa: F401
    import torch  # noqa: F401


def test_health_endpoint() -> None:
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["version"] == __version__


def test_set_seed_is_deterministic() -> None:
    set_seed(DEFAULT_SEED)
    py_a = random.random()
    np_a = np.random.rand()

    set_seed(DEFAULT_SEED)
    py_b = random.random()
    np_b = np.random.rand()

    assert py_a == py_b
    assert np_a == np_b


def test_loinc_codes_are_unique() -> None:
    codes = [
        loinc.HEART_RATE,
        loinc.SPO2,
        loinc.BP_SYSTOLIC,
        loinc.BP_DIASTOLIC,
        loinc.TEMP_CENTRAL,
        loinc.TEMP_PERIPHERAL,
        loinc.PERFUSION_INDEX,
        loinc.RESPIRATORY_RATE,
    ]
    assert len(codes) == len(set(codes))
    assert set(loinc.VITAL_DISPLAY.keys()) == set(codes)
    assert set(loinc.VITAL_UNIT.keys()) == set(codes)


def test_schemas_round_trip() -> None:
    """Schemas parse and serialize cleanly — the contract is enforceable."""
    vitals = VitalsFrame(
        heart_rate=102,
        spo2=97,
        bp_systolic=95,
        bp_diastolic=58,
        temp_central=37.1,
        temp_peripheral=34.8,
        perfusion_index=1.2,
        respiratory_rate=24,
    )
    features = FeatureVector(
        delta_t=2.3,
        hrv_trend_30min=-0.42,
        pi_fc_ratio=0.012,
        degradation_slope_30min=-0.08,
    )
    output = PINNOutput(resistance=1.82, flow=0.61, haoma_index=0.72)
    frame = WebSocketFrame(
        timestamp="2026-04-18T14:32:05Z",
        patient_id="PED-2026-0042",
        vitals=vitals,
        features=features,
        physics={
            "resistance": output.resistance,
            "resistance_delta_pct": 40.2,
            "flow": output.flow,
            "flow_delta_pct": -24.8,
        },
        haoma_index=output.haoma_index,
        haoma_trend="rising",
        alert_level="orange",
        macro_vitals_state="nominal",
        shap_contributions=[
            {
                "feature": "hrv_trend_30min",
                "value": 0.09,
                "label": "Heart rate variability dropping",
            }
        ],
        projected_trajectory=[
            {"seconds_ahead": 0.0, "score": 72.0},
            {"seconds_ahead": 600.0, "score": 84.0},
        ],
        divergence={
            "active": True,
            "lead_minutes": 18.0,
            "rationale": "Haoma index rising while macro vitals remain nominal",
        },
        recommendation="Arterial blood gas check recommended",
    )
    # Round-trip through JSON
    reparsed = WebSocketFrame.model_validate_json(frame.model_dump_json())
    assert reparsed.haoma_index == 0.72
    assert reparsed.alert_level == "orange"
