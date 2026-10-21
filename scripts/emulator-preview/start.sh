#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
export VELNIX_PREVIEW_ROOT="$PWD"
if [[ -f /workspace/.velnix-tools/flutter/bin/flutter ]]; then source scripts/cloud-env.sh; fi
export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:-} -Xmx1536m -XX:ActiveProcessorCount=2"
[[ "$(node -p 'process.versions.node.split(".")[0]')" == 22 ]]
if [[ "${GITHUB_ACTIONS:-}" != true ]]; then [[ "$(git branch --show-current)" == audit/production-readiness ]]; fi
# Explicitly refuse inherited real Admin SDK credentials; these services need none.
unset GOOGLE_APPLICATION_CREDENTIALS GOOGLE_CLOUD_PROJECT GCLOUD_PROJECT FIREBASE_CONFIG
export METADATA_SERVER_DETECTION=none
export GCLOUD_PROJECT=demo-velnix-preview GOOGLE_CLOUD_PROJECT=demo-velnix-preview
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
python3 - <<'PY'
import socket
for p in [8080,9099,5001,4000,4400,4500,8767,9150,9299,9499]:
 s=socket.socket()
 try:
  s.settimeout(0.3)
  if s.connect_ex(('127.0.0.1',p))==0:raise SystemExit(f'Port {p} occupied. Stop only your previous local preview; no process was killed.')
 finally:s.close()
PY
mkdir -p .dart_tool/local_preview build/qa/emulator-ui
cp "$VELNIX_PREVIEW_ROOT"/scripts/emulator-preview/main.dart .dart_tool/local_preview/main.dart
python3 - <<'PY'
import json
from pathlib import Path
r=Path.cwd(); c=json.loads((r/'firebase.json').read_text())
c['functions'][0]['source']='functions'
c['firestore']['rules']='firestore.rules';c['firestore']['indexes']='firestore.indexes.json'
for name in ['auth','functions','firestore','ui']:c['emulators'][name]['host']='127.0.0.1'
c['emulators']['hub']={'host':'127.0.0.1','port':4400};c['emulators']['logging']={'host':'127.0.0.1','port':4500}
(r/'.firebase-local-preview.lock').write_text(json.dumps(c))
PY
fingerprint=$(python3 - <<'PY2'
import hashlib
from pathlib import Path
h=hashlib.sha256()
for p in sorted(Path('lib').rglob('*.dart'))+[Path('pubspec.lock'),Path('pubspec.yaml'),Path('.dart_tool/local_preview/main.dart')]:h.update(p.read_bytes())
print(h.hexdigest())
PY2
)
if [[ ! -f build/qa/emulator-ui/web/main.dart.js || ! -f build/qa/emulator-ui/fingerprint || "$(cat build/qa/emulator-ui/fingerprint)" != "$fingerprint" ]]; then
 flutter build web --target .dart_tool/local_preview/main.dart --output build/qa/emulator-ui/web --no-web-resources-cdn --no-wasm-dry-run --dart-define=VELNIX_GOOGLE_ENABLED=true --dart-define=VELNIX_TEST_GOOGLE_ENABLED=true > build/qa/emulator-ui/build.log 2>&1
 printf '%s' "$fingerprint" > build/qa/emulator-ui/fingerprint
fi
env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy functions/node_modules/.bin/firebase emulators:start --project demo-velnix-preview --config .firebase-local-preview.lock --only auth,firestore,functions > build/qa/emulator-ui/emulators.log 2>&1 &
emulator_pid=$!
http_pid=''
trap '[[ -z "$http_pid" ]] || kill "$http_pid" 2>/dev/null || true; kill "$emulator_pid" 2>/dev/null || true; wait || true' EXIT
trap 'exit 130' INT TERM
python3 - "$emulator_pid" <<'PY'
import urllib.request,time,os,sys
for attempt in range(120):
 try:os.kill(int(sys.argv[1]),0)
 except ProcessLookupError:raise SystemExit('Emulator process stopped; inspect build/qa/emulator-ui/emulators.log')
 try:
  with urllib.request.urlopen('http://127.0.0.1:4400/emulators',timeout=2) as r:
   import json
   d=json.load(r)
   if all(k in d for k in ['auth','firestore','functions']):
    from pathlib import Path
    if 'All emulators ready' in Path('build/qa/emulator-ui/emulators.log').read_text():break
 except Exception:pass
 time.sleep(1)
else:raise SystemExit('Emulators failed to become ready; inspect build/qa/emulator-ui/emulators.log')
PY
node "$VELNIX_PREVIEW_ROOT"/scripts/emulator-preview/seed.cjs
python3 "$VELNIX_PREVIEW_ROOT"/scripts/emulator-preview/serve.py > build/qa/emulator-ui/http.log 2>&1 &
http_pid=$!
echo 'Local preview ready on port 8767. Auth 9099, Firestore 8080, Functions 5001. Choose a synthetic role@velnix.test in the emulator Google popup. Ctrl+C stops services.'
wait "$emulator_pid"
