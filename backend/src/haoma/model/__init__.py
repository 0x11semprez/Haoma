"""PINN multi-head model — Dev 2.

PyTorch 3-head network (R̂, Q̂, Haoma Index) with a composite loss:
    L_total = L_data + α·L_supervision + λ₁·L_pressure_flow + λ₂·L_conservation

Physical outputs are bounded via ``sigmoid · (max-min) + min`` (smooth gradients at
the boundaries, unlike softplus + clamp). Shared layers use Tanh — never ReLU.
See ../../CLAUDE.md section "Modèle PINN (Dev 2) — 3 têtes (pas 4)" for specs.
"""

from haoma.model.inference import HaomaInference
from haoma.model.loss import haoma_loss
from haoma.model.pinn import HaomaNet

__all__ = ["HaomaInference", "HaomaNet", "haoma_loss"]
