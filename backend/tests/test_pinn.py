"""PINN smoke tests — Dev 2 to expand."""

from __future__ import annotations

import torch

from haoma.config import PHYSICS_RANGES, PINN_ARCHITECTURE
from haoma.core.seed import set_seed
from haoma.model.pinn import HaomaPINN


def test_architecture_has_three_heads() -> None:
    assert PINN_ARCHITECTURE["output_heads"] == 3


def test_activation_is_not_relu() -> None:
    # ReLU is forbidden — unstable with the physics loss (CLAUDE.md non-negotiable).
    assert PINN_ARCHITECTURE["activation"] in {"tanh", "gelu"}


def test_forward_respects_physics_bounds() -> None:
    set_seed(42)
    model = HaomaPINN()
    x = torch.randn(8, int(PINN_ARCHITECTURE["input_dim"]))
    out = model(x)
    assert out["R"].shape == (8,)
    assert out["Q"].shape == (8,)
    assert out["haoma_index"].shape == (8,)
    assert torch.all(out["R"] >= PHYSICS_RANGES["R"]["min"])
    assert torch.all(out["R"] <= PHYSICS_RANGES["R"]["max"])
    assert torch.all(out["Q"] >= PHYSICS_RANGES["Q"]["min"])
    assert torch.all(out["Q"] <= PHYSICS_RANGES["Q"]["max"])
    assert torch.all(out["haoma_index"] >= 0.0)
    assert torch.all(out["haoma_index"] <= 1.0)
