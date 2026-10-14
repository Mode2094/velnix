#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -f functions/package-lock.json ]]; then cd ../..; fi
if [[ -f MANIFEST.sha256 ]]; then sha256sum -c MANIFEST.sha256; fi
if [[ $# -ne 1 ]]; then echo 'Usage: bash start.sh CANDIDATE_GOOGLE_EMAIL' >&2; exit 1; fi
command -v gcloud >/dev/null
command -v node >/dev/null
if [[ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]]; then echo "Use an official human ADC session, without a credential-file override." >&2; exit 1; fi
# Official interactive user ADC when necessary; never requests a private key.
if ! gcloud auth application-default print-access-token >/dev/null 2>&1; then
  gcloud auth application-default login
fi
# Local ADC quota metadata only. Does not enable an API, billing or cloud resource.
gcloud auth application-default set-quota-project velnix-6c1a2 >/dev/null
(cd functions && npm ci --omit=dev --no-audit --no-fund)
node functions/scripts/owner_google_setup.js "$1"
