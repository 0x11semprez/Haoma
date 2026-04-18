"""HAOMA — precompute the full demo scenario (vitals + features + PINN + SHAP).

Generates ``data/precomputed/demo_scenario.json``: every field the frontend
displays during the demo, pre-computed once. The WebSocket server reads this
file and streams frames on a 1 s cadence — zero live compute, zero lag risk.

Non-negotiables (CLAUDE.md):
- DeepExplainer only (KernelExplainer is too slow without GPU).
- No hard-coded SHAP values — the numbers must come from an actual explainer call.
- SHAP explains the Haoma Index head only, not R or Q.

Usage: ``python -m haoma.xai.precompute`` (or ``./scripts/precompute_demo.sh``).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import shap
import torch
from torch import nn

from haoma.config import ALERT_THRESHOLDS, DEMO_DURATION_S, FEATURE_ORDER
from haoma.core.seed import set_seed
from haoma.features.engine import FeatureEngine, FeatureNormalizer
from haoma.model.pinn import HaomaNet
from haoma.simulator.patient import PatientConfig
from haoma.simulator.physiology import PhysiologyEngine
from haoma.simulator.scenarios import DEMO_SCENARIO_CONFIG, create_demo_engine

WEIGHTS_DIR = Path(__file__).resolve().parents[3] / "data" / "weights"
OUTPUT_DIR = Path(__file__).resolve().parents[3] / "data" / "precomputed"
OUTPUT_FILE = OUTPUT_DIR / "demo_scenario.json"

# Clinical vocabulary validated by the medical advisor. French — the jury is
# francophone. Do not invent medical phrasing; edit only after review.
SHAP_LABELS: dict[str, str] = {
    "delta_t": "Gradient thermique central-périphérique",
    "hrv_trend": "Variabilité cardiaque",
    "pi_hr_ratio": "Perfusion capillaire",
    "degradation_slope": "Tendance de dégradation",
}

RECOMMENDATIONS: dict[str, str | None] = {
    "green": None,
    "orange": (
        "Haoma Index en hausse. Surveillance rapprochée recommandée. "
        "Réévaluer cliniquement le patient."
    ),
    "red": (
        "Haoma Index critique. "
        "Évaluer le remplissage vasculaire et la nécessité d'un support vasopresseur. "
        "Contrôler la perfusion du greffon rénal."
    ),
}


class ScoreOnly(nn.Module):
    """Wraps HaomaNet so DeepExplainer sees a single-output model (the Haoma Index)."""

    def __init__(self, full_model: HaomaNet) -> None:
        super().__init__()
        self.full_model = full_model

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        _, _, score = self.full_model(x)
        return score


def load_artifacts(
    weights_dir: Path = WEIGHTS_DIR,
) -> tuple[HaomaNet, FeatureNormalizer, np.ndarray]:
    """Load the 3 training artifacts produced by ``haoma.model.train``."""
    model = HaomaNet()
    model.load_state_dict(torch.load(weights_dir / "haoma_pinn.pt", map_location="cpu"))
    model.eval()

    normalizer = FeatureNormalizer.load(str(weights_dir / "zscore_stats.json"))
    background = np.load(weights_dir / "shap_background.npy")
    return model, normalizer, background


def create_explainer(model: HaomaNet, background: np.ndarray) -> shap.DeepExplainer:
    """Build a DeepExplainer that attributes the Haoma Index only."""
    bg_tensor = torch.tensor(background, dtype=torch.float32)
    return shap.DeepExplainer(ScoreOnly(model), bg_tensor)


def _shap_array(explainer: shap.DeepExplainer, x: torch.Tensor) -> np.ndarray:
    """Run the explainer and normalize the output to shape (batch, n_features).

    SHAP 0.5x returns ndarray of shape (B, F) or (B, F, 1); older versions
    returned a list. We normalize all three forms here.

    ``check_additivity=False``: with Tanh → Sigmoid chains, SHAP's internal
    decomposition accumulates ~0.013 rounding error vs a 0.01 default
    tolerance. The attributions themselves are still meaningful.
    """
    raw = explainer.shap_values(x, check_additivity=False)
    if isinstance(raw, list):
        raw = raw[0]
    arr = np.asarray(raw)
    if arr.ndim == 3 and arr.shape[-1] == 1:
        arr = arr.squeeze(-1)
    return arr


def _alert_level(haoma_index: float) -> str:
    if haoma_index < ALERT_THRESHOLDS["green"]:
        return "green"
    if haoma_index < ALERT_THRESHOLDS["orange"]:
        return "orange"
    return "red"


def _build_shap_contributions(shap_row: np.ndarray) -> list[dict[str, Any]]:
    contribs = [
        {
            "feature": name,
            "value": round(float(shap_row[i]), 4),
            "label": SHAP_LABELS[name],
        }
        for i, name in enumerate(FEATURE_ORDER)
    ]
    contribs.sort(key=lambda c: abs(c["value"]), reverse=True)
    return contribs


def _build_frame(
    t: int,
    state: Any,
    features_dict: dict[str, float],
    R: torch.Tensor,
    Q: torch.Tensor,
    haoma_index: float,
    shap_row: np.ndarray,
) -> dict[str, Any]:
    alert = _alert_level(haoma_index)
    return {
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
        "features": {k: round(float(v), 4) for k, v in features_dict.items()},
        "physics": {
            "resistance": round(float(R.item()), 3),
            "flow": round(float(Q.item()), 3),
        },
        "haoma_index": round(float(haoma_index), 4),
        "alert_level": alert,
        "shap_contributions": _build_shap_contributions(shap_row),
        "recommendation": RECOMMENDATIONS[alert],
    }


def precompute_demo(
    weights_dir: Path = WEIGHTS_DIR,
    duration_s: int = DEMO_DURATION_S,
    warmup_duration_s: int = 1800,
    seed: int = 42,
) -> list[dict[str, Any]]:
    """Run the full precompute pipeline and return the list of frames."""
    set_seed(seed)

    model, normalizer, background = load_artifacts(weights_dir)
    explainer = create_explainer(model, background)

    # Warmup: pure stable, just to seed the 30-min rolling window of the feature
    # engine. A different seed than the demo engine avoids RNG coupling.
    warm_cfg = PatientConfig(
        patient_id=DEMO_SCENARIO_CONFIG["patient_id"] + "_warmup",
        seed=seed + 1,
        baseline_hr=DEMO_SCENARIO_CONFIG["baseline_hr"],
        baseline_spo2=DEMO_SCENARIO_CONFIG["baseline_spo2"],
        baseline_bp_sys=DEMO_SCENARIO_CONFIG["baseline_bp_sys"],
        baseline_bp_dia=DEMO_SCENARIO_CONFIG["baseline_bp_dia"],
        baseline_rr=DEMO_SCENARIO_CONFIG["baseline_rr"],
        baseline_t_central=DEMO_SCENARIO_CONFIG["baseline_t_central"],
        baseline_t_periph=DEMO_SCENARIO_CONFIG["baseline_t_periph"],
        baseline_pi=DEMO_SCENARIO_CONFIG["baseline_pi"],
    )
    warm_engine = PhysiologyEngine(warm_cfg, mode="stable")
    warmup_states = warm_engine.generate_sequence(warmup_duration_s)

    demo_engine = create_demo_engine()

    fe = FeatureEngine()
    fe.warmup(warmup_states)

    frames: list[dict[str, Any]] = []
    for t in range(duration_s):
        state = demo_engine.generate(float(t))
        features_dict, _aux = fe.compute_with_aux(state)

        x = torch.tensor(
            [normalizer.transform(features_dict)], dtype=torch.float32
        )
        with torch.no_grad():
            R, Q, score = model(x)
        haoma_index = float(score.item())

        shap_row = _shap_array(explainer, x)[0]
        frames.append(
            _build_frame(
                t=t,
                state=state,
                features_dict=features_dict,
                R=R,
                Q=Q,
                haoma_index=haoma_index,
                shap_row=shap_row,
            )
        )

    return frames


def save_demo_scenario(
    frames: list[dict[str, Any]], output_file: Path = OUTPUT_FILE
) -> None:
    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text(json.dumps(frames, indent=2, ensure_ascii=False))


def _print_summary(frames: list[dict[str, Any]]) -> None:
    scores = [f["haoma_index"] for f in frames]
    alerts = [f["alert_level"] for f in frames]

    print(f"  {len(frames)} frames")
    print(f"  Haoma Index : {min(scores):.3f} → {max(scores):.3f}")
    print(
        f"  Alerts      : {alerts.count('green')} green, "
        f"{alerts.count('orange')} orange, {alerts.count('red')} red"
    )

    # 4-phase check — approximate boundaries per CLAUDE.md demo section.
    n = len(frames)
    for label, idx, expected in (
        ("Phase 1 (end)", int(n * 0.25) - 1, "green"),
        ("Phase 2 (end)", int(n * 0.67) - 1, "{green, orange}"),
        ("Phase 3 (end)", int(n * 0.83) - 1, "{orange, red}"),
        ("Phase 4 (end)", n - 1, "red"),
    ):
        print(f"  {label:14s}: {frames[idx]['alert_level']:6s} (expected {expected})")

    top_last = frames[-1]["shap_contributions"][0]["feature"]
    print(f"  Top SHAP @ end: {top_last}")
    if top_last not in {"delta_t", "hrv_trend"}:
        print("  ⚠  Unusual top contributor — expected delta_t or hrv_trend.")


def main() -> None:
    print("→ Loading model + artifacts...")
    print("→ Running simulator + features + PINN + SHAP per timestep...")
    frames = precompute_demo()
    save_demo_scenario(frames)
    print(f"✓ Saved {OUTPUT_FILE}")
    _print_summary(frames)


if __name__ == "__main__":
    main()
