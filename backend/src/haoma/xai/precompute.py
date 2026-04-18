"""Pre-compute the full demo scenario: vitals → features → PINN → SHAP → JSON.

Owner: Dev 2. Saves to backend/data/precomputed/demo_scenario.json.
During the demo the API reads this file; it does not compute anything live.
"""

from __future__ import annotations

from pathlib import Path

from haoma.core.seed import DEFAULT_SEED, set_seed

PRECOMPUTED_DIR = Path(__file__).resolve().parents[3] / "data" / "precomputed"
OUTPUT_PATH = PRECOMPUTED_DIR / "demo_scenario.json"


def main() -> None:
    set_seed(DEFAULT_SEED)
    PRECOMPUTED_DIR.mkdir(parents=True, exist_ok=True)
    # TODO Dev 2:
    # - run haoma.simulator on the demo scenario
    # - compute features via haoma.features.FeatureEngine
    # - run haoma.model.inference.predict at every timestep
    # - run shap.DeepExplainer on the Haoma Index head
    # - serialize as list[DemoTimestep] to OUTPUT_PATH
    raise NotImplementedError("SHAP precompute — to be implemented by Dev 2")


if __name__ == "__main__":
    main()
