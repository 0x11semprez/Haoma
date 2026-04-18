"""Demo orchestrator — reads the precomputed JSON and yields frames in order.

Owner: Dev 3. Zero live compute during the jury demo.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

from haoma.schemas import DemoTimestep

PRECOMPUTED_DIR = Path(__file__).resolve().parents[3] / "data" / "precomputed"


def load_scenario(filename: str = "demo_scenario.json") -> list[DemoTimestep]:
    path = PRECOMPUTED_DIR / filename
    with path.open() as f:
        raw = json.load(f)
    return [DemoTimestep.model_validate(frame) for frame in raw]


def replay(filename: str = "demo_scenario.json") -> Iterator[DemoTimestep]:
    yield from load_scenario(filename)
