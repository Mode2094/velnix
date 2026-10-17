#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
flutter pub get --enforce-lockfile
dart format --output=none --set-exit-if-changed lib test
python3 scripts/check_secrets.py
python3 scripts/test_runtime_config.py
python3 scripts/test_firebase_setup.py
flutter analyze
flutter test --reporter expanded
"${VELNIX_QA_PYTHON:-python3}" scripts/verify_barcodes.py
npm --prefix functions ci
npm --prefix functions run syntax
npm --prefix functions audit --omit=dev --audit-level=high
npm --prefix functions test
npm --prefix functions run test:emulator
