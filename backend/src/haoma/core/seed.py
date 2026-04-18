"""Deterministic seeding — call set_seed() at the start of any stochastic pipeline.

Without this, "fixed seed" is wishful thinking. The demo MUST replay identically every
time the jury sees it.
"""

from __future__ import annotations

import os
import random

import numpy as np

DEFAULT_SEED = 42


def set_seed(seed: int = DEFAULT_SEED) -> None:
    """Seed Python, NumPy, and PyTorch RNGs in one call.

    Also sets PYTHONHASHSEED for child-process determinism.
    """
    os.environ["PYTHONHASHSEED"] = str(seed)
    random.seed(seed)
    np.random.seed(seed)

    try:
        import torch

        torch.manual_seed(seed)
        # PINN physics loss uses some non-deterministic CUDA ops; we stay on CPU,
        # but leave deterministic_algorithms off to keep training fast.
    except ImportError:
        pass
