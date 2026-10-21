#!/bin/sh
# An optional local SDK file; no cloud commands or credentials are printed.
set -eu
velnix_source="${PROJECT_DIR}/Runner/GoogleService-Info.plist"
velnix_destination="${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/GoogleService-Info.plist"
if [ -f "$velnix_source" ]; then
    /usr/bin/plutil -lint "$velnix_source" >/dev/null
    mkdir -p "${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}"
    cp "$velnix_source" "$velnix_destination"
else
    # Do not leave a previous project's SDK file in an incremental Demo build.
    rm -f "$velnix_destination"
fi
