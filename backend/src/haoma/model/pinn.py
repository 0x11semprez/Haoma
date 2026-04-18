"""3-head PINN — R̂ (resistance), Q̂ (flow), Haoma Index.

Owner: Dev 2.

Shared trunk: 3 × Linear(64) with Tanh. ReLU is forbidden — it gives zero gradients on
half its domain and physics-loss training pushes weights into regions where ReLU is dead.
Tanh has gradients everywhere, critical when the physics and data losses pull in
different directions.

Bounding heads: sigmoid · (max - min) + min instead of softplus + clamp. Clamp kills
gradients at the boundary (no error signal when R̂ hits the ceiling); the sigmoid
formulation is naturally bounded with smooth gradients throughout.
"""

from __future__ import annotations

import torch
from torch import nn

from haoma.config import PHYSICS_RANGES, PINN_ARCHITECTURE


class HaomaNet(nn.Module):
    """3-head PINN. No compliance head — cut per CLAUDE.md non-negotiable."""

    def __init__(
        self,
        input_dim: int = int(PINN_ARCHITECTURE["input_dim"]),
        hidden_dim: int = int(PINN_ARCHITECTURE["hidden_dim"]),
        n_layers: int = int(PINN_ARCHITECTURE["n_hidden_layers"]),
    ) -> None:
        super().__init__()

        layers: list[nn.Module] = []
        prev = input_dim
        for _ in range(n_layers):
            layers.append(nn.Linear(prev, hidden_dim))
            layers.append(nn.Tanh())
            prev = hidden_dim
        self.shared = nn.Sequential(*layers)

        self.head_R = nn.Linear(hidden_dim, 1)
        self.head_Q = nn.Linear(hidden_dim, 1)
        self.head_score = nn.Linear(hidden_dim, 1)

        self._R_min = float(PHYSICS_RANGES["R"]["min"])
        self._R_max = float(PHYSICS_RANGES["R"]["max"])
        self._Q_min = float(PHYSICS_RANGES["Q"]["min"])
        self._Q_max = float(PHYSICS_RANGES["Q"]["max"])

    def forward(
        self, x: torch.Tensor
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """Forward pass.

        Args:
            x: (batch, input_dim) — z-normalized feature vector.

        Returns:
            R:     (batch, 1) — resistance,   bounded [R_min, R_max].
            Q:     (batch, 1) — flow,         bounded [Q_min, Q_max].
            score: (batch, 1) — Haoma Index, bounded [0, 1].
        """
        h = self.shared(x)
        R = torch.sigmoid(self.head_R(h)) * (self._R_max - self._R_min) + self._R_min
        Q = torch.sigmoid(self.head_Q(h)) * (self._Q_max - self._Q_min) + self._Q_min
        score = torch.sigmoid(self.head_score(h))
        return R, Q, score


if __name__ == "__main__":
    net = HaomaNet()
    x = torch.randn(4, int(PINN_ARCHITECTURE["input_dim"]))
    R, Q, s = net(x)
    print(f"R: {R.shape} {R.flatten().tolist()}")
    print(f"Q: {Q.shape} {Q.flatten().tolist()}")
    print(f"score: {s.shape} {s.flatten().tolist()}")
    print(f"params: {sum(p.numel() for p in net.parameters())}")
