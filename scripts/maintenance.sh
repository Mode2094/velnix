#!/usr/bin/env bash
# Velnix website maintenance switch (Firebase Hosting only).
#
#   scripts/maintenance.sh on      -> serve the temporary Arabic maintenance page
#   scripts/maintenance.sh off     -> re-publish the last approved production build
#   scripts/maintenance.sh status  -> report what the live site is serving
#
# Safety rules baked in:
#   * Only "hosting" is ever deployed (--only hosting). Functions, Firestore,
#     Auth, rules and App Check are never touched.
#   * No permanent redirects: the page is served with a rewrite (URL unchanged)
#     and with no-cache headers, never a 301.
#   * "off" re-deploys the real production build (build/web) with the original
#     config firebase.hosting.json; it does not just delete the maintenance page.
#   * A durable snapshot of the approved production build is taken on "on" so
#     "off" can still restore even if build/ was cleaned.
#   * --channel NAME deploys to a throwaway preview channel (used to test the
#     restore without disturbing the public site); Auth domains are left alone.
set -euo pipefail

PROJECT="velnix-6c1a2"
SITE="velnix-6c1a2"
LIVE_URL="https://${SITE}.web.app"
BRAND_TITLE="نعمل حاليًا على تحسين تجربتكم"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export PATH="$HOME/.nvm/versions/node/v22.23.4/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

MAINT_PUBLIC="build/hosting-maintenance"
PROD_PUBLIC="build/web"
MAINT_CONFIG="firebase.hosting.maintenance.json"
LIVE_CONFIG="firebase.hosting.json"
SERVICE_DIR="hosting/service"

CHANNEL=""
ACTION="${1:-}"
shift || true
while [ $# -gt 0 ]; do
  case "$1" in
    --channel) CHANNEL="${2:-}"; shift 2 ;;
    --channel=*) CHANNEL="${1#*=}"; shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done
# Accept the "maintenance:on" / "maintenance:off" spelling too.
ACTION="${ACTION#maintenance:}"

say() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# copy_first DEST src1 src2 ...   (first existing source wins; missing = error)
copy_first() {
  local dest="$1"; shift
  for src in "$@"; do
    if [ -f "$src" ]; then
      mkdir -p "$(dirname "$dest")"
      cp -f "$src" "$dest"
      return 0
    fi
  done
  die "none of these sources exist for $dest: $*"
}

prod_version() {
  python3 - <<'PY' 2>/dev/null || echo "unknown"
import json
try:
    print(json.load(open("build/web/version.json")).get("version", "unknown"))
except Exception:
    print("unknown")
PY
}

stage_maintenance() {
  [ -f "hosting/maintenance/index.html" ] || die "missing hosting/maintenance/index.html"
  [ -f "$SERVICE_DIR/.well-known/assetlinks.json" ] || die "missing $SERVICE_DIR/.well-known/assetlinks.json"

  rm -rf "$MAINT_PUBLIC"
  mkdir -p "$MAINT_PUBLIC/.well-known" "$MAINT_PUBLIC/icons"

  # The maintenance page itself.
  cp -f "hosting/maintenance/index.html" "$MAINT_PUBLIC/index.html"
  cp -f "hosting/maintenance/flutter_service_worker.js" "$MAINT_PUBLIC/flutter_service_worker.js"

  # Service files that other apps/services rely on, kept byte-for-byte so nothing
  # breaks (Android App Links, web push worker, robots, manifest, icons, favicon).
  cp -f "$SERVICE_DIR/.well-known/assetlinks.json" "$MAINT_PUBLIC/.well-known/assetlinks.json"
  copy_first "$MAINT_PUBLIC/firebase-messaging-sw.js" "build/web/firebase-messaging-sw.js" "web/firebase-messaging-sw.js"
  copy_first "$MAINT_PUBLIC/manifest.json" "web/manifest.json" "build/web/manifest.json"
  copy_first "$MAINT_PUBLIC/robots.txt" "web/robots.txt" "build/web/robots.txt"
  copy_first "$MAINT_PUBLIC/llms.txt" "web/llms.txt" "build/web/llms.txt"
  copy_first "$MAINT_PUBLIC/favicon.png" "web/favicon.png" "build/web/favicon.png"
  for icon in $(ls web/icons 2>/dev/null || ls build/web/icons 2>/dev/null); do
    copy_first "$MAINT_PUBLIC/icons/$icon" "web/icons/$icon" "build/web/icons/$icon"
  done

  # Never ship the Flutter app shell in the maintenance payload.
  rm -rf "$MAINT_PUBLIC/main.dart.js" "$MAINT_PUBLIC/assets" "$MAINT_PUBLIC/canvaskit" \
         "$MAINT_PUBLIC/flutter_bootstrap.js" "$MAINT_PUBLIC/flutter.js"

  grep -q "$BRAND_TITLE" "$MAINT_PUBLIC/index.html" || die "maintenance page is missing the required title"
  say "staged maintenance payload -> $MAINT_PUBLIC ($(find "$MAINT_PUBLIC" -type f | wc -l | tr -d ' ') files)"
}

snapshot_production() {
  local version snapshot
  version="$(prod_version)"
  snapshot="release/hosting-production-${version}"
  [ -f "$PROD_PUBLIC/main.dart.js" ] || return 0
  if [ -f "$snapshot/main.dart.js" ]; then
    say "production snapshot already present -> $snapshot"
    return 0
  fi
  mkdir -p "$snapshot"
  cp -R "$PROD_PUBLIC/." "$snapshot/"
  cp -f "$SERVICE_DIR/.well-known/assetlinks.json" "$snapshot/.well-known/assetlinks.json" 2>/dev/null || true
  {
    echo "Velnix production hosting snapshot"
    echo "version: $version"
    echo "captured_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "main.dart.js sha256: $(shasum -a 256 "$PROD_PUBLIC/main.dart.js" | awk '{print $1}')"
  } > "$snapshot/SNAPSHOT.txt"
  say "captured production snapshot -> $snapshot"
}

prepare_live() {
  if [ ! -f "$PROD_PUBLIC/main.dart.js" ]; then
    local snapshot
    snapshot="$(ls -d release/hosting-production-* 2>/dev/null | sort -V | tail -1 || true)"
    [ -n "$snapshot" ] || die "no production build at $PROD_PUBLIC/main.dart.js and no snapshot in release/ to restore from"
    say "build/web is missing; restoring from snapshot $snapshot"
    mkdir -p "$PROD_PUBLIC"
    cp -R "$snapshot/." "$PROD_PUBLIC/"
    rm -f "$PROD_PUBLIC/SNAPSHOT.txt"
  fi
  # Restore the App Links service file that a plain flutter rebuild wipes, so a
  # restore never silently breaks the Android app links.
  mkdir -p "$PROD_PUBLIC/.well-known"
  cp -f "$SERVICE_DIR/.well-known/assetlinks.json" "$PROD_PUBLIC/.well-known/assetlinks.json"
  say "production build ready ($PROD_PUBLIC, version $(prod_version))"
}

deploy_config() {
  local config="$1"
  if [ "${DRY_RUN:-}" = "1" ]; then
    say "[dry-run] would deploy $config (live untouched)"
    return 0
  fi
  if [ -n "$CHANNEL" ]; then
    say "deploying $config to preview channel '$CHANNEL' (live untouched)"
    firebase hosting:channel:deploy "$CHANNEL" --project "$PROJECT" --config "$config" \
      --expires 1h --no-authorized-domains
  else
    say "deploying $config to LIVE ($SITE)"
    firebase deploy --project "$PROJECT" --only hosting --config "$config"
  fi
}

verify_maintenance() {
  local base="$1" ok=0
  say "--- verifying maintenance page at $base"
  if curl -fsS "$base/" | grep -q "$BRAND_TITLE"; then say "  ok  homepage shows the maintenance title"; else say "  FAIL homepage"; ok=1; fi
  if curl -fsS "$base/orders" | grep -q "$BRAND_TITLE"; then say "  ok  internal link /orders shows the maintenance page"; else say "  FAIL /orders"; ok=1; fi
  local ct; ct="$(curl -fsS -o /dev/null -w '%{content_type}' "$base/main.dart.js" || true)"
  if printf '%s' "$ct" | grep -qi 'text/html'; then say "  ok  main.dart.js is not served as JavaScript ($ct)"; else say "  FAIL main.dart.js reachable ($ct)"; ok=1; fi
  ct="$(curl -fsS -o /dev/null -w '%{content_type}' "$base/.well-known/assetlinks.json" || true)"
  if printf '%s' "$ct" | grep -qi 'application/json'; then say "  ok  Android App Links assetlinks.json intact"; else say "  FAIL assetlinks ($ct)"; ok=1; fi
  if curl -fsS "$base/firebase-messaging-sw.js" | grep -q 'firebase.messaging'; then say "  ok  web push worker intact"; else say "  FAIL push worker"; ok=1; fi
  [ "$ok" = 0 ] && say "maintenance verification: PASS" || { say "maintenance verification: FAIL"; return 1; }
}

verify_live_build() {
  local base="$1" ok=0
  say "--- verifying production build at $base"
  if curl -fsS "$base/" | grep -q 'flutter_bootstrap.js'; then say "  ok  homepage is the Flutter app"; else say "  FAIL homepage"; ok=1; fi
  local ct; ct="$(curl -fsS -o /dev/null -w '%{content_type} %{size_download}' "$base/main.dart.js" || true)"
  if printf '%s' "$ct" | grep -qi 'javascript'; then say "  ok  main.dart.js served as JavaScript ($ct)"; else say "  FAIL main.dart.js ($ct)"; ok=1; fi
  ct="$(curl -fsS -o /dev/null -w '%{content_type}' "$base/.well-known/assetlinks.json" || true)"
  if printf '%s' "$ct" | grep -qi 'application/json'; then say "  ok  Android App Links assetlinks.json intact"; else say "  FAIL assetlinks ($ct)"; ok=1; fi
  [ "$ok" = 0 ] && say "production verification: PASS" || { say "production verification: FAIL"; return 1; }
}

case "$ACTION" in
  on)
    stage_maintenance
    snapshot_production
    OUT="$(deploy_config "$MAINT_CONFIG" 2>&1)"; printf '%s\n' "$OUT"
    URL="$LIVE_URL"
    [ -n "$CHANNEL" ] && URL="$(printf '%s' "$OUT" | grep -oE 'https://[A-Za-z0-9._-]+\.web\.app' | tail -1)"
    if [ "${DRY_RUN:-}" != "1" ] && [ -n "$URL" ]; then verify_maintenance "$URL"; fi
    say "MAINTENANCE ON."
    ;;
  off)
    prepare_live
    OUT="$(deploy_config "$LIVE_CONFIG" 2>&1)"; printf '%s\n' "$OUT"
    URL="$LIVE_URL"
    [ -n "$CHANNEL" ] && URL="$(printf '%s' "$OUT" | grep -oE 'https://[A-Za-z0-9._-]+\.web\.app' | tail -1)"
    if [ "${DRY_RUN:-}" != "1" ] && [ -n "$URL" ]; then verify_live_build "$URL"; fi
    say "MAINTENANCE OFF."
    ;;
  status)
    BODY="$(curl -fsS "$LIVE_URL/" || true)"
    if printf '%s' "$BODY" | grep -q "$BRAND_TITLE"; then
      say "LIVE: maintenance page is ON"
    elif printf '%s' "$BODY" | grep -q 'flutter_bootstrap.js'; then
      say "LIVE: production app is being served (maintenance OFF)"
    else
      say "LIVE: unrecognised response"
    fi
    ;;
  *)
    sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
