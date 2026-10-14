"""Offline public configuration preflight. Never prints configuration values."""
import argparse
import json
import re
from pathlib import Path

PUBLIC_FIELDS = {
    "FIREBASE_PROJECT_ID", "FIREBASE_APP_ID", "FIREBASE_API_KEY",
    "FIREBASE_SENDER_ID", "FIREBASE_AUTH_DOMAIN", "FIREBASE_APPCHECK_SITE_KEY",
    "FIREBASE_VAPID_KEY", "GOOGLE_WEB_CLIENT_ID", "VELNIX_MODE",
    "VELNIX_ENVIRONMENT", "VELNIX_DEBUG_APPCHECK", "VELNIX_GOOGLE_ENABLED",
    "VELNIX_PUSH_ENABLED",
    "FIREBASE_STORAGE_BUCKET", "FIREBASE_IOS_BUNDLE_ID",
}
FLAGS = {"VELNIX_DEBUG_APPCHECK", "VELNIX_GOOGLE_ENABLED", "VELNIX_PUSH_ENABLED"}


def validate(data, *, environment, platform, expected_project, release=True):
    if not isinstance(data, dict) or set(data) - PUBLIC_FIELDS:
        raise ValueError("Only approved PUBLIC client fields are allowed")
    if environment not in {"staging", "production"} or platform not in {"web", "android", "ios"}:
        raise ValueError("Select a supported environment and platform")
    if data.get("VELNIX_ENVIRONMENT") != environment or data.get("VELNIX_MODE") != "live":
        raise ValueError("Environment must match the selected Live target")
    if any(type(data.get(k, False)) is not bool for k in FLAGS):
        raise ValueError("Feature flags must be JSON booleans")
    if any(not isinstance(v, str) for k, v in data.items() if k not in FLAGS):
        raise ValueError("Public configuration fields must be strings")
    if data.get("VELNIX_DEBUG_APPCHECK", False) and (release or environment == "production"):
        raise ValueError("Debug App Check is forbidden for this build")
    required = ["FIREBASE_PROJECT_ID", "FIREBASE_APP_ID", "FIREBASE_API_KEY", "FIREBASE_SENDER_ID"]
    if platform == "web":
        required += ["FIREBASE_AUTH_DOMAIN", "FIREBASE_APPCHECK_SITE_KEY"]
        if data.get("VELNIX_PUSH_ENABLED"):
            required.append("FIREBASE_VAPID_KEY")
    elif data.get("VELNIX_GOOGLE_ENABLED"):
        required.append("GOOGLE_WEB_CLIENT_ID")
    if any(not data.get(k, "").strip() for k in required):
        raise ValueError("Required public platform configuration is incomplete")
    project = data["FIREBASE_PROJECT_ID"]
    if not expected_project or project != expected_project:
        raise ValueError("Project must match the owner's explicitly selected target")
    if environment == "production" and project.startswith("demo-"):
        raise ValueError("A demo emulator project cannot be a production target")
    if not re.fullmatch(r"AIza[A-Za-z0-9_-]{35}", data["FIREBASE_API_KEY"]):
        raise ValueError("Firebase public API key format is invalid")
    prefix = f"1:{data['FIREBASE_SENDER_ID']}:{platform}:"
    if not data["FIREBASE_APP_ID"].startswith(prefix):
        raise ValueError("Firebase app ID must match sender ID and selected platform")
    if platform == "ios" and data.get("FIREBASE_IOS_BUNDLE_ID") != "com.mode2094.velnix":
        raise ValueError("iOS bundle ID must match the registered application")
    if any("PRIVATE KEY" in v for v in data.values() if isinstance(v, str)):
        raise ValueError("Private credentials are forbidden in public configuration")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    parser.add_argument("--environment", required=True, choices=["staging", "production"])
    parser.add_argument("--platform", required=True, choices=["web", "android", "ios"])
    parser.add_argument("--expected-project", required=True)
    parser.add_argument("--debug-build", action="store_true")
    args = parser.parse_args()
    try:
        data = json.loads(args.path.read_text())
        validate(data, environment=args.environment, platform=args.platform,
                 expected_project=args.expected_project, release=not args.debug_build)
    except (OSError, ValueError, TypeError):
        # Parsing errors can echo part of a private input: expose no values.
        parser.exit(1, "Public configuration rejected; check target, fields and flags safely.\n")
    print("Public configuration preflight passed; remote Firebase/IAM and devices remain unverified")


if __name__ == "__main__":
    main()
