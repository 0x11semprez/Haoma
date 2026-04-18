"""Composite loss for the 3-head PINN.

    L_total = L_data + α·L_supervision + λ₁·L_pressure_flow + λ₂·L_conservation

Owner: Dev 2. Physics constraints apply to the OUTPUTS of the network, not to
relations between input features (non-negotiable #4).
"""

from __future__ import annotations

import torch

from haoma.config import LOSS_WEIGHTS


def composite_loss(
    pred_index: torch.Tensor,
    target_index: torch.Tensor,
    pred_r: torch.Tensor,
    pred_q: torch.Tensor,
    sim_r: torch.Tensor,
    sim_q: torch.Tensor,
    delta_p: torch.Tensor,
) -> dict[str, torch.Tensor]:
    mse = torch.nn.functional.mse_loss

    l_data = mse(pred_index, target_index)
    l_supervision = mse(pred_r, sim_r) + mse(pred_q, sim_q)
    l_pressure_flow = ((pred_q - delta_p / pred_r) ** 2).mean()
    # Temporal incoherence of Q along the batch dim (placeholder — Dev 2 to refine).
    if pred_q.dim() >= 2 and pred_q.shape[0] > 1:
        l_conservation = ((pred_q[1:] - pred_q[:-1]) ** 2).mean()
    else:
        l_conservation = torch.zeros((), device=pred_q.device)

    total = (
        l_data
        + LOSS_WEIGHTS["alpha"] * l_supervision
        + LOSS_WEIGHTS["lambda1"] * l_pressure_flow
        + LOSS_WEIGHTS["lambda2"] * l_conservation
    )
    return {
        "total": total,
        "data": l_data,
        "supervision": l_supervision,
        "pressure_flow": l_pressure_flow,
        "conservation": l_conservation,
    }
