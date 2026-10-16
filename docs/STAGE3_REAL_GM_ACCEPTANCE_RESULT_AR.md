# Velnix — المرحلة الثالثة: نتيجة قبول المدير العام الحقيقي (الجزء A)

**التاريخ:** 2026-10-17
**الفرع:** `audit/production-readiness`
**SHA:** `f8dd779d539ae45f65a5425857cdf432c777dc3c`
**Hosting release:** `1792185428621000` · **Version:** `bfcf77a263abc657` (FINALIZED)
**المشروع:** `velnix-6c1a2` · **الأصل:** `https://velnix-6c1a2.web.app`

> **الجزء A فقط.** لم يُنفَّذ الجزء B. لم يُنشر أي شيء، ولم تُعدَّل أي خدمة، ولم يُنشأ أي سجل عمل.

---

## 1. النطاق والصلاحية

| الجزء | المحتوى | الحالة |
|---|---|---|
| **A** | تحقق للقراءة فقط · App Check وcallables المحمية قراءة فقط · اختبارات سلبية · انحدار | ✅ **مُنفَّذ** |
| **B** | طلب اصطناعي واحد + تعديله + نقله بين الحالات + إشعاره + اختبار منع الكتابة المباشر | ⛔ **يتطلب موافقة منفصلة — لم يُنفَّذ** |

---

## 2. فحص المستودع

| الفحص | النتيجة |
|---|---|
| الفرع | `audit/production-readiness` ✅ |
| SHA المحلي | `f8dd779d…` ✅ = خط الأساس |
| SHA البعيد | `f8dd779d…` ✅ |
| commits متقدمة | 0 ✅ |
| شجرة العمل | نظيفة (عدا `docs/STAGE2_…md` محلي + `.DS_Store`) |
| `main` | `0d10904f…` — لم يُمس ✅ |
| PR #1 | `OPEN` · `draft=true` · غير مدموج ✅ |
| CI عند خط الأساس | push ✅ success · PR ✅ success |

**المستندات المطلوبة (5) — جميعها موجودة:**
| المستند | الأسطر | التتبّع |
|---|---:|---|
| `STAGE3_REAL_GM_ACCEPTANCE.md` | 199 | متتبَّع |
| `STAGE2_REAL_HOSTING_DEPLOYMENT_RESULT_AR.md` | 419 | **محلي فقط** — محفوظ ومراجَع |
| `VELNIX_MASTER_REQUIREMENTS_AND_DELIVERY_PLAN_AR.md` | 479 | متتبَّع |
| `VELNIX_REQUIREMENTS_TRACEABILITY_AR.md` | 364 | متتبَّع (140 صفاً، بلا تكرار) |
| `VELNIX_RELEASE_READINESS_CHECKLIST_AR.md` | 213 | متتبَّع |

> ⚠️ **تنبيه دلالي:** تقرير المرحلة 2 محلي فقط. **يُلتزم كوثائق في commit منفصل، ولا يُعدّ إصدار Hosting جديداً.**

---

## 3. هوية الإنتاج

| الفحص | النتيجة | الحالة |
|---|---|---|
| الإصدار `bfcf77a263abc657` ما زال `FINALIZED` | نعم | ✅ |
| عدد الإصدارات | 2 (المعتمد + يتيم `CREATED` من 12:14Z) | ✅ |
| `web.app` يخدم البايتات المعتمدة | `main.dart.js` = `754eedf3…` مطابق | ✅ |
| استجابة الأصل | HTTP 200 | ✅ |
| **عدد الأعضاء** | **1** | ✅ |
| توزيع الأدوار | `{generalManager: 1}` | ✅ |
| المدير العام: `active` | `true` | ✅ |
| المدير العام: `approvalStatus` | `approved` | ✅ |
| `authorizationVersion` | 1 | ✅ |
| **عدد المديرين العامين** | **1** — لا تكرار ولا مدير إضافي | ✅ |
| `joinRequests` | 0 | ✅ |
| `auditEvents` | 1 · `member.google_bootstrap` | ✅ لم يتغيّر |
| **الطلبات في المشروع** | **0** | ✅ |
| مستخدمو Auth | 1 · `google.com` · `emailVerified=true` · غير معطّل | ✅ |

**⛔ لم يُعدَّل المدير العام، ولم يُعَد اعتماد أي طلب، ولم تُنفَّذ إعادة تهيئة.**

---

## 4. مصفوفة القبول — الجزء A

| ID | المتطلب | المتوقع | الفعلي | الدليل | الحالة |
|---|---|---|---|---|---|
| A1 | هوية Git = خط الأساس | متطابقة | متطابقة | `rev-parse` + `ls-remote` | ✅ **PASS** |
| A2 | شجرة نظيفة / main / PR | سليمة | سليمة | `status`, `ls-remote`, `gh pr` | ✅ **PASS** |
| A3 | المستندات الخمسة | موجودة | موجودة | `ls -la` | ✅ **PASS** |
| A4 | إصدار Hosting بلا تعديل | `FINALIZED` واحد | `bfcf77a…` FINALIZED | Hosting API قراءة فقط | ✅ **PASS** |
| A5 | البايتات المعتمدة تُخدَم | مطابقة | `754eedf3…` | `curl` + `shasum` | ✅ **PASS** |
| A6 | أصل الإنتاج `web.app` | 200 | 200 | `curl -I` | ✅ **PASS** |
| A7 | هوية GM واحدة نشطة ومعتمدة | 1 / active / approved | 1 / true / approved | Firestore قراءة فقط | ✅ **PASS** |
| A8 | لا مدير/مستخدم مكرر | 1 | 1 | Firestore + Auth قراءة فقط | ✅ **PASS** |
| A9 | `ReCaptchaEnterpriseProvider` نشط | enterprise | `enterprise` | `localStorage FlutterFire` | ✅ **PASS** |
| A10 | أصل App Check | `web.app` | `https://velnix-6c1a2.web.app` | `location.origin` | ✅ **PASS** |
| A11 | **استبدال رمز App Check الحقيقي** | 200 | **200** | `exchangeRecaptchaEnterpriseToken` | ✅ **PASS** |
| A12 | `joinSession` للمدير المعتمد | approved | — | يتطلب جلسة المالك | ⛔ **BLOCKED** |
| A13 | `me` يعيد الدور | generalManager | — | يتطلب جلسة المالك | ⛔ **BLOCKED** |
| A14 | `dashboardStats` ينجح | نجاح | — | يتطلب جلسة المالك | ⛔ **BLOCKED** |
| A15 | UID الجلسة = مستند العضوية | متطابق | — | يتطلب جلسة المالك | ⛔ **BLOCKED** |
| A16 | **App Check صالح + خارج جلسة → `me`** | unauthenticated | **`functions/unauthenticated` [401]**، 265ms | استدعاء SDK حقيقي من جلسة معزولة | ✅ **PASS** |
| A17 | **بلا جلسة + بلا App Check → `me`** | 401 | **401 UNAUTHENTICATED** | `curl` | ✅ **PASS** |
| A18 | **App Check مزيّف → `me`** | مرفوض | **401 UNAUTHENTICATED** | `curl` | ✅ **PASS** |
| A19 | **مصادقة مزيّفة + App Check مزيّف** | مرفوض | **401 UNAUTHENTICATED** | `curl` | ✅ **PASS** |
| A20 | **مصادقة صحيحة + بلا App Check** | 401/permission-denied | — | يتطلب جلسة المالك | ⚠️ **NOT TESTED** |
| A21 | منع قراءة Firestore مباشرة (غير مصادَق) | PERMISSION_DENIED | **PERMISSION_DENIED ×4** | `orders`, `members`, `joinRequests`, `settings` | ✅ **PASS** |
| A22 | جرد الدوال المنشورة | 22 + 1 = 23 | **23** (22 `europe-west1` + 1 `us-central1`) | `functions:list` | ✅ **PASS** |
| A23 | تشغيل `nodejs22` + حساب التشغيل | كما هو | `nodejs22` · `velnix-runtime-internal@` | `functions:list` | ✅ **PASS** |
| A24 | مطابقة سجل المستودع | متطابق | متطابق | مقارنة `config/first-internal-deploy.json` | ✅ **PASS** |
| A25 | الـ12 غير المنشورة غير تشغيلية | لا تُعامل كعاملة | 12 غير منشورة | مقارنة المصدر | ✅ **PASS** |
| A26 | انحدار Dart | — | **329 ناجح / 18 golden** | `flutter test` | ✅ **PASS** (مفصّل في §7) |
| A27 | انحدار Node | — | **128/128** | `npm test` | ✅ **PASS** |
| A28 | انحدار المحاكي | — | **68/68** | `test:emulator` | ✅ **PASS** |
| A29 | ثوابت النشر | — | **4/4** و **23/23** | `first_internal_deploy` · `operational_readiness` | ✅ **PASS** |
| A30 | تنسيق/تحليل/أسرار/تدقيق | نظيف | نظيف · 423 ملفاً 0 نتائج · 0 ثغرة | فحص المستودع | ✅ **PASS** |

**❌ لا يوجد أي FAIL. ⛔ 5 بنود BLOCKED، ⚠️ 1 NOT TESTED — كلها تتطلب جلسة المالك.**

---

## 5. الدليل الحاسم — App Check + السالب

### 5.1 الاستبدال الحقيقي للرمز (جلسة معزولة جديدة)
```
POST google.com/recaptcha/enterprise/reload?k=<site key>              → 200
POST content-firebaseappcheck…/exchangeRecaptchaEnterpriseToken      → 200
POST google.com/recaptcha/enterprise/clr?k=<site key>                → 200
```
نوع المزوّد كما سجّله SDK: **`enterprise`** · طول مفتاح الموقع: 40 · لا Classic/v3.

### 5.2 الاختبار السالب الإيجابي — App Check صالح + غير مسجَّل
نفِّذ داخل المتصفح (بلا كشف أي رمز؛ سُجِّل **الطول فقط** = 954):

| الخطوة | النتيجة |
|---|---|
| `initializeAppCheck` بـ`ReCaptchaEnterpriseProvider` | ✅ نجح |
| رمز App Check حقيقي | ✅ **مُستبدَل، الطول 954** |
| استدعاء `me` للقراءة فقط | ⛔ **`functions/unauthenticated` [401]** |
| الزمن | 265 ms |

⇒ **App Check صالح + بلا جلسة ⇒ يُرفض.** هذا يثبت أن Flow مفروض قبل الفحص.

### 5.3 رفض Firestore المباشر
| المسار | النتيجة |
|---|---|
| `orders/<probe>` | **403 PERMISSION_DENIED** |
| `members` (list) | **403 PERMISSION_DENIED** |
| `joinRequests` (list) | **403 PERMISSION_DENIED** |
| `settings/system` | **403 PERMISSION_DENIED** |

---

## 6. جرد الدوال — غير تشغيلية صراحةً

**23 منشورة** = 22 `europe-west1` + `orderEventNotice` في `us-central1` · `nodejs22` · `velnix-runtime-internal@velnix-6c1a2.iam.gserviceaccount.com` · مطابقة تامة لسجل المستودع.

**✅ منشورة وكلها متاحة لرحلة GM:** `createOrder`, `getOrder`, `updateOrder`, `changeOrderStatus`, `searchOrders`, `listAudit`, `listNotices`, `markNoticeRead`, `joinSession`, `me`, `dashboardStats` (+11 أخرى)

**⛔ 12 غير منشورة — لا تُعامل كتشغيلية إطلاقاً:**
`sendOrderToDelivery` · `resolveDispatchException` · `assignCompany` · `saveCompany` · `archiveCompany` · `restoreCompany` · `testCompanyConnection` · `registerDevice` · `unregisterDevice` · `pushNotice` · `deliveryWebhook` · `reconcileDeliveryStatuses`

**⇒ لا يمكن إرسال شحنة لأي شركة، ولا FCM، ولا مزامنة مجدولة.**

---

## 7. الانحدار — مميَّز حسب النوع

| النوع | الأمر | النتيجة |
|---|---|---|
| تنسيق | `dart format --set-exit-if-changed` | ✅ 50 ملفاً، 0 تغيير |
| تحليل ساكن | `flutter analyze` | ✅ No issues |
| أسرار | `check_secrets.py` | ✅ 423 ملفاً، **0 نتائج** |
| إعدادات | `test_runtime_config.py` / `test_firebase_setup.py` | ✅ OK / OK |
| **وحدات محلية** | `flutter test` | ✅ **329 ناجح** |
| **وحدات محلية** | `npm test` | ✅ **128/128** |
| **محاكي** | `test:emulator` | ✅ **68/68** |
| **ثوابت نشر** | `first_internal_deploy` / `operational_readiness` | ✅ **4/4** و **23/23** |
| تدقيق إنتاجي | `npm audit --omit=dev` | ✅ **0 ثغرة** |
| **قبول Web حقيقي** | §5 أعلاه | ✅ App Check PASS + سالب PASS |

### الإخفاقات الـ18 — موثّقة بلا إخفاء
| البند | القيمة |
|---|---|
| العدد | **18** |
| **نوعها** | **كلها** مقارنات بكسل للصور الذهبية (`goldens/`) |
| نسب الاختلاف | 1.00% و 5.31% |
| **أساس Linux** | **CI أخضر** عند نفس الـSHA ⇒ خاصة بـmacOS |
| الإجراء | ❌ **لم تُعَد توليد الصور الذهبية** — خط أساس Linux محفوظ |

> ⛔ **لم يُضعَّف أي تأكيد أمني.** نجاح المحاكي **لا** يُعامَل كقبول إنتاجي.

---

## 8. الجزء B — خطة الطلب الاصطناعي الواحد (جاهزة، غير منفَّذة)

### 8.1 الوسم
```
STAGE3_ACCEPTANCE_20261016T214135Z
```
(طول 34 · صالح كـ`requestKey`: `^[a-zA-Z0-9_-]{16,80}$` ✅)

### 8.2 حمولةFixture — مُتحقَّق منها بالمُحاكِي الحقيقي دون شبكة
```json
{
  "customer":    "STAGE3_ACCEPTANCE_20261016T214135Z",
  "phone":       "0000000000",
  "city":        "اختبار آلي",
  "area":        "منطقة اختبار",
  "address":     "عنوان اصطناعي للاختبار فقط — غير حقيقي",
  "description": "STAGE3_ACCEPTANCE_20261016T214135Z",
  "extraPhone":  "",
  "note":        "STAGE3_ACCEPTANCE_20261016T214135Z",
  "quantity":    1,
  "amount":      "0.000",
  "paymentMethod":"عند الاستلام",
  "requestKey":  "STAGE3_ACCEPTANCE_20261016T214135Z"
}
```

**نتيجة التحقق:** `validateOrderFields()` **قبِل** الحمولة · `amountMinor = 0` · `phone = 0000000000` ✅

### 8.3 قيود مُتحقَّق منها
| المتطلب | التحقق |
|---|---|
| هاتف اصطناعي | `0000000000` ⇒ يطابق `^\+?[0-9]{7,15}$` ✅ |
| كمية 1 | عدد صحيح 1..10000 ✅ · حدّ الواجهة 5 محارف ✅ |
| مبلغ 0.000 JOD | `amountMinor = 0` ✅ · حدّ الواجهة 11 محرف ✅ |
| لا شركة | الخادم يفرض `companyId=null` |
| لا تتبع | الخادم يفرض `trackingNumber=null`, `remoteStatus=null` |
| `hasDelivery=false` | الخادم يفرضها |
| `dispatchState` | الخادم يفرض `idle` |
| المسار الداخلي | `created → review → preparing → ready → delivered` — **مسموح للمدير العام** (تحقّق بدون شبكة) |
| الإكمال | `completionSource=internal`؛ `delivered` نهائية |

> **مستلزم من الخادم تلقائياً:** `barcodeValue = VNX-<id>` · `revision=0` · `status=created`

### 8.4 تسلسل التنفيذ المقترح (بعد الموافقة فقط)
1. تأكيد نفس جلسة GM ونفس `web.app`
2. `createOrder` **مرة واحدة** مع الوسم · **لا إعادة عند الغموض**
3. `getOrder` للقراءة الخلفية
4. `updateOrder` — **الملاحظات فقط**
5. `searchOrders` بالوسم بالضبط
6. `changeOrderStatus` ×4 بتأكيد الإكمال الداخلي
7. `listAudit` + أحداث الطلب
8. `listNotices` بمهلة محدودة (60 ثانية) → `markNoticeRead` **لذلك الإشعار فقط**
9. **منع القراءة المباشرة:** `getDoc(orders/{id})` و `getDocs(orders)` ⇒ متوقع `permission-denied`
10. **منع الكتابة المباشرة:** تحديث الملاحظات **بنفس القيمة المحفوظة** ⇒ متوقع `permission-denied`
11. تأكيد عدم وجود شحن ولا شركة ولا تواصل

**الإبقاء:** يُحتفظ بالطلب الاصطناعي وسجلاته — **لا حذف ولا إخفاء**.

---

## 9. ⛔ بوابة موافقة الجزء B

**لم يُنفَّذ أي كتابة إنتاجية.** لم يُنشأ طلب، ولم تُعدَّل عضوية، ولم يُغيَّر سجل.

### المطلوب منك (قراران)

**قرار 1 — التحققات المعمَّلة (لا كتابة):**
افتح `https://velnix-6c1a2.web.app` بعد تسجيل Google، ثم شغّل في **Console المتصفح** هذا السكربت (يطبع نتائج منزوعة السرّ فقط — **لا يطبع أي رمز ولا UID ولا بريد**):

```js
(async () => {
  const out = {};
  try {
    const [core, fn, ac] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js'),
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app-check.js')
    ]);
    const app = core.getApps().length ? core.getApp() : core.initializeApp();
    const fns = fn.getFunctions(app, 'europe-west1');
    const call = async (n, d = {}) => {
      const t = performance.now();
      try { const r = await fn.httpsCallable(fns, n)(d);
        return { ok: true, ms: Math.round(performance.now() - t), data: r.data }; }
      catch (e) { return { ok: false, code: e.code, ms: Math.round(performance.now() - t) }; }
    };
    out.joinSession = await call('joinSession');
    out.me = await call('me');
    if (out.me.ok) out.me.data = { role: out.me.data.role, active: out.me.data.active };
    out.dashboardStats = await call('dashboardStats');
    if (out.dashboardStats.ok) out.dashboardStats.data = 'received';
    // negative: same session, no App Check
    const fns2 = fn.getFunctions(app, 'europe-west1');
    try { const r = await fn.httpsCallable(fns2, 'me')({}); out.negNoAppCheck = { ok: true, unexpected: true }; }
    catch (e) { out.negNoAppCheck = { ok: false, code: e.code }; }
    // direct Firestore reads must be denied
    const fs = await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js');
    const db = fs.getFirestore(app);
    try { await fs.getDoc(fs.doc(db, 'orders', 'PROBE')); out.directRead = { denied: false }; }
    catch (e) { out.directRead = { denied: true, code: e.code }; }
    try { await fs.getDocs(fs.collection(db, 'orders')); out.directList = { denied: false }; }
    catch (e) { out.directList = { denied: true, code: e.code }; }
  } catch (e) { out.error = String(e).slice(0, 120); }
  console.log('VELNIX_ACCEPTANCE', JSON.stringify(out));
})();
```
**المتوقع:** `joinSession.ok=true` · `me.role=generalManager` · `dashboardStats.ok=true` · `negNoAppCheck.code` rejected · `directRead.denied=true` · `directList.denied=true`.

**قرار 2 — تفويض الجزء B:** إنشاء **طلب اصطناعي واحد** بالوسم أعلاه.

---

## 10. البلوكرات المتبقية

| # | البلوكر | النوع | الحالة |
|---|---|---|---|
| 1 | التحققات المعمَّلة A12–A15، A20 | جلسة المالك | ⛔ **بانتظار المالك** |
| 2 | **`firebaseapp.com` سيفشل عند App Check** — المفتاح يسمح بـ`web.app` فقط | أمان/تشغيل | مفتوح — **استخدم `web.app` حصراً** |
| 3 | 12 دالة غير منشورة (شحن/أجهزة/جدولة) | نطاق | خارج الجزء B |
| 4 | تكامل Click محجوب (4 فجوات) | خارجي | المرحلة 7 |
| 5 | iOS/Android غير موقَّعين، لا أجهزة | خارجي | المرحلة 5 |
| 6 | لا مراقبة/احتفاظ/استعادة | عمليات | لاحق |
| 7 | 18 اختبار golden على macOS | بيئي | CI المرجع — غير حاجب |

---

## 11. قرار جاهزية المرحلة 4

### ⛔ **NOT READY** — غير مكتمل

الجزء A **لا يصحّح** BLOCKED. **لا تُعلن اكتمال Stage 3 قبل تنفيذ الرحلة المعتمدة كاملة.**

| ما ينقص لإعلان الجاهزية |
|---|
| تنفيذ قرار 1 (التحققات المعمَّلة) والتأكد من `joinSession` / `me` / `dashboardStats` |
| **موافقة صريحة على الجزء B** ثم تنفيذ الرحلة الكاملة والتحقق منها |
| إثبات منع القراءة **و** منع الكتابة المباشرة من جلسة العميل الحقيقية |

**الجزء A أثبت** أن الاستضافة حية، وأن App Check Enterprise يعمل فعلياً على النطاق الحقيقي، وأن Backend يرفض كل شيء غير مصرَّح به. **أثبت ذلك — لكنه ليس قبول GM الكامل.**

---

## 12. تغييرات مطلوبة

| النوع | الحالة |
|---|---|
| تغيير شيفرة | ❌ **لا شيء** — لم يُكتشف عيب |
| تغيير بيئة إنتاج | ❌ **لا شيء** |
| إعادة نشر Hosting | ⛔ **لا** — الإصدار `bfcf77a263abc657` لم يُمس |
| ملاحظة | عيب توثيق البصمة (تبعية `LC_ALL`) — مقترح إصلاحه في `docs/STAGE2_WEB_HOSTING_RELEASE_AR.md` عند أول تحديث |

---

**المراجع:**
[الإجراء المعتمد](STAGE3_REAL_GM_ACCEPTANCE.md) ·
[نتيجة المرحلة 2](STAGE2_REAL_HOSTING_DEPLOYMENT_RESULT_AR.md) ·
[الخطة الرئيسية](VELNIX_MASTER_REQUIREMENTS_AND_DELIVERY_PLAN_AR.md) ·
[المصفوفة](VELNIX_REQUIREMENTS_TRACEABILITY_AR.md) ·
[الجاهزية](VELNIX_RELEASE_READINESS_CHECKLIST_AR.md)