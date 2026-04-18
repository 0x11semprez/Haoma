"""PINN tests — architecture, composite loss, training, and inference.

Validates the non-negotiables from CLAUDE.md: 3 heads (no compliance), Tanh-only
(no ReLU), sigmoid-bounded physics outputs, and a composite loss whose physics
terms actually push predictions toward Q = ΔP/R.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import numpy as np
import pytest
import torch
from torch import nn

from haoma.config import FEATURE_ORDER, PHYSICS_RANGES, PINN_ARCHITECTURE
from haoma.core.seed import set_seed
from haoma.features.engine import FeatureNormalizer
from haoma.model.inference import HaomaInference
from haoma.model.loss import haoma_loss
from haoma.model.pinn import HaomaNet

# ---------------------------------------------------------------------------
# Config-level invariants (also in the audit — cheap to re-assert here).
# ---------------------------------------------------------------------------


def test_architecture_has_three_heads() -> None:
    assert PINN_ARCHITECTURE["output_heads"] == 3


# ---------------------------------------------------------------------------
# Architecture
# ---------------------------------------------------------------------------


def test_forward_shapes() -> None:
    set_seed(42)
    model = HaomaNet()
    x = torch.randn(8, int(PINN_ARCHITECTURE["input_dim"]))
    R, Q, score = model(x)
    assert R.shape == (8, 1)
    assert Q.shape == (8, 1)
    assert score.shape == (8, 1)


def test_output_ranges() -> None:
    """Sigmoid × scale guarantees bounded outputs without killing gradients."""
    set_seed(7)
    model = HaomaNet()
    x = torch.randn(100, int(PINN_ARCHITECTURE["input_dim"]))
    R, Q, score = model(x)

    r_min, r_max = PHYSICS_RANGES["R"]["min"], PHYSICS_RANGES["R"]["max"]
    q_min, q_max = PHYSICS_RANGES["Q"]["min"], PHYSICS_RANGES["Q"]["max"]
    assert torch.all(r_min <= R) and torch.all(r_max >= R)
    assert torch.all(q_min <= Q) and torch.all(q_max >= Q)
    assert torch.all(score >= 0.0) and torch.all(score <= 1.0)


def test_no_relu_in_model() -> None:
    model = HaomaNet()
    for module in model.modules():
        assert not isinstance(module, nn.ReLU), (
            f"ReLU forbidden in the PINN (unstable with physics loss): {module}"
        )


# ---------------------------------------------------------------------------
# Loss — helpers
# ---------------------------------------------------------------------------


def _fake_batch(
    batch: int = 16,
    *,
    R_t: float = 2.0,
    Q_t: float = 1.0,
    score_t: float = 0.5,
    R_prev: float = 2.0,
    Q_prev: float = 1.0,
    score_target: float = 0.5,
    R_sim: float = 2.0,
    Q_sim: float = 1.0,
    dp_t: float = 2.0,
    dp_prev: float = 2.0,
) -> dict[str, torch.Tensor]:
    ones = torch.ones(batch, 1, requires_grad=False)
    return {
        "R_t": ones * R_t,
        "Q_t": ones * Q_t,
        "score_t": ones * score_t,
        "R_t_prev": ones * R_prev,
        "Q_t_prev": ones * Q_prev,
        "score_target": ones * score_target,
        "R_sim": ones * R_sim,
        "Q_sim": ones * Q_sim,
        "delta_p_t": ones * dp_t,
        "delta_p_t_prev": ones * dp_prev,
    }


# ---------------------------------------------------------------------------
# Loss — correctness
# ---------------------------------------------------------------------------


def test_loss_computation() -> None:
    loss, metrics = haoma_loss(**_fake_batch(score_t=0.3, score_target=0.8))
    assert loss.dim() == 0
    assert torch.isfinite(loss)
    assert loss.item() > 0

    expected_keys = {
        "loss_total",
        "loss_data",
        "loss_supervision",
        "loss_pressure_flow",
        "loss_conservation",
    }
    assert set(metrics.keys()) == expected_keys


def test_loss_physics_constraint_penalizes_violation() -> None:
    """L_pressure_flow should punish Q̂ that doesn't match ΔP/R̂."""
    # Coherent: Q = ΔP/R = 4/2 = 2.
    coherent = _fake_batch(R_t=2.0, Q_t=2.0, dp_t=4.0)
    _, m_ok = haoma_loss(**coherent)

    # Violation: same R, ΔP but Q off by orders of magnitude.
    violated = _fake_batch(R_t=2.0, Q_t=0.1, dp_t=4.0)
    _, m_bad = haoma_loss(**violated)

    assert m_bad["loss_pressure_flow"] > m_ok["loss_pressure_flow"] * 100
    # Sanity: the coherent batch has effectively zero pressure-flow loss.
    assert m_ok["loss_pressure_flow"] < 1e-6


def test_loss_conservation_penalizes_jump() -> None:
    """L_conservation should punish dQ that doesn't match d(ΔP/R)/dt."""
    # Smooth: Q, R, ΔP constant → dQ=0, expected_dQ=0.
    smooth = _fake_batch(
        R_t=2.0, Q_t=1.0, R_prev=2.0, Q_prev=1.0, dp_t=2.0, dp_prev=2.0
    )
    _, m_smooth = haoma_loss(**smooth)

    # Jump: Q doubles while R and ΔP stay pinned → physically impossible.
    jump = _fake_batch(
        R_t=2.0, Q_t=2.0, R_prev=2.0, Q_prev=1.0, dp_t=2.0, dp_prev=2.0
    )
    _, m_jump = haoma_loss(**jump)

    assert m_jump["loss_conservation"] > m_smooth["loss_conservation"] + 1e-4


# ---------------------------------------------------------------------------
# Gradient flow
# ---------------------------------------------------------------------------


def _forward_real(model: HaomaNet, batch: int = 16) -> dict[str, torch.Tensor]:
    set_seed(0)
    x_t = torch.randn(batch, int(PINN_ARCHITECTURE["input_dim"]))
    x_prev = torch.randn(batch, int(PINN_ARCHITECTURE["input_dim"]))
    R_t, Q_t, score_t = model(x_t)
    R_prev, Q_prev, _ = model(x_prev)
    return {
        "R_t": R_t,
        "Q_t": Q_t,
        "score_t": score_t,
        "R_t_prev": R_prev,
        "Q_t_prev": Q_prev,
        "score_target": torch.rand(batch, 1),
        "R_sim": torch.ones(batch, 1) * 2.0,
        "Q_sim": torch.ones(batch, 1) * 1.0,
        "delta_p_t": torch.ones(batch, 1) * 2.5,
        "delta_p_t_prev": torch.ones(batch, 1) * 2.5,
    }


def test_gradient_flows_through_all_heads() -> None:
    model = HaomaNet()
    inputs = _forward_real(model)
    loss, _ = haoma_loss(**inputs)
    loss.backward()

    for name, head in (
        ("head_R", model.head_R),
        ("head_Q", model.head_Q),
        ("head_score", model.head_score),
    ):
        assert head.weight.grad is not None, f"{name} grad is None"
        assert head.weight.grad.abs().sum() > 0, f"{name} grad is zero"


def test_training_reduces_loss() -> None:
    """50 steps on random labels must reduce the loss (model learns anything at all)."""
    set_seed(123)
    model = HaomaNet()
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)

    x_t = torch.randn(64, int(PINN_ARCHITECTURE["input_dim"]))
    x_prev = torch.randn(64, int(PINN_ARCHITECTURE["input_dim"]))
    y = torch.rand(64, 1)
    R_sim = torch.rand(64, 1) * 3.0 + 1.0
    Q_sim = torch.rand(64, 1) * 0.8 + 0.3
    dp = torch.rand(64, 1) * 2.0 + 1.5

    initial_loss = None
    final_loss = None
    for step in range(50):
        R_t, Q_t, score_t = model(x_t)
        R_prev, Q_prev, _ = model(x_prev)
        loss, _ = haoma_loss(
            R_t=R_t,
            Q_t=Q_t,
            score_t=score_t,
            R_t_prev=R_prev,
            Q_t_prev=Q_prev,
            score_target=y,
            R_sim=R_sim,
            Q_sim=Q_sim,
            delta_p_t=dp,
            delta_p_t_prev=dp,
        )
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

        if step == 0:
            initial_loss = float(loss.item())
        final_loss = float(loss.item())

    assert initial_loss is not None and final_loss is not None
    assert final_loss < initial_loss, (initial_loss, final_loss)


# ---------------------------------------------------------------------------
# Save / load roundtrip
# ---------------------------------------------------------------------------


def test_save_load_roundtrip() -> None:
    set_seed(9)
    src = HaomaNet()
    x = torch.randn(4, int(PINN_ARCHITECTURE["input_dim"]))
    with torch.no_grad():
        R1, Q1, s1 = src(x)

    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "haoma_pinn.pt"
        torch.save(src.state_dict(), path)
        dst = HaomaNet()
        dst.load_state_dict(torch.load(path, map_location="cpu"))
        with torch.no_grad():
            R2, Q2, s2 = dst(x)

    assert torch.allclose(R1, R2)
    assert torch.allclose(Q1, Q2)
    assert torch.allclose(s1, s2)


# ---------------------------------------------------------------------------
# Inference class
# ---------------------------------------------------------------------------


def test_inference_class() -> None:
    set_seed(17)
    model = HaomaNet()
    normalizer = FeatureNormalizer()
    # Fit on synthetic feature rows so the z-score stats file is meaningful.
    rng = np.random.RandomState(0)
    rows = [
        {
            "delta_t": float(rng.normal(1.0, 0.5)),
            "hrv_trend": float(rng.normal(-0.05, 0.02)),
            "pi_hr_ratio": float(rng.normal(0.03, 0.005)),
            "degradation_slope": float(rng.normal(0.0, 0.01)),
        }
        for _ in range(200)
    ]
    normalizer.fit(rows)
    background = np.array([normalizer.transform(r) for r in rows[:50]], dtype=np.float32)

    with tempfile.TemporaryDirectory() as tmp:
        weights_dir = Path(tmp)
        torch.save(model.state_dict(), weights_dir / "haoma_pinn.pt")
        normalizer.save(str(weights_dir / "zscore_stats.json"))
        np.save(weights_dir / "shap_background.npy", background)

        infer = HaomaInference(weights_dir=weights_dir)
        result = infer.predict(rows[0])

    assert set(result.keys()) == {"resistance", "flow", "haoma_index", "alert_level"}
    assert PHYSICS_RANGES["R"]["min"] <= result["resistance"] <= PHYSICS_RANGES["R"]["max"]
    assert PHYSICS_RANGES["Q"]["min"] <= result["flow"] <= PHYSICS_RANGES["Q"]["max"]
    assert 0.0 <= result["haoma_index"] <= 1.0
    assert result["alert_level"] in {"green", "orange", "red"}


# ---------------------------------------------------------------------------
# Detach semantics — pressure-flow term must not flow gradient into head_R.
# ---------------------------------------------------------------------------


def test_detach_in_pressure_flow() -> None:
    """With Q_expected.detach(), L_pressure_flow contributes zero gradient to head_R."""
    # Full composite loss — head_R grad comes from L_data (via trunk), L_supervision.
    model_full = HaomaNet()
    set_seed(0)
    model_full.load_state_dict(HaomaNet().state_dict())  # deterministic init

    inputs = _forward_real(model_full)
    loss_full, _ = haoma_loss(**inputs)
    loss_full.backward()
    g_full = model_full.head_R.weight.grad.detach().clone()

    # Same init, same inputs — drop the pressure-flow term manually by reproducing
    # only the three other terms. head_R grad should be identical.
    model_stub = HaomaNet()
    model_stub.load_state_dict(model_full.state_dict())

    # Re-do the forward with the same tensors (model_full has already consumed them
    # but the tensors themselves are fine to reuse for a fresh graph).
    set_seed(0)
    x_t = torch.randn(16, int(PINN_ARCHITECTURE["input_dim"]))
    x_prev = torch.randn(16, int(PINN_ARCHITECTURE["input_dim"]))
    R_t, Q_t, score_t = model_stub(x_t)
    R_prev, Q_prev, _ = model_stub(x_prev)

    import torch.nn.functional as F

    from haoma.config import LOSS_WEIGHTS

    alpha = float(LOSS_WEIGHTS["alpha"])
    lambda2 = float(LOSS_WEIGHTS["lambda2"])

    L_data = F.mse_loss(score_t, inputs["score_target"])
    L_supervision = alpha * (
        F.mse_loss(R_t, inputs["R_sim"]) + F.mse_loss(Q_t, inputs["Q_sim"])
    )
    # No L_pressure_flow here.
    dQ = Q_t - Q_prev
    dR = R_t - R_prev
    dP = inputs["delta_p_t"] - inputs["delta_p_t_prev"]
    expected_dQ = (dP * R_t - inputs["delta_p_t"] * dR) / (R_t * R_prev + 1e-6)
    L_conservation = lambda2 * F.mse_loss(dQ, expected_dQ.detach())

    L_partial = L_data + L_supervision + L_conservation
    L_partial.backward()
    g_partial = model_stub.head_R.weight.grad.detach().clone()

    # The pressure-flow term should have contributed zero gradient to head_R,
    # so the two gradients must match exactly.
    assert torch.allclose(g_full, g_partial, atol=1e-7), (
        f"L_pressure_flow leaked gradient into head_R: max diff = "
        f"{(g_full - g_partial).abs().max().item()}"
    )


# ---------------------------------------------------------------------------
# Backwards-compat: the existing bounded-output assertions still hold.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("batch_size", [1, 4, 32])
def test_forward_respects_physics_bounds(batch_size: int) -> None:
    set_seed(42)
    model = HaomaNet()
    x = torch.randn(batch_size, int(PINN_ARCHITECTURE["input_dim"]))
    R, Q, score = model(x)
    assert torch.all(PHYSICS_RANGES["R"]["min"] <= R)
    assert torch.all(PHYSICS_RANGES["R"]["max"] >= R)
    assert torch.all(PHYSICS_RANGES["Q"]["min"] <= Q)
    assert torch.all(PHYSICS_RANGES["Q"]["max"] >= Q)
    assert torch.all(score >= 0.0) and torch.all(score <= 1.0)


# Trivial reference ensures FEATURE_ORDER is imported by tests (silences ruff).
assert len(FEATURE_ORDER) == 4
