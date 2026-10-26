"""Prepare ignored public platform files offline; never creates Firebase apps."""
import argparse
import json
import plistlib
import re
import shutil
from pathlib import Path


def public_key(value):
    if not isinstance(value, str) or not re.fullmatch(r"AIza[A-Za-z0-9_-]{35}", value):
        raise ValueError("Invalid public SDK key")
    return value


def configurations(android, ios, web, *, project, bundle):
    # SDK documents are data, not commands or configuration for Admin SDK.
    for source in (android, ios, web):
        if not isinstance(source, dict) or any(k in source for k in ("private_key", "client_email", "User_Pass")):
            raise ValueError("Only public client SDK configuration is accepted")
        if "PRIVATE KEY" in json.dumps(source):
            raise ValueError("Private credentials are forbidden")
    if set(web) - {"apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId", "measurementId"}:
        raise ValueError("Unknown Web SDK field")
    info = android["project_info"]
    if not project or any(p != project for p in (info["project_id"], ios["PROJECT_ID"], web["projectId"])):
        raise ValueError("All platforms must use the selected existing project")
    clients = [c for c in android["client"] if c["client_info"]["android_client_info"]["package_name"] == bundle]
    if len(clients) != 1 or ios["BUNDLE_ID"] != bundle or bundle != "com.mode2094.velnix":
        raise ValueError("Platform application identifiers do not match")
    client = clients[0]
    sender = str(info["project_number"])
    if sender != str(ios["GCM_SENDER_ID"]) or sender != str(web["messagingSenderId"]):
        raise ValueError("Sender IDs do not match")
    bucket = info["storage_bucket"]
    if not bucket or bucket != ios["STORAGE_BUCKET"] or bucket != web["storageBucket"]:
        raise ValueError("Storage bucket registrations do not match")
    keys = client["api_key"]
    if len(keys) != 1:
        raise ValueError("Select an unambiguous Android SDK key")
    options = {"android": (client["client_info"]["mobilesdk_app_id"], keys[0]["current_key"]),
               "ios": (ios["GOOGLE_APP_ID"], ios["API_KEY"]),
               "web": (web["appId"], web["apiKey"])}
    oauth = [c["client_id"] for c in client.get("oauth_client", []) if c.get("client_type") == 3]
    if len(oauth) > 1:
        raise ValueError("Ambiguous server OAuth client")
    reverse = ios.get("REVERSED_CLIENT_ID", "")
    ios_client = ios.get("CLIENT_ID", "")
    if reverse and (not re.fullmatch(r"com\.googleusercontent\.apps\.[A-Za-z0-9-]+", reverse)
                    or not ios_client.endswith(".apps.googleusercontent.com")
                    or reverse != "com.googleusercontent.apps." + ios_client.removesuffix(".apps.googleusercontent.com")):
        raise ValueError("iOS OAuth URL scheme is inconsistent")
    result = {}
    for platform, (app_id, api_key) in options.items():
        prefix = f"1:{sender}:{platform}:"
        if not isinstance(app_id, str) or not app_id.startswith(prefix) or not app_id[len(prefix):]:
            raise ValueError("App ID does not match sender and platform")
        result[platform] = {
            "FIREBASE_PROJECT_ID": project, "FIREBASE_APP_ID": app_id,
            "FIREBASE_API_KEY": public_key(api_key), "FIREBASE_SENDER_ID": sender,
            "FIREBASE_AUTH_DOMAIN": web["authDomain"], "FIREBASE_STORAGE_BUCKET": bucket,
            "FIREBASE_APPCHECK_SITE_KEY": "", "FIREBASE_VAPID_KEY": "",
            "GOOGLE_WEB_CLIENT_ID": oauth[0] if oauth else "",
            "VELNIX_MODE": "live", "VELNIX_ENVIRONMENT": "staging",
            "VELNIX_DEBUG_APPCHECK": False, "VELNIX_GOOGLE_ENABLED": False,
            "VELNIX_PUSH_ENABLED": False,
        }
        if platform == "ios":
            result[platform]["FIREBASE_IOS_BUNDLE_ID"] = bundle
    return result, reverse


def prepare(root, android_path, ios_path, web_path, *, project, bundle):
    android = json.loads(android_path.read_text())
    ios = plistlib.loads(ios_path.read_bytes())
    web = json.loads(web_path.read_text())
    configs, reverse = configurations(android, ios, web, project=project, bundle=bundle)
    outputs = {root / f"config/firebase.{platform}.public.json": data for platform, data in configs.items()}
    # Never replace another registration or erase previously supplied App Check/VAPID.
    for path, data in outputs.items():
        if path.exists():
            existing = json.loads(path.read_text())
            if any(existing.get(k) != data[k] for k in ("FIREBASE_PROJECT_ID", "FIREBASE_APP_ID")):
                raise ValueError("Existing local registration differs; review before replacing")
            for key in ("FIREBASE_APPCHECK_SITE_KEY", "FIREBASE_VAPID_KEY"):
                if key in existing:
                    data[key] = existing[key]
    destinations = [(android_path, root / "android/app/google-services.json"),
                    (ios_path, root / "ios/Runner/GoogleService-Info.plist")]
    for source, target in destinations:
        if target.exists() and target.read_bytes() != source.read_bytes():
            raise ValueError("Existing native SDK file differs; review before replacing")
    for path, data in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2) + "\n")
    for source, target in destinations:
        target.parent.mkdir(parents=True, exist_ok=True)
        if source.resolve() != target.resolve():
            shutil.copyfile(source, target)
    xcconfig = root / "ios/Flutter/Firebase.local.xcconfig"
    xcconfig.parent.mkdir(parents=True, exist_ok=True)
    xcconfig.write_text("// Public OAuth URL scheme from the provided iOS SDK file.\n"
                        + f"VELNIX_GOOGLE_REVERSED_CLIENT_ID = {reverse}\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--android-file", type=Path, required=True)
    parser.add_argument("--ios-file", type=Path, required=True)
    parser.add_argument("--web-file", type=Path, required=True)
    parser.add_argument("--project", required=True)
    parser.add_argument("--bundle-id", default="com.mode2094.velnix")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    try:
        prepare(args.root, args.android_file, args.ios_file, args.web_file,
                project=args.project, bundle=args.bundle_id)
    except (OSError, ValueError, KeyError, TypeError, plistlib.InvalidFileException):
        parser.exit(1, "Configuration rejected; review SDK registration fields without exposing credentials.\n")
    print("Local platform files prepared offline. Web App Check and active-app confirmation remain required.")


if __name__ == "__main__":
    main()
