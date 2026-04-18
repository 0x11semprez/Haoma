"""3-head PINN — R̂ (resistance), Q̂ (flow), Haoma Index.

Owner: Dev 2. Shared trunk uses Tanh or GELU (NOT ReLU — unstable with physics loss).
See CLAUDE.md section "Modèle PINN (Dev 2) — 3 têtes (pas 4)".
"""

from __future__ import annotations

import torch
from torch import nn

from haoma.config import PHYSICS_RANGES, PINN_ARCHITECTURE


class HaomaPINN(nn.Module):
    """3 heads: R̂, Q̂, Haoma Index. No compliance head (cut per CLAUDE.md)."""

    def __init__(
        self,
        input_dim: int = int(PINN_ARCHITECTURE["input_dim"]),
        hidden_dim: int = int(PINN_ARCHITECTURE["hidden_dim"]),
        n_hidden_layers: int = int(PINN_ARCHITECTURE["n_hidden_layers"]),
    ) -> None:
        super().__init__()
        activation_name = str(PINN_ARCHITECTURE["activation"])
        activation_cls: type[nn.Module] = {"tanh": nn.Tanh, "gelu": nn.GELU}[activation_name]

        trunk_layers: list[nn.Module] = [nn.Linear(input_dim, hidden_dim), activation_cls()]
        for _ in range(n_hidden_layers - 1):
            trunk_layers.extend([nn.Linear(hidden_dim, hidden_dim), activation_cls()])
        self.trunk = nn.Sequential(*trunk_layers)

        self.head_r = nn.Linear(hidden_dim, 1)
        self.head_q = nn.Linear(hidden_dim, 1)
        self.head_index = nn.Linear(hidden_dim, 1)

    def forward(self, x: torch.Tensor) -> dict[str, torch.Tensor]:
        z = self.trunk(x)
        r = torch.clamp(
            torch.nn.functional.softplus(self.head_r(z)).squeeze(-1),
            PHYSICS_RANGES["R"]["min"],
            PHYSICS_RANGES["R"]["max"],
        )
        q = torch.clamp(
            torch.nn.functional.softplus(self.head_q(z)).squeeze(-1),
            PHYSICS_RANGES["Q"]["min"],
            PHYSICS_RANGES["Q"]["max"],
        )
        haoma_index = torch.sigmoid(self.head_index(z)).squeeze(-1)
        return {"R": r, "Q": q, "haoma_index": haoma_index}
