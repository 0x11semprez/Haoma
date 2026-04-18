#!/usr/bin/env bash
# Haoma backend setup — creates a .venv and installs all dependencies.
# Idempotent: safe to run multiple times.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$BACKEND_DIR"

# Detect a compatible Python (3.11 or 3.12 — PyTorch does not yet support 3.13 on all platforms)
PYTHON_BIN=""
for candidate in python3.12 python3.11 python3; do
    if command -v "$candidate" >/dev/null 2>&1; then
        version=$("$candidate" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
        if [[ "$version" == "3.11" || "$version" == "3.12" ]]; then
            PYTHON_BIN="$candidate"
            break
        fi
    fi
done

if [[ -z "$PYTHON_BIN" ]]; then
    echo "ERROR: Python 3.11 or 3.12 is required."
    echo "Ubuntu/WSL:  sudo apt install python3.11 python3.11-venv"
    echo "macOS:       brew install python@3.11"
    exit 1
fi

echo "Using: $PYTHON_BIN ($("$PYTHON_BIN" --version))"

if [[ ! -d ".venv" ]]; then
    "$PYTHON_BIN" -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate
pip install --upgrade pip wheel

# Install the CPU-only PyTorch wheel (~180 MB) before the rest, to avoid pulling
# the default CUDA-enabled wheel (~2.5 GB) since the project runs on CPU only.
pip install torch --index-url https://download.pytorch.org/whl/cpu

pip install -e ".[dev]"

echo ""
echo "Setup complete."
echo "Activate the environment with:"
echo "    source backend/.venv/bin/activate"
echo ""
echo "Smoke test:"
echo "    pytest"
