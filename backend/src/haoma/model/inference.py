"""Inference-only wrapper around the trained PINN.

Owner: Dev 2. Used by the API and by the SHAP pre-computation step.
"""

from __future__ import annotations

from pathlib import Path

import torch

from haoma.model.pinn import HaomaPINN
from haoma.schemas import Features, PhysicsOutputs


def load_model(weights_path: Path) -> HaomaPINN:
    model = HaomaPINN()
    model.load_state_dict(torch.load(weights_path, map_location="cpu"))
    model.eval()
    return model


def predict(model: HaomaPINN, features: Features) -> tuple[PhysicsOutputs, float]:
    x = torch.tensor(
        [
            features.delta_t,
            features.hrv_trend,
            features.pi_hr_ratio,
            features.degradation_slope,
        ],
        dtype=torch.float32,
    ).unsqueeze(0)
    with torch.no_grad():
        out = model(x)
    physics = PhysicsOutputs(resistance=float(out["R"].item()), flow=float(out["Q"].item()))
    return physics, float(out["haoma_index"].item())
