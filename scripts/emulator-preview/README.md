# Local Live UI with Firebase Emulators

Run from `audit/production-readiness`, with Node 22, Flutter 3.47.7, Java 21,
Python 3, locked Flutter packages and `functions/node_modules` installed:

```bash
bash scripts/emulator-preview/start.sh
```

Open http://127.0.0.1:8767. Select Google, then a synthetic `role@velnix.test`
identity in the **Auth emulator** popup: `generalmanager`, `manager`, `warehouse`,
`sales`, `dataentry`, `pending` or `disabled`. No Google credentials are required.
The real Live UI and Backend run against `demo-velnix-preview` only. Refreshing
clears the in-memory login session; stopping services discards emulator data.
Ctrl+C stops this launcher's services. Occupied ports cause a safe refusal.

The optional Codex toolchain is loaded automatically when present. Otherwise use
the prerequisites above. Initial startup downloads public SDK/emulator assets;
ordinary TLS verification remains enabled. Never expose these ports publicly or
use this entry point as a production build.

## Repeatable Chromium acceptance test

With Playwright 1.64.0 installed outside the repository and Chromium available:

```bash
NODE_PATH=/path/to/playwright/node_modules CHROME_EXECUTABLE=/usr/bin/chromium bash scripts/emulator-preview/run-qa.sh
```

The wrapper starts clean emulators, exercises 21 scenarios in Chromium, verifies
persisted emulator documents and stops its own services. Stop an existing preview
first. CI runs this exact wrapper in the `emulator-ui` job; it retains screenshots,
scenario JSON and diagnostic logs under `build/qa/emulator-ui/` for 14 days.
Failed assertions fail the job. Existing unit/emulator suites still run separately.

Fixture access is deliberate: general manager has builtin full access; manager
has explicit order/amount/report/audit/employee grants; warehouse sees all orders
and transitions without other users' amounts; sales sees its own and its assigned
data-entry member's orders without that member's amounts; data entry sees its own.
No shipping company or real device is configured.

## Isolation and evidence limits

* Separate Dart entry point under `scripts/`; normal `lib/main.dart` is unchanged.
* Hardcoded demo project and loopback Auth/Firestore/Functions. Inherited Admin
  credential variables are removed; seeding refuses non-loopback emulator hosts.
* Synthetic App Check is initialized only on loopback before Firebase Auth.
  It proves emulator enforcement paths, **not genuine attestation**.
* The preview server restricts browser connections to local Firebase endpoints.
  A verified-TLS relay serves allowlisted public Google SDK/font assets only;
  test routing never replaces Backend/Auth responses with fabricated success.
* Normal Live web CI checks that emulator-only markers are absent from its bundle.
* No cloud bootstrap, deploy, IAM, billing or real Firebase writes are involved.
* Real Google OAuth, App Check providers, FCM push delivery/background behavior,
  physical devices, printing, Click and deployed indexes require separate testing.
