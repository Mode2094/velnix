#!/usr/bin/env bash
# Dedicated, isolated Chrome for Velnix production acceptance.
#
# Hard boundaries enforced here:
#   * It NEVER touches the owner's personal Chrome profile. The profile path is
#     asserted to be outside it, and it is created empty.
#   * Remote debugging is bound to 127.0.0.1 only and is verified after launch.
#     It is never exposed on a routable interface.
#   * No cookie, token or profile data is read from or copied into any other
#     browser. The only way a session enters this profile is the owner typing
#     their own credentials into Google's own sign-in window, by hand.
#   * The port and PID are owned by this script so shutdown is deterministic and
#     can never stray onto an unrelated process.
set -euo pipefail

VELNIX_HOME="${VELNIX_HOME:-$HOME/.velnix}"
PROFILE_DIR="$VELNIX_HOME/automation/chrome-profile"
PID_FILE="$VELNIX_HOME/automation/chrome.pid"
LOG_FILE="$VELNIX_HOME/automation/chrome.log"
DEBUG_PORT="${VELNIX_DEBUG_PORT:-9333}"
DEBUG_HOST="127.0.0.1"
OWNER_PROFILE="$HOME/Library/Application Support/Google/Chrome"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

die() { echo "  REFUSED: $*" >&2; exit 1; }

assert_isolated() {
  # The dedicated profile must not be, or live inside, the personal profile.
  local owner_real profile_real
  owner_real="$(cd "$OWNER_PROFILE" 2>/dev/null && pwd -P || echo "absent")"
  profile_real="$(cd "$PROFILE_DIR" 2>/dev/null && pwd -P || echo "$PROFILE_DIR")"
  case "$profile_real" in
    "$owner_real"/*|"$owner_real") die "profile path is inside the owner's personal Chrome profile" ;;
  esac
  [ "$profile_real" != "$owner_real" ] || die "profile path is the owner's personal Chrome profile"
  echo "  profile   : $profile_real"
  echo "  isolated  : yes (owner profile at $owner_real is untouched)"
}

port_owner() { lsof -nP -iTCP:"$DEBUG_PORT" -sTCP:LISTEN -t 2>/dev/null || true; }

cmd_start() {
  [ -x "$CHROME" ] || die "Google Chrome is not installed at $CHROME"
  assert_isolated

  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "  already running as pid $(cat "$PID_FILE")"; exit 0
  fi

  local busy; busy="$(port_owner)"
  if [ -n "$busy" ]; then
    die "port $DEBUG_PORT is already held by pid $busy; this script will not touch it"
  fi

  mkdir -p "$PROFILE_DIR"
  echo "  port      : $DEBUG_HOST:$DEBUG_PORT"

  # --remote-debugging-address pins the listener to loopback.
  "$CHROME" \
    --user-data-dir="$PROFILE_DIR" \
    --remote-debugging-address="$DEBUG_HOST" \
    --remote-debugging-port="$DEBUG_PORT" \
    --no-first-run \
    --no-default-browser-check \
    --disable-background-networking \
    --disable-sync \
    --disable-features=Translate \
    "https://velnix-6c1a2.web.app" \
    >"$LOG_FILE" 2>&1 &

  local pid=$!
  echo "$pid" > "$PID_FILE"

  local i
  for i in $(seq 1 60); do
    if curl -sf --max-time 2 "http://$DEBUG_HOST:$DEBUG_PORT/json/version" >/dev/null 2>&1; then
      echo "  launched  : pid $pid"
      break
    fi
    kill -0 "$pid" 2>/dev/null || die "Chrome exited during launch; see $LOG_FILE"
    sleep 1
  done

  # Verify the listener really is loopback-only before anything connects.
  # lsof prints the bound address in its final column, so match on that.
  local listeners nonloopback
  listeners="$(lsof -nP -iTCP:"$DEBUG_PORT" -sTCP:LISTEN 2>/dev/null | tail -n +2 || true)"
  [ -n "$listeners" ] || die "no CDP listener on $DEBUG_PORT"
  # lsof appends "(LISTEN)" after the address, so select the column that holds
  # the socket rather than trusting $NF.
  nonloopback="$(echo "$listeners" | awk -v p="$DEBUG_PORT" '
    { for (i = 1; i <= NF; i++) if ($i ~ (":" p "$")) { if ($i != "127.0.0.1:" p) print $i; found = 1 } }
    END { if (!found) print "(no socket column found)" }')"
  if [ -n "$nonloopback" ]; then
    die "CDP listener bound to a non-loopback address ($nonloopback); refusing to continue"
  fi
  echo "  bind      : 127.0.0.1 only (verified)"
  echo "$listeners" | sed 's/^/    /'
}

cmd_stop() {
  [ -f "$PID_FILE" ] || { echo "  not running"; return 0; }
  local pid; pid="$(cat "$PID_FILE")"
  if kill -0 "$pid" 2>/dev/null; then
    # Terminate only this dedicated pid. Never signal a process group: the
    # child is not a group leader and "-" would target this script's own group.
    kill -TERM "$pid" 2>/dev/null || true
    local i
    for i in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
    kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null || true
    echo "  stopped   : pid $pid"
  else
    echo "  stale pid file for $pid"
  fi
  rm -f "$PID_FILE"
  sleep 1
  if [ -z "$(port_owner)" ]; then echo "  port $DEBUG_PORT released"; else echo "  WARNING: port $DEBUG_PORT still held"; fi
}

cmd_status() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "  running   : pid $(cat "$PID_FILE")"
  else
    echo "  running   : no"
  fi
  echo "  listener  :"
  lsof -nP -iTCP:"$DEBUG_PORT" -sTCP:LISTEN 2>/dev/null | sed 's/^/    /' || echo "    none"
  echo "  profile   : $PROFILE_DIR"
  [ -d "$PROFILE_DIR/Default" ] && echo "  state     : profile has been used" || echo "  state     : profile is empty (never signed in)"
}

case "${1:-status}" in
  start) cmd_start ;;
  stop) cmd_stop ;;
  restart) cmd_stop; cmd_start ;;
  status) cmd_status ;;
  *) die "usage: $0 {start|stop|restart|status}" ;;
esac