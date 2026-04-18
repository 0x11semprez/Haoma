"""Synthetic pediatric patient — configuration and state snapshot.

Owner: Dev 1. See CLAUDE.md section "Simulateur (Dev 1)".
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class PatientConfig:
    """Immutable patient configuration.

    Baselines default to a 4-year-old post-renal-transplant child (demo scenario).
    """

    patient_id: str = "demo_patient"
    age_years: int = 4
    weight_kg: float = 16.0
    pathology: str = "septic_shock"
    seed: int = 42

    baseline_hr: float = 98.0
    baseline_spo2: float = 97.0
    baseline_bp_sys: float = 90.0
    baseline_bp_dia: float = 56.0
    baseline_rr: float = 26.0
    baseline_t_central: float = 37.2
    baseline_t_periph: float = 36.8
    baseline_pi: float = 3.0


@dataclass
class PatientState:
    """Full physiological snapshot at one instant."""

    timestamp: float
    hr: float
    spo2: float
    bp_sys: float
    bp_dia: float
    rr: float
    t_central: float
    t_periph: float
    pi: float
    rr_intervals: list[float] = field(default_factory=list)
    pleth_waveform: list[float] | None = None
    r_sim: float = 0.0
    q_sim: float = 0.0
    degradation_factor: float = 0.0
    haoma_target: float = 0.0

    @property
    def delta_t(self) -> float:
        return self.t_central - self.t_periph

    @property
    def delta_p(self) -> float:
        # Pulse pressure — used by the PINN pressure/flow constraint.
        return self.bp_sys - self.bp_dia

    def to_dict(self) -> dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "hr": self.hr,
            "spo2": self.spo2,
            "bp_sys": self.bp_sys,
            "bp_dia": self.bp_dia,
            "rr": self.rr,
            "t_central": self.t_central,
            "t_periph": self.t_periph,
            "pi": self.pi,
            "delta_t": self.delta_t,
            "delta_p": self.delta_p,
            "rr_intervals": list(self.rr_intervals),
            "pleth_waveform": list(self.pleth_waveform) if self.pleth_waveform else None,
            "r_sim": self.r_sim,
            "q_sim": self.q_sim,
            "degradation_factor": self.degradation_factor,
            "haoma_target": self.haoma_target,
        }


if __name__ == "__main__":
    cfg = PatientConfig()
    state = PatientState(
        timestamp=0.0,
        hr=cfg.baseline_hr,
        spo2=cfg.baseline_spo2,
        bp_sys=cfg.baseline_bp_sys,
        bp_dia=cfg.baseline_bp_dia,
        rr=cfg.baseline_rr,
        t_central=cfg.baseline_t_central,
        t_periph=cfg.baseline_t_periph,
        pi=cfg.baseline_pi,
        rr_intervals=[612.0, 620.0, 605.0],
    )
    print(state.to_dict())
