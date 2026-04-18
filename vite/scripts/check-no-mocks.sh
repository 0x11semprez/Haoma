#!/usr/bin/env bash
set -euo pipefail
# Fails if patient-related mock tokens reappear in src/.
# The login stub `stubAuthenticateBadge` is intentionally allowed — do not
# add it to the forbidden list. Backend auth is out of scope for this phase.

cd "$(dirname "$0")/.."

FORBIDDEN='HAOMA_MOCK|VITE_USE_MOCKS|mockFetchWard|mockFetchPatient|mockSubscribeToPatient|mockFetchHealth|mockAuthenticate'

if grep -RE --include='*.ts' --include='*.tsx' "$FORBIDDEN" src/ 2>/dev/null; then
  echo
  echo "✗ Forbidden mock tokens found in src/. See list above." >&2
  exit 1
fi

echo "✓ no patient mocks in src/"
