#!/usr/bin/env bash
# Train the Haoma PINN model.
# Prereq: ./scripts/setup.sh has been run and .venv exists.

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

mkdir -p data/weights

python -m haoma.model.train "$@"
