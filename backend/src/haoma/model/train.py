"""HAOMA — train the PINN end-to-end.

Pipeline:
    1. generate N synthetic stays with the simulator
    2. compute features (30-min warmup seeds the rolling window)
    3. fit z-score stats on the full training set
    4. build (t, t-1) tensor pairs for the conservation-loss forward
    5. train HaomaNet with the composite physics + data loss
    6. save weights, z-score stats, and the SHAP background

Usage: ``python -m haoma.model.train``
Owner: Dev 2. CPU-only, no scheduler, no early stopping.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch.utils.data import DataLoader, TensorDataset

from haoma.config import TRAINING
from haoma.core.seed import DEFAULT_SEED, set_seed
from haoma.features.engine import FeatureEngine, FeatureNormalizer
from haoma.model.loss import haoma_loss
from haoma.model.pinn import HaomaNet
from haoma.simulator.scenarios import generate_training_dataset

WEIGHTS_DIR = Path(__file__).resolve().parents[3] / "data" / "weights"
WEIGHTS_PATH = WEIGHTS_DIR / "haoma_pinn.pt"
ZSCORE_PATH = WEIGHTS_DIR / "zscore_stats.json"
SHAP_BG_PATH = WEIGHTS_DIR / "shap_background.npy"


def build_training_rows(stays: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Expand each stay into (t, t-1) rows with features, aux BP, and labels.

    ``delta_p_ref`` is the patient's baseline pulse pressure — we divide the
    raw ΔP by this reference so the physics constraint Q ≈ ΔP/R is posed in
    the same normalized units the simulator uses for Q_sim.
    """
    rows: list[dict[str, Any]] = []
    for stay in stays:
        fe = FeatureEngine()
        fe.warmup(stay["warmup_states"])
        features_list = fe.compute_batch(stay["states"])

        cfg = stay["config"]
        delta_p_ref = max(cfg.baseline_bp_sys - cfg.baseline_bp_dia, 1e-6)
        states = stay["states"]
        for i in range(1, len(states)):
            rows.append(
                {
                    "features_t": features_list[i],
                    "features_prev": features_list[i - 1],
                    "bp_sys_t": states[i].bp_sys,
                    "bp_dia_t": states[i].bp_dia,
                    "bp_sys_prev": states[i - 1].bp_sys,
                    "bp_dia_prev": states[i - 1].bp_dia,
                    "delta_p_ref": delta_p_ref,
                    "score_target": states[i].haoma_target,
                    "R_sim": states[i].r_sim,
                    "Q_sim": states[i].q_sim,
                }
            )
    return rows


def rows_to_tensors(
    rows: list[dict[str, Any]], normalizer: FeatureNormalizer
) -> tuple[torch.Tensor, ...]:
    feat_t = torch.tensor(
        [normalizer.transform(r["features_t"]) for r in rows], dtype=torch.float32
    )
    feat_prev = torch.tensor(
        [normalizer.transform(r["features_prev"]) for r in rows], dtype=torch.float32
    )
    # Normalize ΔP by the patient's baseline pulse pressure so Q_expected =
    # ΔP/R lands in the same range as Q_sim (which the simulator already
    # normalizes the same way). Without this, Q saturates at its upper bound.
    delta_p_t = torch.tensor(
        [[(r["bp_sys_t"] - r["bp_dia_t"]) / r["delta_p_ref"]] for r in rows],
        dtype=torch.float32,
    )
    delta_p_prev = torch.tensor(
        [[(r["bp_sys_prev"] - r["bp_dia_prev"]) / r["delta_p_ref"]] for r in rows],
        dtype=torch.float32,
    )
    score_target = torch.tensor(
        [[r["score_target"]] for r in rows], dtype=torch.float32
    )
    R_sim = torch.tensor([[r["R_sim"]] for r in rows], dtype=torch.float32)
    Q_sim = torch.tensor([[r["Q_sim"]] for r in rows], dtype=torch.float32)
    return feat_t, feat_prev, delta_p_t, delta_p_prev, score_target, R_sim, Q_sim


def train(
    n_stays: int | None = None,
    epochs: int | None = None,
    batch_size: int | None = None,
    learning_rate: float | None = None,
    seed: int = DEFAULT_SEED,
    weights_dir: Path = WEIGHTS_DIR,
) -> dict[str, float]:
    """Run the full training pipeline. Returns the final-epoch metrics."""
    set_seed(seed)
    weights_dir.mkdir(parents=True, exist_ok=True)

    n_stays = n_stays if n_stays is not None else int(TRAINING["n_stays"])
    epochs = epochs if epochs is not None else int(TRAINING["epochs"])
    batch_size = batch_size if batch_size is not None else int(TRAINING["batch_size"])
    learning_rate = (
        learning_rate if learning_rate is not None else float(TRAINING["learning_rate"])
    )

    print(f"[1/6] Generating {n_stays} synthetic stays...")
    stays = generate_training_dataset(n_stays=n_stays, master_seed=seed)

    print("[2/6] Computing features...")
    rows = build_training_rows(stays)
    print(f"      {len(rows)} (t, t-1) training pairs")

    print("[3/6] Fitting z-score normalizer...")
    normalizer = FeatureNormalizer()
    normalizer.fit([r["features_t"] for r in rows])
    normalizer.save(str(weights_dir / "zscore_stats.json"))

    print("[4/6] Building tensors...")
    feat_t, feat_prev, dp_t, dp_prev, score_target, R_sim, Q_sim = rows_to_tensors(
        rows, normalizer
    )
    dataset = TensorDataset(feat_t, feat_prev, dp_t, dp_prev, score_target, R_sim, Q_sim)
    loader = DataLoader(dataset, batch_size=batch_size, shuffle=True)

    print(f"[5/6] Training {epochs} epochs (lr={learning_rate}, batch={batch_size})...")
    model = HaomaNet()
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)

    last_metrics: dict[str, float] = {}
    for epoch in range(epochs):
        epoch_metrics: dict[str, float] = {}
        for batch in loader:
            f_t, f_prev, b_dp_t, b_dp_prev, b_score, b_R, b_Q = batch
            R_t, Q_t, score_t = model(f_t)
            R_prev, Q_prev, _ = model(f_prev)
            loss, metrics = haoma_loss(
                R_t=R_t,
                Q_t=Q_t,
                score_t=score_t,
                R_t_prev=R_prev,
                Q_t_prev=Q_prev,
                score_target=b_score,
                R_sim=b_R,
                Q_sim=b_Q,
                delta_p_t=b_dp_t,
                delta_p_t_prev=b_dp_prev,
            )
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            epoch_metrics = metrics

        last_metrics = epoch_metrics
        if epoch % 10 == 0 or epoch == epochs - 1:
            print(
                f"  epoch {epoch:3d} | "
                f"total={epoch_metrics['loss_total']:.4f} "
                f"data={epoch_metrics['loss_data']:.4f} "
                f"sup={epoch_metrics['loss_supervision']:.4f} "
                f"phys={epoch_metrics['loss_pressure_flow']:.4f} "
                f"cons={epoch_metrics['loss_conservation']:.4f}"
            )

    print("[6/6] Saving artifacts...")
    torch.save(model.state_dict(), weights_dir / "haoma_pinn.pt")

    # SHAP background — 100 stable samples (score_target below the green threshold).
    n_bg = int(TRAINING["shap_background_n"])
    stable_idx = [i for i, r in enumerate(rows) if r["score_target"] < 0.15]
    if len(stable_idx) < n_bg:
        # Fall back to the most-stable samples if we don't have enough.
        targets = np.array([r["score_target"] for r in rows])
        stable_idx = list(np.argsort(targets)[:n_bg])
    bg_idx = stable_idx[:n_bg]
    background = feat_t[bg_idx].numpy()
    np.save(weights_dir / "shap_background.npy", background)

    print(f"  ✓ weights       → {weights_dir / 'haoma_pinn.pt'}")
    print(f"  ✓ z-score stats → {weights_dir / 'zscore_stats.json'}")
    print(f"  ✓ SHAP bg       → {weights_dir / 'shap_background.npy'} ({len(bg_idx)} samples)")

    return last_metrics


def main() -> None:
    train()


if __name__ == "__main__":
    main()
