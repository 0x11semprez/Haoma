"""Feature engine smoke tests — Dev 1 to expand."""

from __future__ import annotations

from haoma.config import FEATURE_ORDER
from haoma.schemas import Features


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
