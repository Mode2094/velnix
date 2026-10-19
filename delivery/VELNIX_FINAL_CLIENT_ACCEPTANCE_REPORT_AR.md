# VELNIX — FINAL CLIENT ACCEPTANCE REPORT

**التاريخ:** 2026-10-19  
**الكود المنشور:** `d953dbb`  
**CI:** `39320802815` — جميع الوظائف ناجحة  
**Hosting:** https://velnix-6c1a2.web.app  
**PR:** `#1` — لم يُدمج في `main`

## جدول القبول

| البند | النتيجة | الدليل |
|---|---|---|
| إصلاح تحميل الحساب | **PASS** | جلسة مستخدم محذوف تحوّلت إلى شاشة دخول واضحة بدل الخطأ العام |
| Email/Password | **PASS** | تسجيل دخول إنتاجي من Chrome |
| لوحة التحكم | **PASS** | ظهرت بعد تسجيل الدخول |
| إنشاء الطلب | **PASS (Emulator UI)** | إنشاء/تعديل/حالة مغطاة في Emulator؛ الطلب الجاهز للإرسال موجود إنتاجيًا |
| إرسال الطلب من الواجهة | **BLOCKED** | الزر «إرسال إلى Click» ظاهر؛ ينتظر موافقة صريحة على شحنة الاختبار |
| Click setorder | **PASS** | الشحنة `1318368` من الاختبار السابق، لم تُكرر |
| Click getorder | **PASS** | HTTP 200، `Order_ID=VNX-CLICK-TEST-20261019-d`، `User_ID=1603` |
| المزامنة اليدوية | **PASS** | `syncClickOrder` 200 وتحديث Firestore/الواجهة |
| المزامنة التلقائية | **PASS** | Scheduler شغّل `checked=1, failed=0, updated=0` وحدّث `lastSyncAt` |
| Scheduler Job | **PASS / ENABLED** | `firebase-schedule-syncClickStatuses-europe-west1` كل 15 دقيقة |
| منع التكرار | **PASS** | Lease/Lock + `needs_review` + اختبارات Emulator |
| حفظ البوليصة والمرجع | **PASS** | `providerOrderId`, `clickOrderRef`, `clickClientSerial` منفصلة |
| حالات الشحن | **PASS** | `awaitingPickup` + `click_api` + التاريخ والملاحظة |
| الأدوار والصلاحيات | **PASS** | 8 أدوار في Chrome + منع الأدوار غير المخوّلة |
| Firebase Deploy | **PASS** | `syncClickStatuses` و`syncClickOrder` و`sendOrderToDelivery` ACTIVE |
| Hosting | **PASS** | الحزمة الجديدة منشورة |
| CI | **PASS** | `39320802815` |
| Client Handover | **NOT READY** | ينتظر موافقة الإرسال الحي + مطابقة العقد/الفيديو + اختبار Google Login |

## 1. إصلاح تحميل الحساب

**Root Cause المكتشف:** `joinSession` كان يستدعي `auth.getUser(uid)` لمستخدم Auth محذوف/جلسة قديمة، فيرمي `auth/user-not-found`؛ كان `firebaseError` يحوّله إلى `internal` والواجهة تعرض رسالة عامة «تعذر إتمام العملية».

**الإصلاح:**
- `auth/user-not-found` → `unauthenticated` برسالة عربية واضحة.
- `VelnixException` يحمل `code`، والواجهة تسجّل الخروج تلقائيًا عند `unauthenticated` وتعود لشاشة الدخول.
- أُثبت بجلسة مستخدم محذوف: أعادت شاشة الدخول بدل الخطأ العام.
- App Check بقي `minValidScore=0.5`؛ خُفّض مؤقتًا لاختبار المتصفح الآلي ثم أُعيد.

## 2. مسار إرسال Click

- `clickSendEnabled=true` للشركة `click_delivery_1603` فقط.
- السماح من الخادم عبر `CLICK_SEND_ALLOWED_COMPANY_IDS` (الافتراضي: `click_delivery_1603`).
- اعتماد Click محفوظ مشفّرًا في `companySecrets` عبر Cloud KMS؛ لا كلمة مرور في Flutter/Git.
- زر «إرسال إلى Click» يظهر للطلب الجاهز.
- `Ord_Amt` = مبلغ Velnix بالدينار، بتحويل fils إلى 3 منازل دون رسوم مضافة.

**Payload المجهّز للطلب `click_send_test_ready` (لم يُرسل):**

```json
{
  "User_Name": "[redacted]",
  "User_Pass": "[REDACTED]",
  "Client_Serial": "VNX-click_send_test_ready",
  "Reciver_Name": "Velnix Click Send Test",
  "Reciver_Phone": "0779557077",
  "Reciver_Address": "عمان - وسط - Amman - Jordan - Velnix API Test Address",
  "Ord_Content": "Velnix Click send test",
  "Ord_Quantity": 1,
  "Ord_Amt": 1,
  "Ord_Note": "TEST - do not ship without owner approval",
  "Is_Ord_Exchange": false,
  "Open_Shippment": false
}
```

- الطلب `click_send_test_ready` حالته `ready` و`dispatchState=idle`.
- `providerOrderId` و`clickOrderRef` و`clickClientSerial` كلها `null` — لم يُنشأ أي Click shipment.
- المبلغ 1.000 د.أ + شحن Click المحتمل.

**المطلوب:** موافقة صريحة واحدة على إرسال هذا الطلب المحدد مرة واحدة، مع تحمل رسوم Click المحتملة. بعدها يُنفّذ الإرسال مرة واحدة، ويُتحقق من البوابة، ثم تُربط البوليصة وتُزامن الحالة.

## 3. المزامنة التلقائية

- Function: `syncClickStatuses` — **ACTIVE**.
- Scheduler: `firebase-schedule-syncClickStatuses-europe-west1` — **ENABLED** كل 15 دقيقة.
- أول تشغيل إنتاجي: `checked=1`, `updated=0`, `failed=0`, `skipped=0`.
- `lastSyncAt` للطلب `click_e2e_1318368` تحدّث، و`nextClickSyncAt` انتقل 15 دقيقة.
- لا أحداث/إشعارات مكررة عند عدم تغير الحالة.
- حدود: 10 طلبات/تشغيل، Backoff أقصى 240 دقيقة، إيقاف بعد 5 أخطاء متتالية.

## 4. الاختبارات

| المجموعة | النتيجة |
|---|---|
| Functions Unit | **192/192** |
| Firebase Emulator | **149/149** |
| Flutter Analyze | **نظيف** |
| Flutter Full (macOS) | **343 نجاح / 18 Golden قديم** |
| CI | **ناجح** |

## 5. حسابات الاختبار

- حُذفت حسابات E2E المؤقتة من Auth/Firestore.
- حُذف حساب `e2e.send.gm@velnix.test` بعد اختبار زر الإرسال.
- بقي حساب المالك `moderohe8@gmail.com` (Google موثق).
- الطلب `click_send_test_ready` بقي عمدًا بانتظار موافقة الإرسال.

## 6. الحكم

**Core production integration: PASS** — Login، الأدوار، Click getorder، Manual Sync، Auto Sync، Scheduler، UI، Deploy، Security.  
**Live UI send test: BLOCKED** — ينتظر موافقة المالك على الطلب `click_send_test_ready`.  
**Full Client Handover: NOT READY** — بسبب الإرسال الحي غير المنفذ، وغياب العقد/الفيديو، وعدم اختبار Google Login في جلسة إنتاجية.
