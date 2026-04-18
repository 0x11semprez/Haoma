"""Scenario configuration — demo scenario + training dataset factory.

Scenario = config file. Simulator code stays generic.
Owner: Dev 1. See CLAUDE.md section "Simulateur (Dev 1)".
"""

from __future__ import annotations

from typing import Any

import numpy as np

from haoma.config import WARMUP_DURATION_S
from haoma.simulator.patient import PatientConfig, PatientState
from haoma.simulator.physiology import PhysiologyEngine

# ---------------------------------------------------------------------------
# Demo scenario — 4-year-old post-renal-transplant, septic shock on acute PNA.
# ---------------------------------------------------------------------------

DEMO_SCENARIO_CONFIG: dict[str, Any] = {
    "patient_id": "demo_patient",
    "age_years": 4,
    "weight_kg": 16.0,
    "pathology": "Choc septique sur PNA du greffon rénal",
    "context": "Post-greffe rénale, J+180, pyélonéphrite aiguë à E. coli",
    "seed": 42,
    "baseline_hr": 98,
    "baseline_spo2": 97,
    "baseline_bp_sys": 90,
    "baseline_bp_dia": 56,
    "baseline_rr": 26,
    "baseline_t_central": 37.2,
    "baseline_t_periph": 36.8,
    "baseline_pi": 3.0,
    "degradation_onset": 90,        # 1:30 — phase 1 stable
    "degradation_midpoint": 240,    # 4:00 — d = 0.5 mid-demo
    "degradation_steepness": 0.03,
}


def create_demo_engine() -> PhysiologyEngine:
    """Instantiate the engine for the rehearsed jury demo scenario."""
    cfg = PatientConfig(
        patient_id=DEMO_SCENARIO_CONFIG["patient_id"],
        age_years=DEMO_SCENARIO_CONFIG["age_years"],
        weight_kg=DEMO_SCENARIO_CONFIG["weight_kg"],
        pathology=DEMO_SCENARIO_CONFIG["pathology"],
        seed=DEMO_SCENARIO_CONFIG["seed"],
        baseline_hr=DEMO_SCENARIO_CONFIG["baseline_hr"],
        baseline_spo2=DEMO_SCENARIO_CONFIG["baseline_spo2"],
        baseline_bp_sys=DEMO_SCENARIO_CONFIG["baseline_bp_sys"],
        baseline_bp_dia=DEMO_SCENARIO_CONFIG["baseline_bp_dia"],
        baseline_rr=DEMO_SCENARIO_CONFIG["baseline_rr"],
        baseline_t_central=DEMO_SCENARIO_CONFIG["baseline_t_central"],
        baseline_t_periph=DEMO_SCENARIO_CONFIG["baseline_t_periph"],
        baseline_pi=DEMO_SCENARIO_CONFIG["baseline_pi"],
    )
    return PhysiologyEngine(
        cfg,
        mode="degradation",
        degradation_onset=DEMO_SCENARIO_CONFIG["degradation_onset"],
        degradation_midpoint=DEMO_SCENARIO_CONFIG["degradation_midpoint"],
        degradation_steepness=DEMO_SCENARIO_CONFIG["degradation_steepness"],
    )


# ---------------------------------------------------------------------------
# Training dataset factory
# ---------------------------------------------------------------------------


def _pediatric_baselines(age_years: int, rng: np.random.RandomState) -> dict[str, float]:
    """Age-appropriate baselines with ±5-10% jitter.

    Formulas approximate the standard pediatric ranges (HR decreases with age, BP rises,
    RR drops). Sufficient for training variability — exact clinical calibration is
    delegated to the medical advisor for the demo scenario only.
    """
    hr = 100.0 - 2.0 * age_years
    bp_sys = 80.0 + 2.0 * age_years
    bp_dia = bp_sys * 0.6
    rr = max(18.0, 30.0 - age_years)
    spo2 = 97.5
    t_central = 37.0
    t_periph = 36.6
    pi = 3.0

    def jitter(x: float, pct: float = 0.07) -> float:
        return float(x * (1.0 + rng.uniform(-pct, pct)))

    return {
        "baseline_hr": jitter(hr),
        "baseline_spo2": float(np.clip(jitter(spo2, 0.02), 94.0, 100.0)),
        "baseline_bp_sys": jitter(bp_sys),
        "baseline_bp_dia": jitter(bp_dia),
        "baseline_rr": jitter(rr),
        "baseline_t_central": jitter(t_central, 0.01),
        "baseline_t_periph": jitter(t_periph, 0.01),
        "baseline_pi": jitter(pi, 0.10),
    }


def generate_training_dataset(
    n_stays: int = 500,
    stay_duration_range: tuple[int, int] = (7200, 21600),
    stable_ratio: float = 0.35,
    age_range: tuple[int, int] = (1, 12),
    base_steepness: float = 0.025,
    steepness_multiplier_range: tuple[float, float] = (0.3, 1.5),
    master_seed: int = 0,
) -> list[dict[str, Any]]:
    """Build a dataset of ``n_stays`` synthetic pediatric trajectories.

    Each stay is a dict with:
        - "config":          PatientConfig
        - "mode":            "stable" | "degradation"
        - "states":          list[PatientState] of length stay_duration
        - "warmup_states":   list[PatientState] of length WARMUP_DURATION_S (30 min)

    Warmup is always stable and precedes the stay, so rolling-window features
    (HRV trend, 30-min slope) have enough history at stay start.
    """
    min_duration, max_duration = stay_duration_range
    mult_lo, mult_hi = steepness_multiplier_range
    age_lo, age_hi = age_range

    dataset: list[dict[str, Any]] = []
    for i in range(n_stays):
        stay_seed = master_seed + i
        param_rng = np.random.RandomState(stay_seed)

        age = int(param_rng.randint(age_lo, age_hi + 1))
        weight = 2.0 * age + 8.0
        baselines = _pediatric_baselines(age, param_rng)

        is_stable = param_rng.random_sample() < stable_ratio
        mode = "stable" if is_stable else "degradation"

        stay_duration = int(param_rng.randint(min_duration, max_duration + 1))

        if is_stable:
            onset = float(stay_duration + 1)  # never triggers
            steepness = base_steepness
        else:
            # Offset onset by the warmup so d(t < warmup) = 0 naturally.
            within_stay_onset = param_rng.uniform(0.2, 0.8) * stay_duration
            onset = WARMUP_DURATION_S + within_stay_onset
            multiplier = float(param_rng.uniform(mult_lo, mult_hi))
            steepness = base_steepness * multiplier

        midpoint = onset + 180.0  # sigmoid centered ~3 min after onset

        config = PatientConfig(
            patient_id=f"train_{i:04d}",
            age_years=age,
            weight_kg=weight,
            pathology="training",
            seed=stay_seed,
            **baselines,
        )

        engine = PhysiologyEngine(
            config,
            mode=mode,
            degradation_onset=onset,
            degradation_midpoint=midpoint,
            degradation_steepness=steepness,
        )

        total_states = engine.generate_sequence(WARMUP_DURATION_S + stay_duration)
        warmup_states: list[PatientState] = total_states[:WARMUP_DURATION_S]
        states: list[PatientState] = total_states[WARMUP_DURATION_S:]

        dataset.append(
            {
                "config": config,
                "mode": mode,
                "states": states,
                "warmup_states": warmup_states,
            }
        )

    return dataset


if __name__ == "__main__":
    import time

    engine = create_demo_engine()
    print("Demo engine OK:", engine.config.patient_id, engine.mode)

    t0 = time.time()
    ds = generate_training_dataset(n_stays=5, stay_duration_range=(1800, 3600))
    dt = time.time() - t0
    stable = sum(1 for s in ds if s["mode"] == "stable")
    print(f"5 short stays in {dt:.2f}s — stable={stable}, degradation={len(ds) - stable}")
    print(f"First stay: {len(ds[0]['warmup_states'])} warmup + {len(ds[0]['states'])} stay states")
