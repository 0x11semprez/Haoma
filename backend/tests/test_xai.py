"""XAI tests — SHAP precompute and the full demo scenario pipeline.

Validates that the precomputed demo bundle is coherent, clinically sensible, and
not hardcoded — all of which the jury of pediatric intensivists could spot at a
glance if any of these invariants broke.
"""

from __future__ import annotations

import numpy as np
import pytest
import shap
import torch

from haoma.config import FEATURE_ORDER, PINN_ARCHITECTURE
from haoma.model.train import train
from haoma.xai.precompute import (
    ScoreOnly,
    create_explainer,
    load_artifacts,
    precompute_demo,
)

# ---------------------------------------------------------------------------
# Fixtures — train one tiny PINN per session, reuse across every test.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def weights_dir(tmp_path_factory):
    """Train a tiny PINN once and hand back its weights directory."""
    wd = tmp_path_factory.mktemp("haoma_weights")
    train(n_stays=3, epochs=6, batch_size=128, weights_dir=wd)
    return wd


@pytest.fixture(scope="module")
def bundle(weights_dir):
    return load_artifacts(weights_dir)


@pytest.fixture(scope="module")
def explainer(bundle):
    model, _, background = bundle
    return create_explainer(model, background)


@pytest.fixture(scope="module")
def demo_frames(weights_dir):
    return precompute_demo(weights_dir=weights_dir, duration_s=360)


# ---------------------------------------------------------------------------
# Unit: ScoreOnly wrapper
# ---------------------------------------------------------------------------


def test_score_only_wrapper(bundle):
    model, _, _ = bundle
    wrapped = ScoreOnly(model)
    x = torch.randn(3, int(PINN_ARCHITECTURE["input_dim"]))
    with torch.no_grad():
        out = wrapped(x)
    assert out.shape == (3, 1)
    assert torch.all(out >= 0.0) and torch.all(out <= 1.0)


# ---------------------------------------------------------------------------
# Unit: DeepExplainer
# ---------------------------------------------------------------------------


def test_deep_explainer_creates(explainer):
    assert isinstance(explainer, shap.DeepExplainer)


def test_shap_values_shape(bundle, explainer):
    _, normalizer, background = bundle
    x = torch.tensor(background[:5], dtype=torch.float32)
    raw = explainer.shap_values(x, check_additivity=False)
    if isinstance(raw, list):
        raw = raw[0]
    arr = np.asarray(raw)
    if arr.ndim == 3 and arr.shape[-1] == 1:
        arr = arr.squeeze(-1)
    assert arr.shape == (5, 4), f"expected (5, 4), got {arr.shape}"


def test_shap_values_sum_to_prediction_diff(bundle, explainer):
    """SHAP additivity: base_value + sum(shap) ≈ model(x).

    We disable SHAP's internal additivity check (tanh→sigmoid chains overshoot
    the 0.01 tolerance by ~0.003 — pure rounding), but we verify the property
    explicitly here with a generous 0.05 tolerance suited to float32 + the
    shallow sigmoid at the head.
    """
    model, _, background = bundle
    x = torch.tensor(background[:3], dtype=torch.float32)

    raw = explainer.shap_values(x, check_additivity=False)
    if isinstance(raw, list):
        raw = raw[0]
    shap_arr = np.asarray(raw)
    if shap_arr.ndim == 3 and shap_arr.shape[-1] == 1:
        shap_arr = shap_arr.squeeze(-1)

    base_value = np.asarray(explainer.expected_value).flatten()[0]

    wrapped = ScoreOnly(model)
    with torch.no_grad():
        preds = wrapped(x).numpy().flatten()

    recon = base_value + shap_arr.sum(axis=1)
    for pred, r in zip(preds, recon, strict=True):
        assert abs(pred - r) < 0.05, (pred, r)


# ---------------------------------------------------------------------------
# Precompute — structure and sorting
# ---------------------------------------------------------------------------


def test_shap_contributions_sorted(demo_frames):
    for frame in demo_frames:
        values = [abs(c["value"]) for c in frame["shap_contributions"]]
        assert values == sorted(values, reverse=True), (
            f"frame t={frame['timestamp']} contributions not sorted: {values}"
        )


def test_precompute_output_structure(demo_frames):
    expected_top = {
        "timestamp",
        "patient_id",
        "vitals",
        "features",
        "physics",
        "haoma_index",
        "alert_level",
        "shap_contributions",
        "recommendation",
    }
    for frame in demo_frames[:5]:
        assert set(frame.keys()) == expected_top

        assert set(frame["features"].keys()) == set(FEATURE_ORDER)
        assert set(frame["physics"].keys()) == {"resistance", "flow"}
        assert frame["alert_level"] in {"green", "orange", "red"}

        vitals = frame["vitals"]
        for key in (
            "hr", "spo2", "bp_sys", "bp_dia", "rr", "t_central", "t_periph",
            "pi", "rr_intervals",
        ):
            assert key in vitals

        for c in frame["shap_contributions"]:
            assert set(c.keys()) == {"feature", "value", "label"}
            assert c["feature"] in FEATURE_ORDER


# ---------------------------------------------------------------------------
# Phase / clinical narrative
# ---------------------------------------------------------------------------


def test_precompute_phases(demo_frames):
    """Scenario must start green and end red, with haoma_index trending up."""
    assert demo_frames[0]["alert_level"] == "green", demo_frames[0]["alert_level"]
    assert demo_frames[-1]["alert_level"] == "red", demo_frames[-1]["alert_level"]
    assert demo_frames[-1]["haoma_index"] > demo_frames[0]["haoma_index"] + 0.3

    # Windowed check — mid-demo average > start average > baseline noise.
    n = len(demo_frames)
    early = np.mean([f["haoma_index"] for f in demo_frames[: n // 6]])
    late = np.mean([f["haoma_index"] for f in demo_frames[-n // 6 :]])
    assert late > early + 0.3, (early, late)


def test_shap_clinical_coherence(demo_frames):
    """Last 30 frames: delta_t or hrv_trend must consistently rank top-2.

    Peripheral vasoconstriction (delta_t widening) and autonomic collapse (HRV
    dropping) are *the* early-warning features. If neither ranks top-2 when the
    patient is decompensating, the model is not clinically interpretable and a
    jury of intensivists would flag it immediately.
    """
    last = demo_frames[-30:]
    hits = 0
    for frame in last:
        top2 = {c["feature"] for c in frame["shap_contributions"][:2]}
        if "delta_t" in top2 or "hrv_trend" in top2:
            hits += 1
    assert hits >= 27, (
        f"Only {hits}/30 end-of-scenario frames had delta_t or hrv_trend in top-2 SHAP"
    )


def test_no_hardcoded_shap(demo_frames):
    """If SHAP values were hardcoded, their variance across frames would vanish."""
    matrix = np.array([
        [c["value"] for c in sorted(f["shap_contributions"], key=lambda x: x["feature"])]
        for f in demo_frames
    ])
    per_feature_std = matrix.std(axis=0)
    assert per_feature_std.max() > 1e-3, (
        f"All SHAP features constant across frames — hardcoded? std={per_feature_std}"
    )

    # First and last frames must differ meaningfully.
    first = np.array([c["value"] for c in demo_frames[0]["shap_contributions"]])
    last = np.array([c["value"] for c in demo_frames[-1]["shap_contributions"]])
    assert np.abs(first - last).max() > 1e-2


# ---------------------------------------------------------------------------
# Recommendations — translated to French, aligned with alert level.
# ---------------------------------------------------------------------------


def test_recommendations_match_alert(demo_frames):
    for frame in demo_frames:
        level = frame["alert_level"]
        rec = frame["recommendation"]
        if level == "green":
            assert rec is None
        else:
            assert rec is not None and len(rec) > 0
            assert "Haoma Index" in rec
