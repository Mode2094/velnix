#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
flutter pub get --enforce-lockfile
dart format --output=none --set-exit-if-changed lib test
flutter analyze
flutter test --reporter expanded
npm --prefix functions ci
npm --prefix functions run syntax
npm --prefix functions test
npm --prefix functions run test:emulator
