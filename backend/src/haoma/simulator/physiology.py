"""Correlated pediatric physiology engine — stable vs. degradation modes.

Non-negotiable (CLAUDE.md):
- Parameters are INTERDEPENDENT (T_periph ↔ PI, BP_sys ↔ BP_dia, HR ↔ RR).
- Degradation profile is a sigmoid — long compensation, then fast collapse (never linear).
- Seeding goes through numpy.random.RandomState (not default_rng) for determinism.

Owner: Dev 1.
"""

from __future__ import annotations

import numpy as np

from haoma.config import PEDIATRIC_RANGES, R_BASELINE
from haoma.simulator.patient import PatientConfig, PatientState

# Parameter index in the 8-dim noise vector. Order is load-bearing — the correlation
# matrix below, the Cholesky factor, and the generate() body all index into it.
IDX_HR, IDX_BPS, IDX_BPD, IDX_SPO2, IDX_TPER, IDX_TCEN, IDX_PI, IDX_RR = range(8)

# Inter-parameter correlation (same tick). The strong ties encode shared biology:
#   T_periph ↔ PI = 0.7  (both driven by peripheral vasoconstriction)
#   BP_sys  ↔ BP_dia = 0.8 (same hemodynamic system)
#   HR      ↔ RR   = 0.3 (cardio-respiratory coupling)
_CORRELATION = np.array(
    [
        # HR   BPs  BPd  SpO2 Tper Tcen PI   RR
        [1.0, 0.2, 0.2, 0.0, 0.0, 0.0, 0.0, 0.3],  # HR
        [0.2, 1.0, 0.8, 0.0, 0.0, 0.0, 0.0, 0.0],  # BPs
        [0.2, 0.8, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0],  # BPd
        [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.2, 0.0],  # SpO2
        [0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.7, 0.0],  # Tper
        [0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0],  # Tcen
        [0.0, 0.0, 0.0, 0.2, 0.7, 0.0, 1.0, 0.0],  # PI
        [0.3, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0],  # RR
    ],
    dtype=np.float64,
)

# Per-parameter noise amplitude (stationary std-dev of the OU process). Calibrated so
# stable-mode vitals stay well inside the pediatric clinical bounds.
_NOISE_SCALE = np.array(
    [
        2.0,   # HR  (bpm)
        2.5,   # BPs (mmHg)
        2.0,   # BPd (mmHg)
        0.3,   # SpO2 (%)
        0.15,  # T_periph (°C)
        0.10,  # T_central (°C)
        0.15,  # PI (%)
        1.0,   # RR (/min)
    ],
    dtype=np.float64,
)

# OU memory coefficient — gives vitals smooth drift, not jitter.
_OU_MEMORY = 0.7


class PhysiologyEngine:
    """Tick-by-tick pediatric vitals generator with correlated noise and sigmoid degradation.

    Two modes:
    - "stable": degradation_factor stays at 0, vitals float around baseline.
    - "degradation": d(t) follows a shifted sigmoid and drives every vital.
    """

    def __init__(
        self,
        config: PatientConfig,
        mode: str = "stable",
        degradation_onset: float = 120.0,
        degradation_midpoint: float = 300.0,
        degradation_steepness: float = 0.025,
    ) -> None:
        if mode not in {"stable", "degradation"}:
            raise ValueError(f"mode must be 'stable' or 'degradation', got {mode!r}")
        self.config = config
        self.mode = mode
        self.degradation_onset = float(degradation_onset)
        self.degradation_midpoint = float(degradation_midpoint)
        self.degradation_steepness = float(degradation_steepness)

        self.rng = np.random.RandomState(config.seed)
        self._cholesky = np.linalg.cholesky(_CORRELATION)
        self._noise_state = np.zeros(8, dtype=np.float64)
        self._ou_decay = float(np.sqrt(1.0 - _OU_MEMORY**2))

        # Reference pulse pressure — keeps Q_sim in the normalized [0.1, 3.0] range
        # expected by the PINN flow head.
        self._delta_p_ref = max(
            config.baseline_bp_sys - config.baseline_bp_dia, 1e-6
        )

    def degradation_factor(self, t: float) -> float:
        """Sigmoid d(t) ∈ [0, 1]. Returns 0 in stable mode or before t_onset."""
        if self.mode == "stable":
            return 0.0
        if t < self.degradation_onset:
            return 0.0
        x = self.degradation_steepness * (t - self.degradation_midpoint)
        x = float(np.clip(x, -40.0, 40.0))  # avoid exp overflow
        return 1.0 / (1.0 + float(np.exp(-x)))

    def _correlated_noise(self) -> np.ndarray:
        white = self.rng.randn(8)
        correlated = self._cholesky @ white
        self._noise_state = _OU_MEMORY * self._noise_state + self._ou_decay * correlated
        return self._noise_state * _NOISE_SCALE

    def generate(self, t: float) -> PatientState:
        """Produce one physiological snapshot at time ``t`` (seconds)."""
        cfg = self.config
        d = self.degradation_factor(t)
        noise = self._correlated_noise()

        # --- HR: compensatory tachycardia, then decompensation when d -> 1.
        hr = cfg.baseline_hr + d * 45.0 * (1.0 - d**3) + noise[IDX_HR]

        # --- SpO2: late desaturation — d^2.5 keeps it flat until d > 0.6.
        spo2 = cfg.baseline_spo2 - (d**2.5) * 8.0 + noise[IDX_SPO2]

        # --- T_periph: EARLY signal, linear with d (peripheral vasoconstriction).
        t_periph = cfg.baseline_t_periph - d * 3.5 + noise[IDX_TPER]

        # --- T_central: mild rise (infectious context).
        t_central = cfg.baseline_t_central + d * 0.5 + noise[IDX_TCEN]

        # --- PI: EARLY signal, correlated with T_periph (shared vasoconstriction noise).
        pi = (
            cfg.baseline_pi * (1.0 - 0.8 * d)
            + noise[IDX_PI]
            + noise[IDX_TPER] * 0.5
        )

        # --- BP_sys: in pediatric sepsis, blood pressure stays quasi-flat during
        # compensation (cardiac output preserved by tachycardia, not by rising
        # systemic resistance — pediatric vessels are more compliant). Collapse
        # is late and brutal when the heart-rate compensation is overwhelmed.
        push_sys = d * 6.0 * (1.0 - d**2)     # very mild rise (was 15 pre-advisor)
        crash_sys = (d**3) * 40.0              # unchanged — late, sharp crash
        bp_sys = cfg.baseline_bp_sys + push_sys - crash_sys + noise[IDX_BPS]

        # --- BP_dia: follows BP_sys with the same medically-reviewed amplitude.
        push_dia = d * 3.0 * (1.0 - d**2)     # was 8 pre-advisor
        crash_dia = (d**3) * 20.0
        bp_dia = cfg.baseline_bp_dia + push_dia - crash_dia + noise[IDX_BPD]

        # --- RR: ventilatory compensation (intermediate signal).
        rr = cfg.baseline_rr + d * 15.0 * (1.0 - d**2) + noise[IDX_RR]

        # Clamp to the broad physiological envelope (safety net, not clinical bounds).
        hr = float(np.clip(hr, PEDIATRIC_RANGES["hr"]["min"], PEDIATRIC_RANGES["hr"]["max"]))
        spo2 = float(np.clip(spo2, PEDIATRIC_RANGES["spo2"]["min"], PEDIATRIC_RANGES["spo2"]["max"]))
        bp_sys = float(np.clip(bp_sys, PEDIATRIC_RANGES["bp_sys"]["min"], PEDIATRIC_RANGES["bp_sys"]["max"]))
        bp_dia = float(np.clip(bp_dia, PEDIATRIC_RANGES["bp_dia"]["min"], PEDIATRIC_RANGES["bp_dia"]["max"]))
        rr = float(np.clip(rr, PEDIATRIC_RANGES["rr"]["min"], PEDIATRIC_RANGES["rr"]["max"]))
        t_periph = float(np.clip(t_periph, PEDIATRIC_RANGES["t_periph"]["min"], PEDIATRIC_RANGES["t_periph"]["max"]))
        t_central = float(np.clip(t_central, PEDIATRIC_RANGES["t_central"]["min"], PEDIATRIC_RANGES["t_central"]["max"]))
        pi = float(np.clip(pi, PEDIATRIC_RANGES["pi"]["min"], PEDIATRIC_RANGES["pi"]["max"]))

        # R-R intervals — variability collapses under autonomic stress (HRV drops).
        mean_rr = 60000.0 / max(hr, 1.0)
        rr_variability = 0.05 * (1.0 - 0.7 * d)
        rr_intervals = (
            mean_rr + self.rng.normal(0.0, max(mean_rr * rr_variability, 1e-6), size=8)
        ).tolist()

        # Weak-supervision targets for the PINN (R̂, Q̂ heads).
        r_sim = float(R_BASELINE * (1.0 + 3.0 * d))
        delta_p = bp_sys - bp_dia
        q_sim = float((delta_p / self._delta_p_ref) / r_sim)

        return PatientState(
            timestamp=float(t),
            hr=hr,
            spo2=spo2,
            bp_sys=bp_sys,
            bp_dia=bp_dia,
            rr=rr,
            t_central=t_central,
            t_periph=t_periph,
            pi=pi,
            rr_intervals=rr_intervals,
            pleth_waveform=None,
            r_sim=r_sim,
            q_sim=q_sim,
            degradation_factor=d,
            haoma_target=_haoma_target(d),
        )

    def generate_sequence(self, duration_s: int, hz: int = 1) -> list[PatientState]:
        """Generate a full trajectory. Total ticks = duration_s * hz."""
        if hz <= 0:
            raise ValueError("hz must be positive")
        n = int(duration_s * hz)
        return [self.generate(i / hz) for i in range(n)]


def _haoma_target(d: float) -> float:
    """Map degradation factor d ∈ [0, 1] to the Haoma Index training label.

    Piecewise-linear, monotone, no flat plateaus — the PINN needs a smooth label.
    """
    if d < 0.1:
        return 0.05 + d * 0.5
    if d < 0.3:
        return 0.10 + (d - 0.1) * 1.0
    if d < 0.7:
        return 0.30 + (d - 0.3) * 1.25
    return 0.80 + (d - 0.7) * 0.5


if __name__ == "__main__":
    cfg = PatientConfig()
    engine = PhysiologyEngine(cfg, mode="degradation")
    for t in (0, 60, 180, 300, 420):
        s = engine.generate(float(t))
        print(
            f"t={t:>4}  d={s.degradation_factor:.3f}  "
            f"hr={s.hr:6.1f}  spo2={s.spo2:5.2f}  "
            f"dT={s.delta_t:4.2f}  pi={s.pi:4.2f}  "
            f"R={s.r_sim:.2f}  Q={s.q_sim:.2f}  "
            f"haoma={s.haoma_target:.2f}"
        )
