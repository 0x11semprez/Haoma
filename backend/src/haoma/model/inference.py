"""Inference wrapper around the trained PINN — used by the API and SHAP precompute.

Owner: Dev 2. Reads the three artifacts produced by ``haoma.model.train``:
weights, z-score stats, and the SHAP background dataset.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import torch

from haoma.config import ALERT_THRESHOLDS
from haoma.features.engine import FeatureNormalizer
from haoma.model.pinn import HaomaNet

WEIGHTS_DIR = Path(__file__).resolve().parents[3] / "data" / "weights"


class HaomaInference:
    """Loads a trained PINN + its normalizer and serves one-shot predictions."""

    def __init__(self, weights_dir: Path = WEIGHTS_DIR) -> None:
        self.weights_dir = Path(weights_dir)
        self.model = HaomaNet()
        self.model.load_state_dict(
            torch.load(self.weights_dir / "haoma_pinn.pt", map_location="cpu")
        )
        self.model.eval()

        self.normalizer = FeatureNormalizer.load(
            str(self.weights_dir / "zscore_stats.json")
        )
        self.background: np.ndarray = np.load(self.weights_dir / "shap_background.npy")

    @torch.no_grad()
    def predict(self, features: dict[str, float]) -> dict[str, float | str]:
        """Run the network on a single features dict and return the alert payload.

        Args:
            features: raw (un-normalized) features dict with the 4 FEATURE_ORDER keys.

        Returns:
            dict with ``resistance``, ``flow``, ``haoma_index``, ``alert_level``.
        """
        x = torch.tensor([self.normalizer.transform(features)], dtype=torch.float32)
        R, Q, score = self.model(x)
        haoma = float(score.item())
        return {
            "resistance": round(float(R.item()), 3),
            "flow": round(float(Q.item()), 3),
            "haoma_index": round(haoma, 4),
            "alert_level": _alert_level(haoma),
        }


def _alert_level(haoma_index: float) -> str:
    if haoma_index < ALERT_THRESHOLDS["green"]:
        return "green"
    if haoma_index < ALERT_THRESHOLDS["orange"]:
        return "orange"
    return "red"
