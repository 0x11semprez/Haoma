"""Feature engine tests — validates the 4 features, normalization, and the
clinical promise that early features fire before late vitals."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

import numpy as np

from haoma.config import FEATURE_ORDER
from haoma.features import FeatureEngine, FeatureNormalizer
from haoma.schemas import Features
from haoma.simulator import PatientConfig, PhysiologyEngine
from haoma.simulator.patient import PatientState

# ---------------------------------------------------------------------------
# Pre-existing schema checks (kept — they pin FEATURE_ORDER).
# ---------------------------------------------------------------------------


def test_feature_order_has_four_entries() -> None:
    assert len(FEATURE_ORDER) == 4
    assert set(FEATURE_ORDER) == {
        "delta_t",
        "hrv_trend",
        "pi_hr_ratio",
        "degradation_slope",
    }


def test_features_schema_matches_feature_order() -> None:
    f = Features(delta_t=1.2, hrv_trend=-0.3, pi_hr_ratio=0.03, degradation_slope=0.01)
    dumped = f.model_dump()
    assert set(dumped.keys()) == set(FEATURE_ORDER)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _state(
    t: float = 0.0,
    *,
    hr: float = 100.0,
    spo2: float = 97.0,
    bp_sys: float = 90.0,
    bp_dia: float = 56.0,
    rr: float = 26.0,
    t_central: float = 37.0,
    t_periph: float = 36.5,
    pi: float = 3.0,
    rr_intervals: list[float] | None = None,
) -> PatientState:
    return PatientState(
        timestamp=t,
        hr=hr,
        spo2=spo2,
        bp_sys=bp_sys,
        bp_dia=bp_dia,
        rr=rr,
        t_central=t_central,
        t_periph=t_periph,
        pi=pi,
        rr_intervals=rr_intervals if rr_intervals is not None else [600.0] * 8,
    )


def _degradation_run(
    seed: int = 13,
    duration: int = 420,
    onset: float = 60.0,
    midpoint: float = 240.0,
    steepness: float = 0.03,
) -> tuple[list[PatientState], list[PatientState]]:
    """(warmup_states, stay_states) from the simulator."""
    cfg = PatientConfig(seed=seed)
    warmup_engine = PhysiologyEngine(cfg, mode="stable")
    warmup = warmup_engine.generate_sequence(1800)

    # Reuse the same seed for the stay so both runs are deterministic.
    stay_engine = PhysiologyEngine(
        cfg,
        mode="degradation",
        degradation_onset=onset,
        degradation_midpoint=midpoint,
        degradation_steepness=steepness,
    )
    stay = stay_engine.generate_sequence(duration)
    return warmup, stay


# ---------------------------------------------------------------------------
# Instantaneous features
# ---------------------------------------------------------------------------


def test_delta_t_instant() -> None:
    fe = FeatureEngine()
    f = fe.compute(_state(t_central=37.5, t_periph=35.0))
    assert f["delta_t"] == 2.5


def test_pi_hr_ratio() -> None:
    fe = FeatureEngine()
    f = fe.compute(_state(pi=3.0, hr=100.0))
    assert f["pi_hr_ratio"] == 0.03


def test_pi_hr_ratio_zero_hr_is_safe() -> None:
    fe = FeatureEngine()
    f = fe.compute(_state(pi=3.0, hr=0.0))
    assert f["pi_hr_ratio"] == 0.0  # no division by zero


def test_delta_t_increases_with_degradation() -> None:
    warmup, stay = _degradation_run()
    fe = FeatureEngine()
    rows = fe.compute_batch(stay, warmup_states=warmup)
    early = np.mean([r["delta_t"] for r in rows[:60]])
    late = np.mean([r["delta_t"] for r in rows[-60:]])
    assert late > early + 1.0, (early, late)


# ---------------------------------------------------------------------------
# HRV trend
# ---------------------------------------------------------------------------


def test_hrv_trend_from_rr_intervals() -> None:
    """R-R variability shrinking over time → negative hrv_trend slope."""
    fe = FeatureEngine()
    rng = np.random.RandomState(0)
    # 30 min: variability scales from 5% down to 1% over the window.
    for t in range(1800):
        frac = t / 1800.0
        variability = 0.05 * (1.0 - frac) + 0.01 * frac
        rrs = (600.0 + rng.normal(0.0, 600.0 * variability, size=8)).tolist()
        fe.compute(_state(t=float(t), rr_intervals=rrs))
    f = fe.compute(_state(t=1800.0, rr_intervals=[600.0] * 8))
    assert f["hrv_trend"] < 0.0, f


def test_hrv_trend_stable() -> None:
    """Identical R-R variability across the window → slope ≈ 0."""
    fe = FeatureEngine()
    rng = np.random.RandomState(42)
    for t in range(1800):
        rrs = (600.0 + rng.normal(0.0, 600.0 * 0.03, size=8)).tolist()
        fe.compute(_state(t=float(t), rr_intervals=rrs))
    f = fe.compute(_state(t=1800.0, rr_intervals=[600.0] * 8))
    assert abs(f["hrv_trend"]) < 0.3, f


# ---------------------------------------------------------------------------
# Degradation slope
# ---------------------------------------------------------------------------


def test_degradation_slope_positive_during_collapse() -> None:
    """During degradation, delta_t widens monotonically → positive slope."""
    warmup, stay = _degradation_run()
    fe = FeatureEngine()
    rows = fe.compute_batch(stay, warmup_states=warmup)
    late_slope = np.mean([r["degradation_slope"] for r in rows[-60:]])
    assert late_slope > 0.0, late_slope


# ---------------------------------------------------------------------------
# Contract
# ---------------------------------------------------------------------------


def test_feature_order_matches_config() -> None:
    fe = FeatureEngine()
    f = fe.compute(_state())
    assert list(f.keys()) == FEATURE_ORDER


def test_warmup_fills_buffer() -> None:
    """After warmup, windowed features are calculable immediately (non-default)."""
    warmup, stay = _degradation_run()
    fe = FeatureEngine()
    fe.warmup(warmup)
    f = fe.compute(stay[0])
    # hrv_trend and degradation_slope require ≥ 60 samples in the buffer;
    # with 1800-sample warmup they are real numbers, not the default 0.0.
    assert f["hrv_trend"] != 0.0 or f["degradation_slope"] != 0.0


def test_compute_with_aux_returns_bp() -> None:
    fe = FeatureEngine()
    features, aux = fe.compute_with_aux(_state(bp_sys=88.0, bp_dia=50.0))
    assert set(features.keys()) == set(FEATURE_ORDER)
    assert aux == {"bp_sys": 88.0, "bp_dia": 50.0}


# ---------------------------------------------------------------------------
# Normalizer
# ---------------------------------------------------------------------------


def test_normalizer_roundtrip() -> None:
    rng = np.random.RandomState(7)
    rows = [
        {
            "delta_t": float(rng.normal(1.0, 0.5)),
            "hrv_trend": float(rng.normal(-0.05, 0.02)),
            "pi_hr_ratio": float(rng.normal(0.03, 0.005)),
            "degradation_slope": float(rng.normal(0.0, 0.01)),
        }
        for _ in range(500)
    ]
    norm = FeatureNormalizer()
    norm.fit(rows)

    # Z-scoring the training set → mean≈0, std≈1.
    transformed = np.array([norm.transform(r) for r in rows])
    assert np.allclose(transformed.mean(axis=0), 0.0, atol=1e-6)
    assert np.allclose(transformed.std(axis=0), 1.0, atol=1e-2)

    # Save + reload roundtrip.
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "zscore_stats.json"
        norm.save(str(path))
        data = json.loads(path.read_text())
        assert set(data.keys()) == {"mean", "std"}

        reloaded = FeatureNormalizer.load(str(path))
        assert reloaded.mean == norm.mean
        assert reloaded.std == norm.std
        assert reloaded.transform(rows[0]) == norm.transform(rows[0])


def test_normalizer_transform_before_fit_raises() -> None:
    norm = FeatureNormalizer()
    try:
        norm.transform({k: 0.0 for k in FEATURE_ORDER})
    except RuntimeError:
        return
    raise AssertionError("transform must raise before fit")


# ---------------------------------------------------------------------------
# Clinical promise: early features fire before late vitals.
# ---------------------------------------------------------------------------


def test_signal_ordering_in_features() -> None:
    """Features must flag decompensation before the late macro-vitals move.

    Specifically:
      - delta_t crosses its 3σ-baseline envelope *before* bp_sys does.
      - hrv_trend turns negative at mid-degradation while spo2 is still within
        noise, confirming the feature is a leading indicator.

    First-crossing tests on the 30-min slope feature alone would spuriously
    fail because the window smooths out the onset — we combine a crossing
    test for instantaneous features with a snapshot test for the slope one.
    """
    warmup, stay = _degradation_run(duration=480)

    fe = FeatureEngine()
    rows = fe.compute_batch(stay, warmup_states=warmup)

    delta_t_series = np.array([r["delta_t"] for r in rows])
    hrv_series = np.array([r["hrv_trend"] for r in rows])
    bp_series = np.array([s.bp_sys for s in stay])
    spo2_series = np.array([s.spo2 for s in stay])

    baseline = slice(0, 60)  # pre-onset (onset=60s)

    def mean(x: np.ndarray) -> float:
        return float(np.mean(x))

    def std(x: np.ndarray) -> float:
        return max(float(np.std(x)), 1e-6)

    def first_crossing_after(
        series: np.ndarray, threshold: float, direction: str, start: int
    ) -> int:
        for i in range(start, len(series)):
            if direction == "up" and series[i] > threshold:
                return i
            if direction == "down" and series[i] < threshold:
                return i
        return len(series)

    mu_dt, sd_dt = mean(delta_t_series[baseline]), std(delta_t_series[baseline])
    mu_bp, sd_bp = mean(bp_series[baseline]), std(bp_series[baseline])
    mu_sp, sd_sp = mean(spo2_series[baseline]), std(spo2_series[baseline])

    start = baseline.stop
    t_dt = first_crossing_after(delta_t_series, mu_dt + 3 * sd_dt, "up", start)
    t_bp = first_crossing_after(bp_series, mu_bp - 3 * sd_bp, "down", start)

    assert t_dt < t_bp, f"delta_t ({t_dt}) must lead bp_sys ({t_bp})"

    # Snapshot during early drift (t≈180, d≈0.14): hrv_trend has already
    # turned negative while spo2 is still within baseline noise.
    early_t = 180
    assert hrv_series[early_t] < -0.03, (
        f"hrv_trend not yet negative during early drift: {hrv_series[early_t]}"
    )
    assert abs(spo2_series[early_t] - mu_sp) < 2 * sd_sp, (
        f"spo2 already out of 2σ at early drift: {spo2_series[early_t]} vs {mu_sp}±{sd_sp}"
    )
