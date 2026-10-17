#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -f functions/package-lock.json ]]; then cd ../..; fi
if [[ -f MANIFEST.sha256 ]]; then sha256sum -c MANIFEST.sha256; fi
if [[ $# -gt 2 || ( $# -eq 2 && "$2" != "--approve-bootstrap" ) ]]; then echo 'Usage: bash start.sh [CANDIDATE_GOOGLE_EMAIL] [--approve-bootstrap]' >&2; exit 1; fi
if [[ -d .git ]]; then
  if [[ "$(git branch --show-current)" != 'audit/production-readiness' ]]; then echo 'Refusing to run outside audit/production-readiness.' >&2; exit 1; fi
  if ! git diff --quiet || ! git diff --cached --quiet; then echo 'Tracked changes detected; review them before owner setup.' >&2; exit 1; fi
  echo "Reviewed source: $(git rev-parse HEAD)"
  echo "CI: https://github.com/Mode2094/velnix/commit/$(git rev-parse HEAD)/checks"
fi
candidate_email="${1:-}"
if [[ -z "$candidate_email" ]]; then
  read -r -p 'بريد Google المرشح الذي اعتمده المالك: ' candidate_email
fi
if [[ -z "$candidate_email" ]]; then echo 'Candidate identity is required; no automatic account selection.' >&2; exit 1; fi
command -v gcloud >/dev/null
command -v node >/dev/null
# Reuse the existing human gcloud session. No ADC login, token files or quota-file edits.
(cd functions && npm ci --omit=dev --no-audit --no-fund)
node functions/scripts/owner_google_setup.js "$candidate_email" "${2:-}"
