"""Patient simulator — Dev 1.

Generates correlated pediatric physiological data (heart rate, SpO2, BP, core/peripheral
temperature, perfusion index, respiratory rate) plus R-R intervals and the simulator's
internal R_sim / Q_sim (needed for PINN weak supervision).

Degradation profile: sigmoid (long compensation, then fast collapse) — never linear.
See ../../CLAUDE.md section "Simulateur (Dev 1)" for specs.
"""

from haoma.simulator.patient import PatientConfig, PatientState
from haoma.simulator.physiology import PhysiologyEngine
from haoma.simulator.scenarios import (
    DEMO_SCENARIO_CONFIG,
    create_demo_engine,
    generate_training_dataset,
)

__all__ = [
    "DEMO_SCENARIO_CONFIG",
    "PatientConfig",
    "PatientState",
    "PhysiologyEngine",
    "create_demo_engine",
    "generate_training_dataset",
]
