#!/usr/bin/env bash
# Acceptance spec for spiculedata/social-explorer#374: "Radio service Scaleway GPU
# backend: remote command injection through station names, SSH host key not verified".
#
# The criteria are enforced by the pytest suite under wavepulse/tests/ (stdlib-only
# tests; no torch, requests or loguru needed). The suite exists only on the branch
# that fixes the issue, so on the base branch pytest exits non-zero (collection
# error), which is the spec-first property.
set -uo pipefail
cd "$(dirname "$0")/../.."

pytest_bin=""
if python3 -m pytest --version >/dev/null 2>&1; then
  pytest_cmd=(python3 -m pytest)
else
  # No system pytest: build an isolated venv (CI runners ship python3 without pytest).
  venv="${TMPDIR:-/tmp}/se-acceptance-374-venv"
  if [ ! -x "$venv/bin/pytest" ]; then
    python3 -m venv "$venv" || exit 1
    "$venv/bin/pip" install --quiet pytest || exit 1
  fi
  pytest_cmd=("$venv/bin/pytest")
fi

exec "${pytest_cmd[@]}" -q wavepulse/tests/test_gpu_command.py wavepulse/tests/test_station_names.py
