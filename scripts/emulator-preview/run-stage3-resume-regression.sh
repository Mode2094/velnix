#!/usr/bin/env bash
# Local regression for the resume-only Stage 3 flow (never creates in production).
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p build/qa/emulator-resume
bash scripts/emulator-preview/start.sh > build/qa/emulator-resume/launcher.log 2>&1 &
preview_pid=$!
trap 'kill "$preview_pid" 2>/dev/null || true; wait "$preview_pid" 2>/dev/null || true' EXIT
trap 'exit 130' INT TERM
python3 - "$preview_pid" <<'PY'
import os, sys, time, urllib.request
for _ in range(240):
    try:
        os.kill(int(sys.argv[1]), 0)
    except ProcessLookupError:
        raise SystemExit('Preview launcher stopped; read build/qa/emulator-resume/launcher.log')
    try:
        with urllib.request.urlopen('http://127.0.0.1:8767', timeout=2) as r:
            if r.status == 200:
                break
    except Exception:
        pass
    time.sleep(1)
else:
    raise SystemExit('Preview startup not verified')
PY
node scripts/emulator-preview/stage3-resume-regression.cjs
