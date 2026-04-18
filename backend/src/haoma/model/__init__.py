"""PINN multi-head model — Dev 2.

PyTorch 3-head network (R_hat, Q_hat, Haoma Index) with a composite loss:
  L_total = L_data + alpha * L_supervision + lambda_1 * L_pressure_flow + lambda_2 * L_conservation

Physical outputs are bounded: R in [0.5, 5.0], Q in [0.1, 3.0] (softplus + clamp).
Shared layers use Tanh or GELU — never ReLU (unstable with physics loss).

See ../../CLAUDE.md section "Modèle PINN (Dev 2) — 3 têtes (pas 4)" for specs.
"""
