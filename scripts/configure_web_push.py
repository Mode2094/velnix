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
    "\n"
    "// Claim open app tabs so a notification tap below can navigate them. FCM's\n"
    "// default worker only focuses a tab, which leaves an already-open app on the\n"
    "// old screen; navigating re-enters the app at /?order=<id> and the shell opens\n"
    "// that order under the signed-in user's permissions.\n"
    "self.addEventListener('activate', (event) => {\n"
    "  event.waitUntil(self.clients.claim());\n"
    "});\n"
    "\n"
    "// Registered before firebase.messaging() so this runs first and replaces\n"
    "// FCM's focus-only click handler (event.stopImmediatePropagation). No customer\n"
    "// data is read here beyond the order id the backend already authorised.\n"
    "self.addEventListener('notificationclick', (event) => {\n"
    "  const message = event.notification && event.notification.data &&\n"
    "    event.notification.data.FCM_MSG;\n"
    "  if (!message || event.action) return;\n"
    "  event.stopImmediatePropagation();\n"
    "  event.notification.close();\n"
    "  const orderId = message.data && typeof message.data.orderId === 'string'\n"
    "    ? message.data.orderId.trim()\n"
    "    : '';\n"
    "  const target = orderId\n"
    "    ? '/?order=' + encodeURIComponent(orderId)\n"
    "    : '/';\n"
    "  event.waitUntil((async () => {\n"
    "    const windows = await self.clients.matchAll({\n"
    "      type: 'window',\n"
    "      includeUncontrolled: true,\n"
    "    });\n"
    "    const existing = windows.find(\n"
    "      (client) => new URL(client.url).origin === self.location.origin,\n"
    "    );\n"
    "    if (existing) {\n"
    "      try {\n"
    "        await existing.navigate(target);\n"
    "        return;\n"
    "      } catch (error) {\n"
    "        /* Fall through to opening a fresh window. */\n"
    "      }\n"
    "    }\n"
    "    await self.clients.openWindow(target);\n"
    "  })());\n"
    "});\n"
    "\n"
    "firebase.messaging();\n"
)
(root / "web/firebase-messaging-sw.js").write_text(script)
print("Generated local web/firebase-messaging-sw.js; rebuild web before testing background push")
