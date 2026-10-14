"""Generate a local web push worker from PUBLIC Firebase client configuration only."""
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1]) if len(sys.argv) == 2 else root / "config/firebase.public.json"
data = json.loads(source.read_text())
fields = {"apiKey": "FIREBASE_API_KEY", "appId": "FIREBASE_APP_ID",
          "projectId": "FIREBASE_PROJECT_ID", "messagingSenderId": "FIREBASE_SENDER_ID",
          "authDomain": "FIREBASE_AUTH_DOMAIN"}
if any(not isinstance(data.get(key), str) or not data[key] for key in fields.values()):
    raise SystemExit("Complete the public Firebase client fields before configuring web push")
configuration = {key: data[value] for key, value in fields.items()}
# Use the Firebase JS SDK version supported by the pinned FlutterFire package.
version = "12.19.0"
script = (
    "/* Generated PUBLIC client configuration; never put vendor tokens here. */\n"
    f"importScripts('https://www.gstatic.com/firebasejs/{version}/firebase-app-compat.js');\n"
    f"importScripts('https://www.gstatic.com/firebasejs/{version}/firebase-messaging-compat.js');\n"
    f"firebase.initializeApp({json.dumps(configuration, ensure_ascii=True)});\n"
    "firebase.messaging();\n"
)
(root / "web/firebase-messaging-sw.js").write_text(script)
print("Generated local web/firebase-messaging-sw.js; rebuild web before testing background push")
