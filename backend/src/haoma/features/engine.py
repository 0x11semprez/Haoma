"""Feature engine — 4 clinical features fed to the PINN.

Owner: Dev 1. Feature ordering is dictated by haoma.config.FEATURE_ORDER and never
changes. The engine maintains a rolling 30-minute buffer so windowed features
(HRV trend, degradation slope) can be computed online as each new state arrives.
"""

from __future__ import annotations

import json
from collections import deque
from collections.abc import Sequence
from typing import Any

import numpy as np

from haoma.config import FEATURE_ORDER
from haoma.simulator.patient import PatientState


class FeatureEngine:
    """Compute the 4 features from raw simulator states.

    1. delta_t           — T_central - T_periph (peripheral vasoconstriction, instant).
    2. hrv_trend         — slope of SDNN over the rolling window (autonomic stress).
    3. pi_hr_ratio       — perfusion index normalized by heart rate (instant).
    4. degradation_slope — slope of delta_t over the rolling window (aggregated drift).
    """

    def __init__(self, window_minutes: int = 30, hz: int = 1) -> None:
        if hz <= 0:
            raise ValueError("hz must be positive")
        self.window_minutes = window_minutes
        self.hz = hz
        self._window_size = window_minutes * 60 * hz
        self._buf: dict[str, deque] = {}
        self.reset()

    def reset(self) -> None:
        """Clear the buffer. Call between stays during training."""
        size = self._window_size
        # Scalars are precomputed on push so compute() does polyfit only on
        # already-reduced series — otherwise np.std over 1800 R-R lists per
        # tick dominates runtime (~15 ms × 1800 ticks = minutes per stay).
        self._buf = {
            "delta_t": deque(maxlen=size),
            "sdnn": deque(maxlen=size),
        }

    def warmup(self, states: Sequence[PatientState]) -> None:
        """Pre-fill the buffer with stable states so windowed features are ready at t=0."""
        self.reset()
        for state in states:
            self._push(state)

    def _push(self, state: PatientState) -> None:
        self._buf["delta_t"].append(state.t_central - state.t_periph)
        self._buf["sdnn"].append(_sdnn(state.rr_intervals))

    def compute(self, state: PatientState) -> dict[str, float]:
        """Push the state and emit the 4-feature dict (keys in FEATURE_ORDER)."""
        self._push(state)
        delta_t = state.t_central - state.t_periph
        pi_hr_ratio = state.pi / state.hr if state.hr > 0 else 0.0
        return {
            "delta_t": float(delta_t),
            "hrv_trend": self._hrv_trend(),
            "pi_hr_ratio": float(pi_hr_ratio),
            "degradation_slope": self._degradation_slope(),
        }

    def compute_with_aux(
        self, state: PatientState
    ) -> tuple[dict[str, float], dict[str, float]]:
        """Return (features, aux). aux carries BP for the PINN ΔP-based losses."""
        features = self.compute(state)
        aux = {"bp_sys": float(state.bp_sys), "bp_dia": float(state.bp_dia)}
        return features, aux

    def compute_batch(
        self,
        states: Sequence[PatientState],
        warmup_states: Sequence[PatientState] | None = None,
    ) -> list[dict[str, float]]:
        """Compute features for a full stay. ``warmup_states`` seeds the rolling window."""
        self.reset()
        if warmup_states:
            self.warmup(warmup_states)
        return [self.compute(state) for state in states]

    # -- Windowed features -------------------------------------------------

    def _hrv_trend(self) -> float:
        """Slope of SDNN subsampled to 1 point/minute over the rolling window.

        Negative slope → HRV is decreasing → rising autonomic stress → early
        signal of physiological decompensation.
        """
        return _window_slope(self._buf["sdnn"])

    def _degradation_slope(self) -> float:
        """Slope of delta_t subsampled to 1 point/minute — aggregated drift."""
        return _window_slope(self._buf["delta_t"])


def _sdnn(rr_intervals: Sequence[float]) -> float:
    """SDNN — standard deviation of R-R intervals in ms."""
    if len(rr_intervals) < 2:
        return 0.0
    return float(np.std(np.asarray(rr_intervals, dtype=np.float64), ddof=1))


def _window_slope(buffer: Sequence[float]) -> float:
    """Subsample the buffer to ≤30 points (≈1/min at 1 Hz) and fit a line."""
    n = len(buffer)
    if n < 60:
        return 0.0
    step = max(1, n // 30)
    subsampled = list(buffer)[::step][-30:]
    if len(subsampled) < 3:
        return 0.0
    x = np.arange(len(subsampled), dtype=np.float64)
    slope, _ = np.polyfit(x, subsampled, 1)
    return float(slope)


# ---------------------------------------------------------------------------
# Z-score normalizer — stats are fitted on the training set, saved alongside
# the PINN weights, and reused at inference.
# ---------------------------------------------------------------------------


class FeatureNormalizer:
    """Z-score normalization over FEATURE_ORDER. Stats fitted on the training set."""

    def __init__(self) -> None:
        self.mean: dict[str, float] = {}
        self.std: dict[str, float] = {}
        self._fitted = False

    @property
    def fitted(self) -> bool:
        return self._fitted

    def fit(self, feature_rows: Sequence[dict[str, float]]) -> None:
        for k in FEATURE_ORDER:
            arr = np.array([row[k] for row in feature_rows], dtype=np.float64)
            self.mean[k] = float(np.mean(arr))
            std = float(np.std(arr))
            # Guard against degenerate (constant) features — division by zero.
            self.std[k] = std if std >= 1e-8 else 1.0
        self._fitted = True

    def transform(self, features: dict[str, float]) -> list[float]:
        if not self._fitted:
            raise RuntimeError("FeatureNormalizer.fit() must be called first")
        return [(features[k] - self.mean[k]) / self.std[k] for k in FEATURE_ORDER]

    def save(self, path: str) -> None:
        data: dict[str, Any] = {"mean": self.mean, "std": self.std}
        with open(path, "w") as f:
            json.dump(data, f, indent=2)

    @classmethod
    def load(cls, path: str) -> FeatureNormalizer:
        with open(path) as f:
            data = json.load(f)
        norm = cls()
        norm.mean = {k: float(v) for k, v in data["mean"].items()}
        norm.std = {k: float(v) for k, v in data["std"].items()}
        norm._fitted = True
        return norm


if __name__ == "__main__":
    from haoma.simulator import create_demo_engine

    sim = create_demo_engine()
    fe = FeatureEngine()

    warmup = sim.generate_sequence(1800)  # 30 min of the scenario (onset=90s kicks in)
    main = sim.generate_sequence(420)

    fe.warmup(warmup)
    for t in (0, 60, 180, 300, 419):
        f = fe.compute(main[t])
        print(
            f"t={t:>4}  "
            f"ΔT={f['delta_t']:5.2f}  "
            f"HRV'={f['hrv_trend']:+.4f}  "
            f"PI/HR={f['pi_hr_ratio']:.4f}  "
            f"slope={f['degradation_slope']:+.4f}"
        )
