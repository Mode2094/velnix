# Stage 3 — Enterprise Web build and real GM acceptance procedure

Base reviewed: `aa1a9163887ae310adbea7f1a9d676951ed3c9eb` on
`audit/production-readiness`. This is an operator plan, not an executed live test
or permission to change cloud configuration. Keep PR #1 draft and unmerged.

## Enterprise provider and deployment boundary

Reviewed base for this migration: `aa1a9163887ae310adbea7f1a9d676951ed3c9eb`.
The owner independently verified the existing Web app
`1:948196868655:web:ace9b264b4fae48ac43cda` is registered in Firebase App Check
with Fraud Defense / reCAPTCHA Enterprise, and supplied its public site key.
This is owner-provided cloud evidence, not a new Console/API read by Codex.

Installed `firebase_app_check 0.4.8` exports `ReCaptchaEnterpriseProvider`;
`firebase_app_check_web 0.2.6+1` maps it to the Enterprise JavaScript provider.
No dependency upgrade is needed. Web now uses that provider exclusively.
Android Play Integrity/debug selection and Apple DeviceCheck/debug selection
are unchanged. Debug is still rejected for release/production. Activation
failure still shows the setup failure screen, never an unprotected workspace.
A missing/blank Enterprise key shows an explicit setup error with no login.

The existing public field **FIREBASE_APPCHECK_SITE_KEY** is retained to avoid
renaming local platform configs and their preservation tooling. Its Web meaning
is now **Enterprise public site key only**. It is not the Firebase API key or a
secret key. There is no Classic/v3 fallback. Offline validation verifies presence
and build intent, not a key's remote provider/type or valid attestation.
`enforceAppCheck:true` remains unchanged for all callables.

The ignored `config/firebase.stage3.production.public.json` is prepared from
the existing verified SDK configuration, preserving its project/app/API key,
sender, storage and authDomain fields. It contains the supplied PUBLIC Enterprise
key and the following build intent (this fragment is not a complete SDK config):

```json
{
  "VELNIX_MODE": "live",
  "VELNIX_ENVIRONMENT": "production",
  "VELNIX_GOOGLE_ENABLED": true,
  "VELNIX_PUSH_ENABLED": false,
  "VELNIX_DEBUG_APPCHECK": false
}
```

Do not commit this file, print its contents, put a secret key in it, regenerate
Firebase registrations, or replace existing SDK fields. Its site key was supplied
for this app by the owner; no key was invented. Runtime files must be transferred
locally by the owner if running from another checkout, not through Git. Do not
run the generic config generator afterward: review the final flags before build.

## Exact local build and proposed Hosting-only deployment

Production preflight (never prints config values), then build:

```bash
python3 scripts/check_runtime_config.py config/firebase.stage3.production.public.json --environment production --platform web --expected-project velnix-6c1a2
flutter build web --release --no-web-resources-cdn --no-wasm-dry-run --dart-define-from-file=config/firebase.stage3.production.public.json
node scripts/emulator-preview/assert-production.cjs
```

`firebase.hosting.json` is a standalone Hosting-only configuration, with existing
default site `velnix-6c1a2`, public directory `build/web` and SPA fallback to
`/index.html`. It contains no Functions, Firestore rules/indexes, hooks or
additional site/target. Root `firebase.json` is unchanged. Existing origins:
`https://velnix-6c1a2.web.app` and `https://velnix-6c1a2.firebaseapp.com`.
The SDK authDomain remains its registered firebaseapp.com value; Hosting origin
is not a new Firebase SDK field.

**DO NOT RUN in this task.** Only after independent review and explicit approval
of the Hosting release (not Functions/rules deployment), the exact proposed
command is:

```bash
functions/node_modules/.bin/firebase deploy --project velnix-6c1a2 --account moderohe8@gmail.com --config firebase.hosting.json --only hosting --non-interactive
```

Use the official authorized human Firebase CLI session; never supply credentials
in chat. Review `build/web` from the approved SHA and the successful preflight
immediately before that future command. It updates the existing Hosting release,
not a new site. Preserve the prior Hosting release/version ID for owner-authorized
Console rollback; if there is no prior release, do not invent a rollback target.
Hosting rollback does not undo database changes or delete acceptance evidence.
Hosting uploads/storage/traffic and real Firebase calls can consume billed quotas;
no services, billing changes or resource creation are authorized here.

Before acceptance, the owner must confirm both intended hostnames are permitted
by the Enterprise key and the selected hostname is in Auth Authorized Domains.
Do not modify these settings or enforcement in this task. If permission/domain
configuration is missing, stop and request the precise separate authorization.
Do not use localhost, Cloud Shell domains, tunnels or emulator scripts to claim
this Hosting acceptance. A compiled release and a registered key do not prove
real token issuance, Google login, callable access or Eventarc delivery.

## Acceptance gates and the single allowed order

Do not execute before Hosting approval/deployment and origin checks. Once those are
verified, first confirm in Auth Console that the existing Google-linked UID
still matches the prior bootstrap/readback evidence and its existing member;
if this cannot be established, do not attempt login. The owner then personally
completes Google login as `moderohe8@gmail.com`
in their trusted browser. Codex has no inherited Cloud Shell/browser session.
Do not request credentials in chat or create another Firebase user. If Google
would create a new UID, or the profile is missing/pending/disabled, stop; do not
bootstrap, approve or edit any membership, role or identity.

Record SHA, exact origin, project/app ID, test tag, order ID, status/error codes
and pass/fail only. Keep email/UID out of shared screenshots; record only that
session UID equals the existing owner's member document ID. Do not dump member
records or real order/customer lists. Crop unrelated records and sensitive data
from screenshots. Initial dashboard/list loading reads the shared real project;
acceptance must run only in the authorized owner's private session.

| Gate / step | Required real evidence |
| --- | --- |
| Google + existing membership | Google popup succeeds for the existing owner; own `members/{session.uid}` GET succeeds, role is generalManager, active/approved. Own `joinRequests/{session.uid}` GET is allowed; an absent document is not a reason to create it. Never modify either document. |
| Session + App Check | `joinSession` returns approved; `me` and `dashboardStats` succeed with real SDK-issued App Check. Never extract/log their tokens. Startup/compile alone is insufficient. |
| Protected callables | Use a fresh signed-out browser context with **valid real App Check** to call read-only `me`; expect unauthenticated. Separately, an isolated SDK context with the owner's documented Google session and **no App Check initialization** calls read-only `me`; expect unauthenticated/401. Do not copy tokens between contexts or clear/disable App Check in the main app. No extra Firebase user, password login, forged role or GM mutation. If this distinct negative proof cannot be obtained safely, mark it untested; do not fabricate it. |
| Tag + create exactly one INTERNAL order | Generate `STAGE3_ACCEPTANCE_<UTC timestamp>` once; put it in recipient name, description and notes. Use fictional label/address and clearly synthetic phone `0000000000`, quantity 1, amount `0.000` JOD, no personal contact or real customer. Leave company unassigned: `companyId=null`, `hasDelivery=false`, no tracking or remote status. Preserve the UI's requestKey for an ambiguous retry; never start another order to hide an uncertain result. |
| Readback + edit | Save returned order ID. `getOrder` returns the same tag/id/internal fields and created event. Edit only this tagged order's notes through the normal UI; revision increases and edited event appears. Do not navigate to shipping/company/admin actions. |
| Search | Exact-tag search returns the same order. Use default bucket and no combined date/company/creator/status filters; only first-acceptance indexes were independently reported READY. A missing additional index is a blocker, not permission to create it. |
| Internal states | Via UI: created → review → preparing → ready → delivered, using the explicit internal completion confirmation. Each step reads back its status and revision/event. Final `completionSource=internal`, no shipment/tracking, edits/status transitions locked. The tag remains visible. This terminal test record is retained. |
| Audit | `listAudit` and order events show order.created, order.edited and four order.status_changed records for **this order ID**; do not expose unrelated entries. Do not delete history. |
| Internal notice | `listNotices`/UI eventually shows a notice for this order; opening it marks only that notice read. This tests the deployed orderEventNotice → Firestore notices path, **not FCM/Push**. Wait on observable matching notice with a bounded timeout (e.g. 60s); report a timeout as a failure/unverified trigger, never create duplicate orders to provoke it. |
| Direct read denial | In the owner's client SDK session, `getDoc(orders/{taggedOrderId})` and `getDocs(orders)` must return permission-denied. Backend getOrder succeeding does not replace this test. Do not export existing data if a rule unexpectedly permits access; stop. |
| Direct write denial | Attempt a client update to this synthetic order's note using the **same already saved note value**, without touching any other field. Expect permission-denied. This is a write authorization check with no intended data change, not a delete test. Unexpected success is a security failure: stop and preserve evidence. Never probe writes to GM/member/joinRequest/real-customer documents and never delete anything. |

A failed gate stops subsequent writes. Retain the one synthetic order, its
idempotency record, events, notices and audit. No cleanup deletion or retry with
a new tag. Do not certify all 23 endpoints or other roles from this limited GM
flow. If a call/notice fails, report sanitized error code, step and order ID;
no raw error bodies, tokens or credentials. Cloud cost is not guaranteed zero:
reads, Functions execution, attestation, events and the one retained order use
the existing billed project's resources. Do not enable a service or change a
billing plan to resolve a failure.

## Source/deployment boundary

Owner-reported independently verified real state: 22 internal Gen2 callables
ACTIVE in europe-west1; orderEventNotice ACTIVE in us-central1 with Firestore
source nam5; nodejs22 and the existing runtime account
`velnix-runtime-internal@velnix-6c1a2.iam.gserviceaccount.com`; first-acceptance
indexes READY and own-document-only rules deployed with a deny-all backup.
These statements are **owner evidence**, not a new Codex cloud inventory.

`config/first-internal-deploy.json` still enumerates exactly 23 approved exports.
The SDK regression checks their regions, runtime identity, document path
`orders/{orderId}/events/{eventId}`, retry=true and excluded handlers.
`firestore.rules` matches the owner's intended model: only authenticated own
member/joinRequest GET; no list or client writes; every other read denied.
Matching intended policy is not a fresh ruleset/hash readback from the cloud.

Use existing regression coverage: `first_internal_deploy.test.js`,
`operational_readiness.test.js`, emulator `rules.test.js`, `google_join.test.js`,
`test/google_join_test.dart`, `test_runtime_config.py` and the production-build
isolation assertion. Enterprise provider, missing-key, Google runtime gate, production debug rejection
and Hosting-only regressions supplement these existing tests. Run
`scripts/validate.sh` on the reviewed tree and report actual results separately
from real acceptance.

Click/generic_v1, all delivery handlers/webhooks, Scheduler, FCM/device Push,
KMS, printer, deployments, IAM/rules/index/provider/enforcement mutations,
bootstrap, identity changes and merge are outside this acceptance. Existing
company directory metadata reads made by the UI are not shipping approval;
never select a company or invoke any dispatch/company mutation endpoint.

**Decision: prepared for independent build/source review; real acceptance remains
UNTESTED and requires a separately approved Hosting release.** No real sign-in,
App Check token request, callable acceptance, order creation or cloud write is
performed by this preparation. The 23 deployed functions, current GM identity,
Firestore policy and all deployment restrictions remain unchanged.

## Local migration verification (not real acceptance)

- Node22.23.3; firebase_app_check0.4.8 unchanged; no lockfile/dependency upgrades.
- `scripts/validate.sh`: exit0; analysis, formatting, syntax, secret scan and
  production dependency audit passed (zero vulnerabilities); Flutter328, Node128,
  emulator68, Python configuration14 and PDF/barcode36 passed. No skipped tests.
- `flutter test test/firebase_configuration_test.dart --reporter expanded`
  passed7 with default Google flag false; the same test with
  `--dart-define=VELNIX_GOOGLE_ENABLED=true` passed7.
- `bash scripts/emulator-preview/run-qa.sh`: all21 browser scenarios passed,
  zero page errors, backend readback passed; synthetic demo-velnix-preview only.
- `flutter build web --no-web-resources-cdn --no-wasm-dry-run` with
  `--dart-define=VELNIX_MODE=demo` and separately `VELNIX_MODE=live`: both built.
  `node scripts/browser_smoke.cjs` passed30 Demo checks across5 roles/3 widths,
  using a loopback file server; `node scripts/emulator-preview/assert-production.cjs`
  passed for Live. No real production browser/App Check execution.
- `flutter build apk --debug --dart-define=VELNIX_MODE=demo` and separately
  `--dart-define=VELNIX_MODE=live`: both built. Native App Check option blocks
  are byte-for-byte unchanged from the base source.
- The exact production preflight/build/isolation commands above passed with
  the supplied public key and existing SDK fields. Final `build/web` is the
  configured production release (not the Demo/blank-config build). Its
  `main.dart.js` SHA256 is `912e899da3620e1b4532bd767f54f12871f6c1b159ee16d01f7617a24534c064`.
- The production config is Git-ignored; no real key/config is added to Git.
  Root firebase.json, Functions (including enforceAppCheck, regions, trigger
  document/retry/logic), rules, indexes, IAM, Auth and GM state are unchanged.
- No Hosting/Functions/rules deploy or cloud mutation was performed. Stop for
  independent source/build review before the proposed Hosting-only command.
