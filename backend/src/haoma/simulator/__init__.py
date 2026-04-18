"""Patient simulator — Dev 1.

Generates correlated pediatric physiological data (heart rate, SpO2, BP, core/peripheral
temperature, perfusion index, respiratory rate, plethysmography) plus the simulator's
internal R_sim and Q_sim (needed for PINN weak supervision).

Degradation profile: sigmoid (long compensation, then fast collapse) — never linear.
Scenarios are configured via JSON files in haoma/demo/scenarios/.

See ../../CLAUDE.md section "Simulateur (Dev 1)" for specs.
"""
