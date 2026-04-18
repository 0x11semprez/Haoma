"""Feature engine — computes the 4-feature vector fed to the PINN.

Owner: Dev 1. Feature ordering is dictated by haoma.config.FEATURE_ORDER.
"""

from __future__ import annotations

from collections.abc import Iterable

from haoma.schemas import Features, Vitals


class FeatureEngine:
    """Placeholder — to be implemented by Dev 1.

    Maintains a rolling buffer of Vitals and emits a Features vector per call.
    HRV is computed from the R-R intervals inside Vitals, not a separately simulated signal.
    """

    def __init__(self, window_seconds: int = 1800) -> None:
        self.window_seconds = window_seconds

    def update(self, vitals: Vitals) -> None:
        raise NotImplementedError

    def compute(self) -> Features:
        raise NotImplementedError

    def bulk(self, stream: Iterable[Vitals]) -> list[Features]:
        out: list[Features] = []
        for v in stream:
            self.update(v)
            out.append(self.compute())
        return out
