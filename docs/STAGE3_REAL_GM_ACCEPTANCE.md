# Stage 3 real general-manager acceptance — BLOCKED before live access

Base reviewed: `e3689c58743d58d386f8fc68c636623f00c754cf` on
`audit/production-readiness`. This is an operator plan, not an executed live test
or permission to change cloud configuration. Keep PR #1 draft and unmerged.

## Proven local blocker and minimum next input

The existing ignored `config/firebase.web.public.json` selects project
`velnix-6c1a2`, Web app `1:948196868655:web:ace9b264b4fae48ac43cda`,
auth domain `velnix-6c1a2.firebaseapp.com`, Live mode and staging environment.
Its `FIREBASE_APPCHECK_SITE_KEY` is empty and `VELNIX_GOOGLE_ENABLED` is false.
Debug App Check and Push are false. No configuration values were changed.

- `lib/main.dart` refuses Live Web startup without the site key and activates
  `ReCaptchaV3Provider(webSiteKey)`. Missing key leads to `SetupFailureApp`.
- `lib/live/live_app.dart` disables the only login button until
  `VELNIX_GOOGLE_ENABLED=true`; Web login uses Firebase Google popup sign-in.
- `functions/src/index.js` wraps every callable with `enforceAppCheck:true`.
  Google authentication does not replace App Check. A compiled Web artifact,
  emulator JWT or Firebase client API key does not prove real attestation.
- The existing offline `scripts/check_runtime_config.py` rejects this file for
  missing required Web configuration. No new runtime code or bypass is needed.

**Provide next:** the **public reCAPTCHA v3 site key** registered with Firebase
App Check for this exact Web app, and the exact approved browser origin
(scheme/hostname/port). Confirm in Console that the key's allowed hostname and
Firebase Auth Authorized Domains already cover that origin. Do not send the
reCAPTCHA secret, App Check/debug tokens, Google authorization codes, cookies,
ID/refresh tokens or service-account credentials.

In Firebase Console → project `velnix-6c1a2` → App Check → Apps → the active Web
app above: read its provider/registration status. If registration is missing,
the owner must separately authorize/configure **reCAPTCHA v3**, with its secret
entered only in the official Console. This code does not use Enterprise or v2
keys. Do not change enforcement or Auth provider settings for this task. Merely
supplying a nonempty site key does not prove registration, token issuance,
domain authorization or real callable access. Cloud App Check state and domain
lists have **not** been read by Codex; absence is not inferred from the local
blank key. If the approved origin/provider needs changes, stop for that precise
separate approval. Do not reuse/re-add a temporary Cloud Shell domain.

## Local preparation after the input arrives — no deploy

Preserve the current ignored file. Make a new ignored copy named
`config/firebase.stage3.public.json` only if it does not already exist. Retain
its verified Firebase SDK fields. Set just the real supplied
`FIREBASE_APPCHECK_SITE_KEY` and `VELNIX_GOOGLE_ENABLED=true`; require:

```json
{
  "VELNIX_MODE": "live",
  "VELNIX_ENVIRONMENT": "staging",
  "VELNIX_DEBUG_APPCHECK": false,
  "VELNIX_GOOGLE_ENABLED": true,
  "VELNIX_PUSH_ENABLED": false
}
```

This is a fragment, not a complete SDK config or a replacement of its fields.
The staging label does **not** isolate the shared real database. Leave VAPID
empty and do not enable notifications on the device. No debug App Check,
emulator entrypoint, custom token provider or synthetic sign-in is permitted.
Use Node.js22 and the repository Flutter toolchain. Before opening a browser:

```bash
python3 scripts/check_runtime_config.py config/firebase.stage3.public.json --environment staging --platform web --expected-project velnix-6c1a2
flutter build web --release --no-web-resources-cdn --no-wasm-dry-run --dart-define-from-file=config/firebase.stage3.public.json
node scripts/emulator-preview/assert-production.cjs
```

These prepare local files only. Start a local file server for `build/web` using
an **already approved origin**, not the emulator preview server; it must not
rewrite SDK URLs or initialize emulator/Auth/App Check shims. An authorized
localhost origin can use `python3 -m http.server PORT --bind 127.0.0.1 --directory
build/web` with the approved hostname/port in the browser. Otherwise use the
owner's existing approved HTTPS serving arrangement; do not publish Hosting,
add a domain, tunnel or create a new hosted resource here. Never claim localhost
is already authorized. Do not log browser request headers, response tokens,
network HAR or SDK configuration contents. A public-only configuration file is
still kept out of Git; never add private credentials to it.

## Acceptance gates and the single allowed order

Do not execute while BLOCKED. After the public configuration and origin are
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
isolation assertion. No application/security code change or new duplicate test
is needed for this configuration blocker. Run `scripts/validate.sh` on the
reviewed tree and report actual results separately from real acceptance.

Click/generic_v1, all delivery handlers/webhooks, Scheduler, FCM/device Push,
KMS, printer, deployments, IAM/rules/index/provider/enforcement mutations,
bootstrap, identity changes and merge are outside this acceptance. Existing
company directory metadata reads made by the UI are not shipping approval;
never select a company or invoke any dispatch/company mutation endpoint.

**Decision: BLOCKED.** Next action is the owner's public reCAPTCHA v3 site key
and approved origin/registration confirmation. No real sign-in, callable
acceptance, order creation or cloud writes were performed by this preparation.

## Local verification for this documentation change

`source scripts/cloud-env.sh` (Node22.23.3), then
`export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:-} -Xmx1536m -XX:ActiveProcessorCount=2"`
and `scripts/validate.sh`: exit 0; Flutter325, Node128, Firebase emulator68,
configuration12 and PDF/barcode36 passed, zero skipped Node/emulator tests.
Analysis/format/syntax passed, production dependency audit found zero
vulnerabilities. Existing first-batch SDK discovery and rule regressions passed.
No new test was needed for unchanged, already covered code. These are local
regressions, not real acceptance. Base commit Push CI38797194488 and PR
CI38797205288 are successful; CI for the new documentation commit must be
reported separately after push. No real App Check token was requested or tested.
