"""Simulator tests — pillars of Dev 1's module.

Each test validates one of the non-negotiable properties declared in CLAUDE.md:
pediatric ranges, inter-parameter correlations, signal ordering (early vs. late),
determinism, sigmoid-shaped degradation, R-R coherence, R/Q physical consistency,
and the training dataset factory.
"""

from __future__ import annotations

import math

import numpy as np

from haoma.config import WARMUP_DURATION_S
from haoma.simulator import (
    PatientConfig,
    PhysiologyEngine,
    create_demo_engine,
    generate_training_dataset,
)


def _stable_engine(seed: int = 42) -> PhysiologyEngine:
    return PhysiologyEngine(PatientConfig(seed=seed), mode="stable")


def test_pediatric_ranges() -> None:
    """60s in stable mode must stay inside clinically validated bounds for a 4-y-o."""
    engine = _stable_engine()
    states = engine.generate_sequence(60)

    for s in states:
        assert 65 <= s.hr <= 140, f"hr out of range: {s.hr}"
        assert 94 <= s.spo2 <= 100, f"spo2 out of range: {s.spo2}"
        assert 78 <= s.bp_sys <= 108, f"bp_sys out of range: {s.bp_sys}"
        assert 20 <= s.rr <= 30, f"rr out of range: {s.rr}"
        assert 36.0 <= s.t_periph <= 37.5, f"t_periph out of range: {s.t_periph}"


def test_correlations() -> None:
    """Degraded phase moves vitals in the physiologically expected direction."""
    engine = PhysiologyEngine(
        PatientConfig(seed=7),
        mode="degradation",
        degradation_onset=0.0,
        degradation_midpoint=120.0,
        degradation_steepness=0.08,
    )
    seq = engine.generate_sequence(300)

    stable_slice = seq[0:50]      # d ≈ 0
    degraded_slice = seq[200:250] # d ≈ 1

    def mean(attr: str, window: list) -> float:
        return float(np.mean([getattr(s, attr) for s in window]))

    assert mean("hr", degraded_slice) != mean("hr", stable_slice)
    assert mean("delta_t", degraded_slice) > mean("delta_t", stable_slice) + 0.5
    assert mean("pi", degraded_slice) < mean("pi", stable_slice) - 0.3
    assert mean("spo2", degraded_slice) < mean("spo2", stable_slice) - 0.5
    assert mean("bp_sys", degraded_slice) < mean("bp_sys", stable_slice) - 5.0


def test_signal_ordering() -> None:
    """Delta-T and PI must deviate before SpO2 and BP — the clinical premise of Haoma."""
    engine = PhysiologyEngine(
        PatientConfig(seed=11),
        mode="degradation",
        degradation_onset=60.0,
        degradation_midpoint=240.0,
        degradation_steepness=0.03,
    )
    seq = engine.generate_sequence(420)

    baseline = seq[0:60]  # purely stable (onset=60)
    mu = {a: float(np.mean([getattr(s, a) for s in baseline])) for a in ("delta_t", "pi", "spo2", "bp_sys")}
    sd = {a: max(float(np.std([getattr(s, a) for s in baseline])), 1e-3) for a in mu}

    def first_deviation(attr: str, sign: str) -> int:
        for i, s in enumerate(seq):
            delta = getattr(s, attr) - mu[attr]
            if sign == "up" and delta > 2.0 * sd[attr]:
                return i
            if sign == "down" and delta < -2.0 * sd[attr]:
                return i
        return len(seq)

    t_delta_t = first_deviation("delta_t", "up")
    t_pi = first_deviation("pi", "down")
    t_spo2 = first_deviation("spo2", "down")
    t_bp_sys = first_deviation("bp_sys", "down")

    assert t_delta_t < t_spo2, f"delta_t ({t_delta_t}) should deviate before spo2 ({t_spo2})"
    assert t_pi < t_bp_sys, f"pi ({t_pi}) should deviate before bp_sys ({t_bp_sys})"


def test_determinism() -> None:
    """Same seed → byte-identical trajectories."""
    run1 = _stable_engine(seed=123).generate_sequence(30)
    run2 = _stable_engine(seed=123).generate_sequence(30)

    assert len(run1) == len(run2) == 30
    for a, b in zip(run1, run2, strict=True):
        assert a.hr == b.hr
        assert a.spo2 == b.spo2
        assert a.bp_sys == b.bp_sys
        assert a.t_periph == b.t_periph
        assert a.rr_intervals == b.rr_intervals


def test_sigmoid_shape() -> None:
    """d(t) is a genuine S-curve — flat start, steep middle, flat plateau."""
    engine = PhysiologyEngine(
        PatientConfig(),
        mode="degradation",
        degradation_onset=0.0,
        degradation_midpoint=500.0,
        degradation_steepness=0.02,
    )
    ts = np.linspace(0, 1000, 11)  # steps of 100s, with midpoint (t=500) at index 5
    values = [engine.degradation_factor(float(t)) for t in ts]

    assert values[0] < 0.05
    assert 0.4 < values[5] < 0.6   # midpoint
    assert values[-1] > 0.95

    # Derivatives: small at the extremes, largest near the midpoint.
    diffs = np.diff(values)
    assert diffs[5] > diffs[0]
    assert diffs[5] > diffs[-1]


def test_rr_intervals() -> None:
    """R-R mean matches 60000/HR; variability drops as degradation advances."""
    stable_engine = _stable_engine(seed=5)
    degr_engine = PhysiologyEngine(
        PatientConfig(seed=5),
        mode="degradation",
        degradation_onset=0.0,
        degradation_midpoint=50.0,
        degradation_steepness=0.2,
    )

    s_stable = stable_engine.generate(10.0)
    mean_rr = float(np.mean(s_stable.rr_intervals))
    expected = 60000.0 / s_stable.hr
    assert math.isclose(mean_rr, expected, rel_tol=0.10), (mean_rr, expected)

    # Variability: compute over many ticks in each regime.
    stable_rrs = [
        rr
        for state in (stable_engine.generate(float(t)) for t in range(20, 60))
        for rr in state.rr_intervals
    ]
    # Drive the degradation engine past its midpoint.
    for t in range(0, 150):
        degr_engine.generate(float(t))
    degraded_rrs = [
        rr
        for state in (degr_engine.generate(float(t)) for t in range(150, 200))
        for rr in state.rr_intervals
    ]

    stable_std = float(np.std(stable_rrs))
    degraded_std = float(np.std(degraded_rrs))
    assert degraded_std < stable_std, (stable_std, degraded_std)


def test_r_sim_q_sim_consistency() -> None:
    """Q_sim · R_sim must equal the (normalized) pulse pressure — Ohm's vascular law."""
    engine = PhysiologyEngine(
        PatientConfig(seed=3),
        mode="degradation",
        degradation_onset=0.0,
        degradation_midpoint=200.0,
        degradation_steepness=0.04,
    )
    seq = engine.generate_sequence(400)

    cfg = engine.config
    ref = cfg.baseline_bp_sys - cfg.baseline_bp_dia
    for s in seq:
        expected = (s.delta_p / ref) / s.r_sim
        assert math.isclose(s.q_sim, expected, rel_tol=0.01), (s.timestamp, s.q_sim, expected)


def test_training_factory() -> None:
    """Factory output respects the stable_ratio, varies patients, and ships a 30-min warmup."""
    dataset = generate_training_dataset(
        n_stays=10,
        stay_duration_range=(900, 1800),  # short — keeps the test fast
        master_seed=0,
    )
    assert len(dataset) == 10

    stable_count = sum(1 for s in dataset if s["mode"] == "stable")
    assert 1 <= stable_count <= 7  # 10 × 0.35 = 3.5 ± sampling noise

    ages = {s["config"].age_years for s in dataset}
    assert len(ages) >= 3, f"age should vary across stays: {ages}"

    baselines_hr = {round(s["config"].baseline_hr, 2) for s in dataset}
    assert len(baselines_hr) == 10, "baselines should differ per stay"

    durations = {len(s["states"]) for s in dataset}
    assert len(durations) > 1, f"stay durations should vary: {durations}"

    for stay in dataset:
        assert len(stay["warmup_states"]) == WARMUP_DURATION_S


def test_bp_stays_flat_during_compensation() -> None:
    """BP must stay near baseline during compensation — the medical advisor confirmed
    that in pediatric sepsis the compensation goes through tachycardia, not through
    rising systemic resistance. An early BP bump of >8 mmHg would misrepresent the
    physiology and contradict the clinical narrative we defend to the jury.
    """
    config = PatientConfig(patient_id="bp_flat", seed=42)
    engine = PhysiologyEngine(config, mode="degradation")
    engine.degradation_onset = 60
    engine.degradation_midpoint = 200

    # Compensation window (d rises from ~0.08 to ~0.22 with default steepness).
    states_comp = [engine.generate(float(t)) for t in range(120, 150)]
    mean_bp = sum(s.bp_sys for s in states_comp) / len(states_comp)

    assert mean_bp < config.baseline_bp_sys + 8, (
        f"BP rises too much during compensation: {mean_bp:.1f} "
        f"vs baseline {config.baseline_bp_sys}"
    )


def test_demo_engine_roundtrip() -> None:
    """The rehearsed demo scenario runs end-to-end and produces a serializable state."""
    engine = create_demo_engine()
    state = engine.generate(300.0)
    payload = state.to_dict()
    assert payload["hr"] == state.hr
    assert payload["delta_t"] == state.delta_t
    assert 0.0 <= payload["haoma_target"] <= 1.0
