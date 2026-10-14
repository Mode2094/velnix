#!/usr/bin/env bash
# Source this file in this cloud workspace; no credentials are stored here.
VELNIX_TOOLS=/workspace/.velnix-tools
export PATH="$VELNIX_TOOLS/flutter/bin:$VELNIX_TOOLS/node22/node_modules/.bin:$PATH"
export PUB_CACHE="$VELNIX_TOOLS/pub-cache" npm_config_cache="$VELNIX_TOOLS/npm-cache"
export XDG_CONFIG_HOME="$VELNIX_TOOLS/config" ANALYZER_STATE_LOCATION_OVERRIDE="$VELNIX_TOOLS/analyzer"
export FLUTTER_SUPPRESS_ANALYTICS=true DASH__SUPPRESS_ANALYTICS=true
export ANDROID_HOME="$VELNIX_TOOLS/android-sdk" ANDROID_USER_HOME="$VELNIX_TOOLS/android-user"
export GRADLE_USER_HOME="$VELNIX_TOOLS/gradle" JAVA_HOME="$VELNIX_TOOLS/jdk/jdk-21.0.12.1"
export JAVA_TOOL_OPTIONS=-Djavax.net.ssl.trustStore=/etc/ssl/certs/java/cacerts
export CHROME_EXECUTABLE=/usr/bin/chromium FIREBASE_EMULATORS_PATH="$VELNIX_TOOLS/emulators"
export GRADLE_OPTS="$(python3 - <<'PY'
from pathlib import Path
p=Path('/workspace/.velnix-tools/gradle/gradle.properties')
print(' '.join('-D'+s[len('systemProp.'):] for s in p.read_text().splitlines() if s.startswith('systemProp.') and ('proxyHost=' in s or 'proxyPort=' in s)) if p.exists() else '')
PY
)"

export VELNIX_QA_PYTHON=/workspace/.velnix-tools/qa-python/bin/python
