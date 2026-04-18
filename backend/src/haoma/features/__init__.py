"""Feature engine — Dev 1.

Computes 4 features from raw simulator output:
  1. delta_t            — T_central - T_periph (vasoconstriction proxy)
  2. hrv_trend          — HRV slope on a rolling window (from R-R intervals)
  3. pi_hr_ratio        — perfusion index normalized by heart rate
  4. degradation_slope  — aggregated 30-min temporal derivative

See ../../CLAUDE.md section "Features (Dev 1) — 4 features seulement".
"""

from haoma.features.engine import FeatureEngine, FeatureNormalizer

__all__ = ["FeatureEngine", "FeatureNormalizer"]
