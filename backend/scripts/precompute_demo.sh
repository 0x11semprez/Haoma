#!/usr/bin/env bash
# Pre-compute the demo scenario: simulate, extract features, run PINN, compute SHAP,
# save everything to data/precomputed/demo_scenario.json.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$BACKEND_DIR"

if [[ ! -d ".venv" ]]; then
    echo "ERROR: .venv not found. Run ./scripts/setup.sh first."
    exit 1
fi

# shellcheck disable=SC1091
source .venv/bin/activate

mkdir -p data/precomputed

python -m haoma.xai.precompute

echo "✓ Pre-computed scenario in data/precomputed/"
