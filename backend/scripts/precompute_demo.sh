#!/usr/bin/env bash
# Pre-compute a demo scenario: simulate, extract features, run PINN, compute SHAP,
# save everything to data/precomputed/<scenario_name>.json.
#
# Usage: ./scripts/precompute_demo.sh <path-to-scenario.json>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$BACKEND_DIR"

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <path-to-scenario.json>"
    echo "Example: $0 src/haoma/demo/scenarios/stable_to_degradation.json"
    exit 1
fi

if [[ ! -d ".venv" ]]; then
    echo "ERROR: .venv not found. Run ./scripts/setup.sh first."
    exit 1
fi

# shellcheck disable=SC1091
source .venv/bin/activate

mkdir -p data/precomputed

python -m haoma.demo.precompute "$1"
