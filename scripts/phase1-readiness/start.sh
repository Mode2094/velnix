#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
[[ "$(git branch --show-current)" == audit/production-readiness ]] || { echo 'Wrong branch; stopped.' >&2; exit 1; }
git diff --quiet && git diff --cached --quiet || { echo 'Review tracked changes before inventory.' >&2; exit 1; }
command -v gcloud >/dev/null
command -v node >/dev/null
[[ "$(node -p 'process.versions.node.split(".")[0]')" == 22 ]] || { echo 'Node.js 22 is required. Select Node 22 in Cloud Shell before running this tool; Node 24 is not supported.' >&2; exit 1; }
printf 'Read-only source: %s\n' "$(git rev-parse HEAD)"
(cd functions && npm ci --omit=dev --no-audit --no-fund)
node functions/scripts/operational_readiness.js
