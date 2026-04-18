"""Composite loss for the 3-head PINN.

    L_total = L_data + α·L_supervision + λ₁·L_pressure_flow + λ₂·L_conservation

Owner: Dev 2. Physics constraints apply to the OUTPUTS of the network (CLAUDE.md
non-negotiable #4), not to relations between input features — this is what makes
Haoma a PINN in the Raissi et al. sense.

No L_compliance / λ₃ term — the compliance head has been cut.
"""

from __future__ import annotations

import torch
import torch.nn.functional as F

from haoma.config import LOSS_WEIGHTS


def haoma_loss(
    # Network outputs at t
    R_t: torch.Tensor,              # (batch, 1)
    Q_t: torch.Tensor,              # (batch, 1)
    score_t: torch.Tensor,          # (batch, 1)
    # Network outputs at t-1 (temporal conservation needs both)
    R_t_prev: torch.Tensor,         # (batch, 1)
    Q_t_prev: torch.Tensor,         # (batch, 1)
    # Training labels
    score_target: torch.Tensor,     # (batch, 1) — from simulator degradation factor
    R_sim: torch.Tensor,            # (batch, 1) — pseudo ground-truth for R̂
    Q_sim: torch.Tensor,            # (batch, 1) — pseudo ground-truth for Q̂
    # Auxiliary (not fed into the network)
    delta_p_t: torch.Tensor,        # (batch, 1) — pulse pressure at t
    delta_p_t_prev: torch.Tensor,   # (batch, 1) — pulse pressure at t-1
) -> tuple[torch.Tensor, dict[str, float]]:
    """Composite physics + data loss. Returns (total_loss, scalar metrics dict)."""
    alpha = float(LOSS_WEIGHTS["alpha"])
    lambda1 = float(LOSS_WEIGHTS["lambda1"])
    lambda2 = float(LOSS_WEIGHTS["lambda2"])

    # --- 1. Data loss on the Haoma Index ---------------------------------
    L_data = F.mse_loss(score_t, score_target)

    # --- 2. Weak supervision on R̂, Q̂ -----------------------------------
    # Without this, R and Q can collapse to zero while still satisfying Q = ΔP/R.
    L_supervision = alpha * (F.mse_loss(R_t, R_sim) + F.mse_loss(Q_t, Q_sim))

    # --- 3. Ohm's vascular law: Q̂ ≈ ΔP / R̂ -----------------------------
    # .detach() on Q_expected so the gradient of this term only pushes Q
    # toward ΔP/R. R is shaped by L_supervision and by its own path through
    # the shared trunk; without detach the two heads fight each other.
    Q_expected = delta_p_t / (R_t + 1e-6)
    L_pressure_flow = lambda1 * F.mse_loss(Q_t, Q_expected.detach())

    # --- 4. Temporal coherence: dQ/dt matches the derivative of ΔP/R -----
    # From Q = ΔP/R: dQ/dt = (dP·R - ΔP·dR) / R².
    dQ = Q_t - Q_t_prev
    dR = R_t - R_t_prev
    dP = delta_p_t - delta_p_t_prev
    expected_dQ = (dP * R_t - delta_p_t * dR) / (R_t * R_t_prev + 1e-6)
    L_conservation = lambda2 * F.mse_loss(dQ, expected_dQ.detach())

    L_total = L_data + L_supervision + L_pressure_flow + L_conservation

    metrics = {
        "loss_total": float(L_total.item()),
        "loss_data": float(L_data.item()),
        "loss_supervision": float(L_supervision.item()),
        "loss_pressure_flow": float(L_pressure_flow.item()),
        "loss_conservation": float(L_conservation.item()),
    }
    return L_total, metrics
