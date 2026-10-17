#!/usr/bin/env bash
# Stage 3 Part B — fully automated frontend acceptance against the emulator.
#
# Reuses the reviewed emulator preview: the real Velnix UI, the real Cloud
# Functions, the real Firestore rules and the real authorization policy, with a
# synthetic identity provider so that no real Google credential is involved.
# Nothing here can reach production.
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p build/qa/emulator-ui
bash scripts/emulator-preview/start.sh > build/qa/emulator-ui/launcher.log 2>&1 &
preview_pid=$!
trap 'kill "$preview_pid" 2>/dev/null || true; wait "$preview_pid" 2>/dev/null || true' EXIT
trap 'exit 130' INT TERM
python3 - "$preview_pid" <<'PY'
import os, sys, time, urllib.request
for _ in range(240):
    try:
        os.kill(int(sys.argv[1]), 0)
    except ProcessLookupError:
        raise SystemExit('Preview launcher stopped; read build/qa/emulator-ui/launcher.log')
    try:
        with urllib.request.urlopen('http://127.0.0.1:8767', timeout=2) as response:
            if response.status == 200:
                break
    except Exception:
        pass
    time.sleep(1)
else:
    raise SystemExit('Preview startup not verified; inspect launcher/build/emulator logs')
PY
node scripts/emulator-preview/stage3-acceptance.cjs