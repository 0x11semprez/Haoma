"""HAOMA — end-to-end pipeline integration test.

Checks the whole chain on a compressed 120-second scenario:

    simulator → features → PINN → SHAP → WebSocketFrame

Runs as a pytest test (skips if no trained weights are available) AND as a
script that prints a detailed pass/fail report.

    pytest tests/test_integration.py
    python tests/test_integration.py
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pytest
import torch

from haoma.config import FEATURE_ORDER
from haoma.core.seed import set_seed
from haoma.features.engine import FeatureEngine
from haoma.model.inference import WEIGHTS_DIR as DEFAULT_WEIGHTS_DIR
from haoma.schemas import WebSocketFrame
from haoma.simulator.patient import PatientConfig, PatientState
from haoma.simulator.physiology import PhysiologyEngine
from haoma.simulator.scenarios import DEMO_SCENARIO_CONFIG
from haoma.xai.precompute import (
    RECOMMENDATIONS,
    SHAP_LABELS,
    _alert_level,
    create_explainer,
    load_artifacts,
)

# ---------------------------------------------------------------------------
# Scenario — compressed so 120 s covers the full stable → collapse arc.
# ---------------------------------------------------------------------------

SCENARIO_DURATION_S = 120
WARMUP_DURATION_S = 1800  # 30 min — matches feature engine window
DEGRADATION_ONSET = 20.0
DEGRADATION_MIDPOINT = 70.0
DEGRADATION_STEEPNESS = 0.08

STABLE_SLICE = slice(0, 30)     # pre-onset
DEGRADED_SLICE = slice(90, 120)  # deep collapse (d > 0.8)


@dataclass
class PipelineResult:
    frames: list[dict[str, Any]]
    feature_rows: list[dict[str, float]]
    R: np.ndarray           # (T,)
    Q: np.ndarray           # (T,)
    haoma_index: np.ndarray  # (T,)
    shap_matrix: np.ndarray  # (T, F) — columns in FEATURE_ORDER order
    base_value: float
    states: list[PatientState]


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------


def _patient_config(seed: int) -> PatientConfig:
    return PatientConfig(
        patient_id=DEMO_SCENARIO_CONFIG["patient_id"],
        seed=seed,
        baseline_hr=DEMO_SCENARIO_CONFIG["baseline_hr"],
        baseline_spo2=DEMO_SCENARIO_CONFIG["baseline_spo2"],
        baseline_bp_sys=DEMO_SCENARIO_CONFIG["baseline_bp_sys"],
        baseline_bp_dia=DEMO_SCENARIO_CONFIG["baseline_bp_dia"],
        baseline_rr=DEMO_SCENARIO_CONFIG["baseline_rr"],
        baseline_t_central=DEMO_SCENARIO_CONFIG["baseline_t_central"],
        baseline_t_periph=DEMO_SCENARIO_CONFIG["baseline_t_periph"],
        baseline_pi=DEMO_SCENARIO_CONFIG["baseline_pi"],
    )


def generate_scenario(seed: int = 42) -> tuple[list[PatientState], list[PatientState]]:
    warm_engine = PhysiologyEngine(_patient_config(seed + 1), mode="stable")
    warmup = warm_engine.generate_sequence(WARMUP_DURATION_S)

    demo_engine = PhysiologyEngine(
        _patient_config(seed),
        mode="degradation",
        degradation_onset=DEGRADATION_ONSET,
        degradation_midpoint=DEGRADATION_MIDPOINT,
        degradation_steepness=DEGRADATION_STEEPNESS,
    )
    stay = demo_engine.generate_sequence(SCENARIO_DURATION_S)
    return warmup, stay


def run_pipeline(
    warmup: list[PatientState],
    stay: list[PatientState],
    weights_dir: Path,
) -> PipelineResult:
    set_seed(42)
    model, normalizer, background = load_artifacts(weights_dir)
    explainer = create_explainer(model, background)

    fe = FeatureEngine()
    fe.warmup(warmup)

    feature_rows: list[dict[str, float]] = []
    for state in stay:
        feature_rows.append(fe.compute(state))

    # Batched PINN forward — (T, F) input.
    X = torch.tensor(
        [normalizer.transform(r) for r in feature_rows], dtype=torch.float32
    )
    with torch.no_grad():
        R, Q, score = model(X)

    # Batched SHAP — (T, F) attributions.
    raw = explainer.shap_values(X, check_additivity=False)
    if isinstance(raw, list):
        raw = raw[0]
    shap_matrix = np.asarray(raw)
    if shap_matrix.ndim == 3 and shap_matrix.shape[-1] == 1:
        shap_matrix = shap_matrix.squeeze(-1)
    base_value = float(np.asarray(explainer.expected_value).flatten()[0])

    R_np = R.numpy().flatten()
    Q_np = Q.numpy().flatten()
    haoma_np = score.numpy().flatten()

    frames: list[dict[str, Any]] = []
    for t, state in enumerate(stay):
        alert = _alert_level(float(haoma_np[t]))
        contribs = [
            {
                "feature": name,
                "value": round(float(shap_matrix[t, i]), 4),
                "label": SHAP_LABELS[name],
            }
            for i, name in enumerate(FEATURE_ORDER)
        ]
        contribs.sort(key=lambda c: abs(c["value"]), reverse=True)
        frames.append(
            {
                "timestamp": float(t),
                "patient_id": DEMO_SCENARIO_CONFIG["patient_id"],
                "vitals": {
                    "timestamp": float(t),
                    "patient_id": DEMO_SCENARIO_CONFIG["patient_id"],
                    "hr": round(state.hr, 1),
                    "spo2": round(state.spo2, 1),
                    "bp_sys": round(state.bp_sys, 1),
                    "bp_dia": round(state.bp_dia, 1),
                    "rr": round(state.rr, 1),
                    "t_central": round(state.t_central, 2),
                    "t_periph": round(state.t_periph, 2),
                    "pi": round(state.pi, 2),
                    "rr_intervals": [round(float(v), 1) for v in state.rr_intervals],
                    "pleth_waveform": None,
                },
                "features": {k: round(float(v), 4) for k, v in feature_rows[t].items()},
                "physics": {
                    "resistance": round(float(R_np[t]), 3),
                    "flow": round(float(Q_np[t]), 3),
                },
                "haoma_index": round(float(haoma_np[t]), 4),
                "alert_level": alert,
                "shap_contributions": contribs,
                "recommendation": RECOMMENDATIONS[alert],
            }
        )

    return PipelineResult(
        frames=frames,
        feature_rows=feature_rows,
        R=R_np,
        Q=Q_np,
        haoma_index=haoma_np,
        shap_matrix=shap_matrix,
        base_value=base_value,
        states=stay,
    )


# ---------------------------------------------------------------------------
# Checks — each returns a (label, passed, detail) triple.
# ---------------------------------------------------------------------------

CheckResult = tuple[str, bool, str]


def _mean_feature(feature_rows: list[dict[str, float]], key: str, sl: slice) -> float:
    return float(np.mean([r[key] for r in feature_rows[sl]]))


def check_features_capture_degradation(r: PipelineResult) -> list[CheckResult]:
    """A. Features must move in the clinically correct direction."""
    stable = {k: _mean_feature(r.feature_rows, k, STABLE_SLICE) for k in FEATURE_ORDER}
    degraded = {k: _mean_feature(r.feature_rows, k, DEGRADED_SLICE) for k in FEATURE_ORDER}

    return [
        (
            "delta_t increases",
            degraded["delta_t"] > stable["delta_t"] + 0.3,
            f"{stable['delta_t']:+.3f} → {degraded['delta_t']:+.3f}",
        ),
        (
            "hrv_trend decreases",
            degraded["hrv_trend"] < stable["hrv_trend"] - 0.01,
            f"{stable['hrv_trend']:+.4f} → {degraded['hrv_trend']:+.4f}",
        ),
        (
            "pi_hr_ratio decreases",
            degraded["pi_hr_ratio"] < stable["pi_hr_ratio"] - 0.005,
            f"{stable['pi_hr_ratio']:.4f} → {degraded['pi_hr_ratio']:.4f}",
        ),
        (
            "degradation_slope increases",
            degraded["degradation_slope"] > stable["degradation_slope"] + 1e-3,
            f"{stable['degradation_slope']:+.4f} → {degraded['degradation_slope']:+.4f}",
        ),
    ]


def check_pinn_reacts(r: PipelineResult) -> list[CheckResult]:
    """B. PINN outputs must move with the features."""
    hs = float(np.mean(r.haoma_index[STABLE_SLICE]))
    hd = float(np.mean(r.haoma_index[DEGRADED_SLICE]))
    rs = float(np.mean(r.R[STABLE_SLICE]))
    rd = float(np.mean(r.R[DEGRADED_SLICE]))
    qs = float(np.mean(r.Q[STABLE_SLICE]))
    qd = float(np.mean(r.Q[DEGRADED_SLICE]))
    return [
        ("Haoma Index rises",  hd > hs + 0.3, f"{hs:.3f} → {hd:.3f}"),
        ("R rises (vasoconstriction)", rd > rs + 0.3, f"{rs:.3f} → {rd:.3f}"),
        ("Q falls (perfusion)",        qd < qs - 0.1, f"{qs:.3f} → {qd:.3f}"),
    ]


def check_shap_coherence(r: PipelineResult) -> list[CheckResult]:
    """C. SHAP explanations must make clinical sense during collapse."""
    mask = r.haoma_index > 0.6
    if not mask.any():
        return [("Degradation frames present", False, "no frame with haoma > 0.6")]

    idx_t = np.argsort(-np.abs(r.shap_matrix[mask]), axis=1)  # (N, F) sorted cols
    top_names = [FEATURE_ORDER[i] for i in idx_t[:, 0]]
    hits = sum(1 for n in top_names if n in {"delta_t", "hrv_trend"})
    total = len(top_names)

    # Signs: during collapse, the features that "push up" (delta_t ↑, slope ↑)
    # should have non-negative average SHAP attribution.
    # Additivity is covered by tests/test_xai.py on in-distribution samples —
    # DeepExplainer's linearization breaks down on deep-collapse inputs that
    # are far from the (stable) background, so we don't re-check it here.
    dt_col = FEATURE_ORDER.index("delta_t")
    slope_col = FEATURE_ORDER.index("degradation_slope")
    dt_mean = float(r.shap_matrix[mask, dt_col].mean())
    slope_mean = float(r.shap_matrix[mask, slope_col].mean())

    return [
        (
            f"top SHAP is delta_t or hrv_trend ({hits}/{total})",
            hits >= int(0.8 * total),
            f"{hits}/{total} frames",
        ),
        (
            "delta_t SHAP is non-negative during collapse",
            dt_mean > -0.01,
            f"mean = {dt_mean:+.3f}",
        ),
        (
            "degradation_slope SHAP is non-negative during collapse",
            slope_mean > -0.01,
            f"mean = {slope_mean:+.3f}",
        ),
    ]


def _transitions(alerts: list[str]) -> dict[str, int | None]:
    def first_after(start: int, target: str) -> int | None:
        for i in range(start, len(alerts)):
            if alerts[i] == target:
                return i
        return None

    green_to_orange = first_after(0, "orange")
    orange_to_red = first_after(green_to_orange or 0, "red")
    return {"green→orange": green_to_orange, "orange→red": orange_to_red}


def check_alert_transitions(r: PipelineResult) -> list[CheckResult]:
    """D. Alert progression green → orange → red, no regression."""
    alerts = [f["alert_level"] for f in r.frames]
    trans = _transitions(alerts)

    # No regression: after the first "red", no "green" allowed (orange ok — noise).
    first_red = next((i for i, a in enumerate(alerts) if a == "red"), None)
    post_red_greens = 0 if first_red is None else sum(
        1 for a in alerts[first_red:] if a == "green"
    )

    return [
        ("starts green", alerts[0] == "green", f"first frame = {alerts[0]}"),
        ("passes through orange", "orange" in alerts, f"orange count = {alerts.count('orange')}"),
        ("ends red",   alerts[-1] == "red", f"last frame = {alerts[-1]}"),
        (
            "no green after first red",
            post_red_greens == 0,
            f"{post_red_greens} green frames after first red (t={first_red})",
        ),
        (
            "green→orange transition present",
            trans["green→orange"] is not None,
            f"t = {trans['green→orange']}",
        ),
        (
            "orange→red transition present",
            trans["orange→red"] is not None,
            f"t = {trans['orange→red']}",
        ),
    ]


def check_physical_consistency(r: PipelineResult) -> list[CheckResult]:
    """E. Navier-Stokes-ish: Q ≈ (ΔP / ΔP_ref) / R, R ↔ ΔT +, R ↔ Q −."""
    bp_sys = np.array([s.bp_sys for s in r.states])
    bp_dia = np.array([s.bp_dia for s in r.states])
    delta_t = np.array([s.t_central - s.t_periph for s in r.states])
    delta_p = bp_sys - bp_dia
    ref = DEMO_SCENARIO_CONFIG["baseline_bp_sys"] - DEMO_SCENARIO_CONFIG["baseline_bp_dia"]
    q_expected = (delta_p / ref) / r.R
    rel_err = np.abs(q_expected - r.Q) / np.maximum(q_expected, 1e-3)
    mean_err_pct = float(rel_err.mean() * 100.0)

    corr_r_dt = float(np.corrcoef(r.R, delta_t)[0, 1])
    corr_r_q = float(np.corrcoef(r.R, r.Q)[0, 1])

    return [
        (
            "Q ≈ (ΔP/ΔP_ref) / R (20% tolerance)",
            mean_err_pct < 20.0,
            f"mean rel err = {mean_err_pct:.1f}%",
        ),
        (
            "corr(R, delta_t) > 0.7",
            corr_r_dt > 0.7,
            f"{corr_r_dt:+.3f}",
        ),
        (
            "corr(R, Q) < -0.7",
            corr_r_q < -0.7,
            f"{corr_r_q:+.3f}",
        ),
    ]


def check_frame_coherence(r: PipelineResult) -> list[CheckResult]:
    """F. Every frame's vitals/features/physics match their source."""
    mismatches = 0
    for t, frame in enumerate(r.frames):
        state = r.states[t]
        vitals = frame["vitals"]
        if abs(vitals["hr"] - round(state.hr, 1)) > 0.1:
            mismatches += 1
        if frame["features"]["delta_t"] != round(float(r.feature_rows[t]["delta_t"]), 4):
            mismatches += 1
        if frame["physics"]["resistance"] != round(float(r.R[t]), 3):
            mismatches += 1
    return [
        (
            "per-frame vitals/features/physics match their source",
            mismatches == 0,
            f"{mismatches} mismatches across {len(r.frames)} frames",
        ),
    ]


def check_schema_conformance(r: PipelineResult) -> list[CheckResult]:
    """G. Every frame validates against the WebSocketFrame Pydantic model."""
    errors = 0
    for frame in r.frames:
        try:
            WebSocketFrame(**frame)
        except Exception:
            errors += 1
    return [
        (
            "frames validate as WebSocketFrame",
            errors == 0,
            f"{len(r.frames) - errors}/{len(r.frames)} valid",
        ),
    ]


ALL_SECTIONS = [
    ("Simulator → Features",       check_features_capture_degradation),
    ("Features → PINN",            check_pinn_reacts),
    ("SHAP coherence (collapse)",  check_shap_coherence),
    ("Alert transitions",          check_alert_transitions),
    ("Physical consistency",       check_physical_consistency),
    ("Frame coherence",            check_frame_coherence),
    ("Schema conformance",         check_schema_conformance),
]


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------


def _header_stats(r: PipelineResult) -> None:
    def mean_block(sl: slice, label: str) -> None:
        hr = np.mean([s.hr for s in r.states[sl]])
        sp = np.mean([s.spo2 for s in r.states[sl]])
        dt = np.mean([s.t_central - s.t_periph for s in r.states[sl]])
        pi = np.mean([s.pi for s in r.states[sl]])
        print(f"  {label:22s} HR={hr:5.1f}  SpO2={sp:5.1f}  ΔT={dt:4.2f}  PI={pi:4.2f}")

    print(f"\n→ Simulator : {len(r.states)} timesteps generated")
    mean_block(STABLE_SLICE, "Phase stable (0-30s)")
    mean_block(DEGRADED_SLICE, "Phase degraded (90-120s)")


def print_report(r: PipelineResult, sections: list[tuple[str, list[CheckResult]]]) -> None:
    bar = "═" * 60
    print(bar)
    print(" HAOMA — Full pipeline integration test")
    print(bar)

    _header_stats(r)
    print()

    all_pass = True
    for name, checks in sections:
        print(f"→ {name}")
        for label, passed, detail in checks:
            mark = "✓" if passed else "✗"
            print(f"  {mark} {label:50s} {detail}")
            all_pass &= passed
        print()

    verdict = "PIPELINE OK — ready for demo" if all_pass else "PIPELINE BROKEN"
    print(bar)
    print(f" RESULT : {verdict}")
    print(bar)


# ---------------------------------------------------------------------------
# Runners
# ---------------------------------------------------------------------------


def _find_weights() -> Path:
    env = DEFAULT_WEIGHTS_DIR
    if all((env / name).exists() for name in ("haoma_pinn.pt", "zscore_stats.json", "shap_background.npy")):
        return env
    raise FileNotFoundError(
        f"Weights not found at {env}. Run ./scripts/train.sh first."
    )


def run(weights_dir: Path | None = None) -> tuple[PipelineResult, list[tuple[str, list[CheckResult]]]]:
    weights_dir = weights_dir or _find_weights()
    warmup, stay = generate_scenario(seed=42)
    result = run_pipeline(warmup, stay, weights_dir)
    sections = [(name, fn(result)) for name, fn in ALL_SECTIONS]
    return result, sections


# ---------------------------------------------------------------------------
# Pytest
# ---------------------------------------------------------------------------


def test_integration_pipeline() -> None:
    try:
        weights_dir = _find_weights()
    except FileNotFoundError as e:
        pytest.skip(str(e))

    result, sections = run(weights_dir)
    print_report(result, sections)

    failures = [
        f"{section}: {label} ({detail})"
        for section, checks in sections
        for (label, passed, detail) in checks
        if not passed
    ]
    assert not failures, "Integration failures:\n" + "\n".join(failures)


# ---------------------------------------------------------------------------
# Script entry point
# ---------------------------------------------------------------------------


if __name__ == "__main__":
    try:
        weights_dir = _find_weights()
    except FileNotFoundError as e:
        print(str(e))
        sys.exit(1)

    result, sections = run(weights_dir)
    print_report(result, sections)
    all_pass = all(passed for _, checks in sections for _, passed, _ in checks)
    sys.exit(0 if all_pass else 1)
