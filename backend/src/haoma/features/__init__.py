"""Feature engine — Dev 1.

Computes 4 features from raw simulator output:
  1. delta_t          — T_central - T_peripheral (vasoconstriction proxy)
  2. hrv_trend_30min  — slope of HRV on 30-minute rolling window
  3. pi_fc_ratio      — perfusion index normalized by heart rate
  4. degradation_slope_30min — aggregated temporal derivative

See ../../CLAUDE.md section "Features (Dev 1) — 4 features seulement" for specs.
"""
