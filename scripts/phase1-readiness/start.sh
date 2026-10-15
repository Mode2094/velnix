#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
[[ "$(git branch --show-current)" == audit/production-readiness ]] || { echo 'Wrong branch; stopped.' >&2; exit 1; }
git diff --quiet && git diff --cached --quiet || { echo 'Review tracked changes before inventory.' >&2; exit 1; }
command -v gcloud >/dev/null
command -v node >/dev/null
printf 'Read-only source: %s\n' "$(git rev-parse HEAD)"
(cd functions && npm ci --omit=dev --no-audit --no-fund)
node functions/scripts/operational_readiness.js
