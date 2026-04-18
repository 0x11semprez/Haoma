"""Train the Haoma PINN — saves weights to data/weights/.

Owner: Dev 2. Run via `./scripts/train.sh`. CPU-only, ~5-15 min on i7.
"""

from __future__ import annotations

from pathlib import Path

from haoma.core.seed import DEFAULT_SEED, set_seed

WEIGHTS_DIR = Path(__file__).resolve().parents[3] / "data" / "weights"
WEIGHTS_PATH = WEIGHTS_DIR / "pinn.pt"


def main() -> None:
    set_seed(DEFAULT_SEED)
    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    # TODO Dev 2:
    # - generate N synthetic stays via haoma.simulator
    # - derive features via haoma.features.FeatureEngine
    # - train haoma.model.pinn.HaomaPINN with haoma.model.loss.composite_loss
    # - save torch.state_dict() to WEIGHTS_PATH
    raise NotImplementedError("Training loop — to be implemented by Dev 2")


if __name__ == "__main__":
    main()
