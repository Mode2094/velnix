# Velnix — مراجعة أمنية لمِقياس قبول الجزء B

**التاريخ:** 2026-10-17
**الفرع:** `audit/production-readiness`
**خط الأساس:** `d6eb2d78938a9d8c3ad5dd62db3342b879358a58`
**الوسم المعتمد:** `STAGE3_ACCEPTANCE_20261016T214135Z`

> ⛔ **لم يُنفَّذ الجزء B.** لم يُنشأ الطلب الاصطناعي. لم يُنشر شيء ولم تُعدَّل أي خدمة.
> ⛔ **حُذف `scripts/stage3_partb_harness.js` بالكامل.** لم يُعَد استخدام `fetch().then(eval)` في جلسة GM.

---

## 1. الحكم على المِقياس السابق

**كان غير صالح للتنفيذ — والرفض owner's صحيح.** اكتشفتُ **12 عيباً**، 7 منها مؤكَّدة في_TASK و5 اكتشفتها بنفسي.

| # | العيب | الدليل | الأثر |
|---|---|---|---|
| 1 | `joinSession`/`me`/`dashboardStats` بلا `await` | السطر 105/110/125: `call()` تُعيد Promise | `js.ok` = `undefined` ⇒ البوابة تفشل دائماً |
| 2 | وحدات Firebase مُستوردة منفصلة قد لا تتشارك الحالة | لا يوجد دليل ثانٍ على المشاركة | غير مُثبَت |
| 3 | قراءة أحداث قديمة | السطر 192 يقرأ `go2.data.events` المأخوذة **قبل** الانتقالات | لا يُتحقق من `status_changed` |
| 4 | فحص المنع ضعيف | السطر 235: `denied: true` **لأي** خطأ | يقبل `failed-precondition` كمنع |
| 5 | الاستئناف يُعلِّم `PASS` خطأً | السطر 171: `if (o.status !== from) … 'PASS'` | قد يمرّ انتقال لم يُنفَّذ |
| 6 | لا يتوقف عند فشل أمني | السطران 239/250: يسجّل فقط | يكمل اختبارات أمنية بعد انهيار |
| 7 | تقرير الانهيار يضيع contextual | السطر 258: `orderId: null` دائماً | **يفقد معرّف الطلب المنشأ** |
| 8 | **`updateOrder` بحمولة جزئية** | `validateOrderFields` يفرض كل الحقول | **التحرير كان سيفشل دائماً** |
| 9 | **`revision` غير مُرسَل** | يفرض `req.data.revision` تطابق الحالي | **فشل `aborted` دائماً** |
| 10 | قراءة `e.type` | الأحداث تستخدم `action` | `undefined` ⇒ فحص خاطئ |
| 11 | التأكيد على `amountMinor` | DTO يعرض `amount` فقط | `undefined === 0` ⇒ فشل |
| 12 | تجنّب `hasDelivery` | DTO لا يعرضه أصلاً | تحقق مستحيل |

> **الأخطاء 8–11 مكتشفة بالاختبار (§5) وليست بالقراءة فقط.**

---

## 2. البنية المختارة — الخيار B

| الخيار | الحالة | السبب |
|---|---|---|
| A. مسار قبول داخل تطبيق Flutter | ❌ **مرفوض** | يتطلب **نشر Hosting جديد** — غير مصرَّح به |
| **B. المالك يقود واجهة الإنتاج + تحقق خلفي للقراءة فقط** | ✅ **مُختار** | **بدون نشر، وبدون كود في جلسة GM** |
| نقطة اختبار إنتاجية غير مصادَق عليها | ❌ **ممنوعة** | يعيد تقديم الخطر |
| Admin backdoor | ❌ **ممنوع** | — |
| `fetch().then(eval)` | ❔ **مُسحَب** | كود غير مُراجَع في جلسة مُصادَق عليها |

**لم يُعدّال أي شيفرة تطبيق.** هذا مهم: رحلة القبول تمر عبر **مسار واجهة الإنتاج الحقيقي** — وهو ما نريد قبوله أصلاً، لا مساراً جانبياً مكتوباً.

### هل يُستخدم نسخة Firebase المُصادَق عليها الموجودة؟

| السند | الحالة |
|---|---|
| هل يحتاج الـverifier جلسة GM؟ | **لا** — قراءة فقط عبر جلسة gcloud |
| هل ينفّذ المالك الكتابة؟ | **نعم** — عبر **واجهة الإنتاج نفسها** بإصبعه |
| هل تُستخدم نسختي Firebase معاً؟ | **لا longer** — أُزيل المِقياس الذي كان يفعل ذلك |

**الجواب: لم يعد هناك أي كود يفتح جلسة GM.** التفاعل happening في واجهة الإنتاج التي يملكها العميل بالفعل.

---

## 3. العقود المُتحقَّق منها فعلياً (من المصدر، لا بالتخمين)

| الـcallable | العقد الفعلي |
|---|---|
| `joinSession` | بلا payload ⇒ `{status:'approved'\|'pending'\|'disabled'}` |
| `me` | ⇒ `{id,name,role,active,permissions,…}` |
| `dashboardStats` | ⇒ عدّادات |
| `createOrder` | **كل الحقول إلزامية** + `requestKey` بنمط `^[a-zA-Z0-9_-]{16,80}$`. يُنشئ idempotency بـ`sha256(uid+':'+key)` ⇒ **إعادة الاستدعاء تُعيد نفس الطلب**، ودفع مختلف تحت نفس المفتاح ⇒ `already-exists` |
| `getOrder` | ⇒ `{order, events}`؛ DTO فيه **`amount`** ولا `amountMinor`، ولا `hasDelivery`؛ الأحداث فيها **`action`** |
| `updateOrder` | **حمولة كاملة + `revision`** تطابق الحالي ⇒ وإلا `aborted`. يزيد `revision` ويُسجّل `order.edited` |
| `searchOrders` | `{query}` + فلاتر اختيارية؛ بحث بالاسم/الهاتف/المعرّف |
| `changeOrderStatus` | `{id,status}`؛ `delivered` ⇒ `completionSource:'internal'` تلقائياً |
| `listAudit` | ⇒ سجلّكل الطلبات الطلبات المرئية |
| `listNotices` | ⇒ `{items:[{id,orderId,read,…}]}` |
| `markNoticeRead` | `{id}`؛ يقرأ فقط إن كان `recipientId` = المستخدم |

### ثوابت حراسة مُتحقَّق منها
- الخادم يفرض `companyId:null`, `trackingNumber:null`, `remoteStatus:null`, `hasDelivery:false`, `status:'created'`, `revision:0`, `dispatchState:'idle'` — **مُختبَر بت(inputs) مزوَّرة**
- الانتقالات: `created→review→preparing→ready→delivered`؛ `delivered` نهائية — **مُختبَر**
- الحقول `shippingStatus`, `Order_ID`, `collectedAmount`, `companyId`, `trackingNumber`, `status` المرسَلة من العميل **تُتجاهل تماماً**

---

## 4. أداة التحقق الجديدة — للقراءة فقط

`functions/scripts/stage3_partb_verify.js`

| الخاصية | الحالة |
|---|---|
| مسارات كتابة/إنشاء/حذف/استدعاء callable | **صفر** |
| عدد طلبات القراءة | 7 (`GET` فقط) |
| استخراج/طباعة UID أو بريد أو رمز | **لا** — بل لا يُطلب حقل UID أصلاً |
| المشروع مثبَّت في الشيفرة | `velnix-6c1a2` |
| يعمل على الإنتاج | ✅ مُجرَّب: A1–A3 PASS، B1 PASS، الباقي `NOT TESTED` لأن الطلب لم يُنشأ |

### نتيجة التشغيل الحالية (قراءة فقط، بلا كتابة)
```
A1 exactly one generalManager member        PASS   1 member, role=generalManager
A2 GM active and approved                   PASS   active=true approvalStatus=approved
A3 exactly one Auth user, google-linked     PASS   1 user, providers=google.com
B1 exactly one order carries the tag        PASS   0 tagged of 0 total
B2 idempotency records                      NOT TESTED (no order yet)
B3..B6 journey / workflow / audit / notice  NOT TESTED (no order yet)
F1 client-SDK Firestore denial              NOT TESTED (owner browser only)
```

---

## 5. نتائج القبول على المحاكي — 11/11

`functions/test/emulator/stage3_partb_journey.test.js`

| # | الاختبار | النتيجة |
|---|---|---|
| 1 | `signed out cannot reach any protected callable` | ✅ |
| 2 | `authenticated GM passes the gate callables` | ✅ |
| 3 | `non-GM roles are denied GM-only scope` | ✅ |
| 4 | `createOrder forces internal-only fields (forged input ignored)` | ✅ |
| 5 | **`partial updateOrder rejected`** (يثبت العيب 8) | ✅ |
| 6 | `full-payload update with matching revision succeeds, bumps revision` | ✅ |
| 7 | **`client DTO exposes amount, never amountMinor`** (يثبت العيب 11) | ✅ |
| 8 | **`same requestKey never creates a second order`** (3 استدعاءات ⇒ نفس المعرّف) | ✅ |
| 9 | `journey: create, edit, search, four transitions` (revision=5) | ✅ |
| 10 | `terminal internal order refuses further change` | ✅ |
| 11 | `invalid transition target refused` | ✅ |

**المجموعة الكاملة: 79/79** (68 سابقة + 11 جديدة).

### عيوب إضافية وجدتها الاختبارات
| الاكتشاف | التفصيل |
|---|---|
| حدّ `requestKey` | مفروض صارم: 16–80 محرفاً. **اختباراتي الأولى استُعملت بمفاتيح أقصر ورفضها الخادم** — سلوك صحيح |
| رسائل الخطأ | `firebaseError` تُترجم الرموز الداخلية إلى رسائل عربية ⇒ يجب تأكيد **الرمز** لا الرسالة |
| `hasDelivery` | ليس في DTO — يجب تأكيده على السجلّ من جهة الخادم |

---

## 6. الانحدار بعد الإصلاح

| البوابة | النتيجة |
|---|---|
| `dart format` | ✅ 50 ملفاً، 0 تغيير |
| `flutter analyze` | ✅ No issues |
| `check_secrets` | ✅ 425 ملفاً، **0 نتائج** |
| `npm audit --omit=dev` | ✅ **0 ثغرة** |
| وحدات Functions | ✅ **128/128** |
| المحاكي | ✅ **79/79** |
| Flutter | ✅ **329 ناجح** / 18 golden خاصة بـmacOS |

**لم يُضعَّف أي تأكيد أمني. أساس goldens على Linux محفوظ.**

---

## 7. التفاعل الآمن المطلوب من المالك — بدون أي كود

**لا سطر واحد من JavaScript.** كل شيء عبر واجهة الإنتاج.

### الخطوة 0 — تحقّق مسبق (أقرأه أنا)
```bash
cd <velnix-repo>
node functions/scripts/stage3_partb_verify.js
```
يُظهر: GM واحد نشط ومعتمد · مستخدم Auth واحد · **0 طلبات بالوسم** ⇒ آمن للبدء.

### الخطوة 1 — إنشاء الطلب (واجهة الإنتاج)
1. افتح `https://velnix-6c1a2.web.app` وسجّل دخول Google بحساب المدير العام.
2. من **الرئيسية** ⇒ زر **إضافة طلب**.
3. املأ بالحرف:
   | الحقل | القيمة |
   |---|---|
   | اسم المستلم | `STAGE3_ACCEPTANCE_20261016T214135Z` |
   | رقم الهاتف | `0000000000` |
   | المحافظة | `اختبار آلي` |
   | المنطقة | `منطقة اختبار` |
   | العنوان | `TEST ONLY — عنوان اصطناعي للاختبار` |
   | وصف الطرد | `INTERNAL TEST — STAGE3_ACCEPTANCE_20261016T214135Z` |
   | الكمية | `1` |
   | المبلغ | `0.000` |
   | طريقة الدفع | `عند الاستلام` |
   | الملاحظات | `INTERNAL TEST — STAGE3_ACCEPTANCE_20261016T214135Z` |
4. **لا تختر شركة توصيل. لا تضف تتبعاً.** احفظ.

### الخطوة 2 — التعديل
افتح الطلب ⇒ **تعديل** ⇒ غيّر **الملاحظات فقط** إلى:
`INTERNAL TEST EDITED — STAGE3_ACCEPTANCE_20261016T214135Z`
احفظ. **لا تغيّر المبلغ ولا المستلم ولا أي حقل آخر.**

### الخطوة 3 — الانتقالات الأربعة (بالترتيب)
من تفاصيل الطلب، كل مرّة:

| الحالة | الزر |
|---|---|
| `created→review` | تحويل إلى **تحت المراجعة** |
| `review→preparing` | تحويل إلى **قيد التجهيز** |
| `preparing→ready` | تحويل إلى **جاهز** |
| `ready→delivered` | **إكمال الطلب الداخلي** |

في الخطوة الأخيرة ستظهر نافذة **«تأكيد إكمال الطلب الداخلي»** ⇒ اضغط **«تأكيد الإكمال»**.

### الخطوة 4 — الإشعار
تبويب **الإشعارات** ⇒ سيظهر إشعار للطلب ⇒ افتحه (يعلَّم كمقروء).

### الخطوة 5 — تحقّق خلفي (أقرأه أنا)
```bash
node functions/scripts/stage3_partb_verify.js
```

**النتيجة المتوقعة:** `created` + `edited` + `status_changed×4` · `completionSource=internal` · `companyId=null` · لا تتبع · `revision=5` · إشعار واحد مقروء.

---

## 8. اختبار منع Firestore المباشر — يحتاج خطوة منفصلة

المِسند الذي أعدّه **لا يستطيع** ملاحظة سلوك عميل Firestore؛ ذلك يُرى من متصفحك فقط.

**إذا أردت إثباته** (اختياري، بلا كتابة):
افتح **IndexedDB** في DevTools على `velnix-6c1a2.web.app` — لا يمكنني قراءة قيمته. بدل ذلك:

**الطريقة الموصى بها:** بعد الخطوة 4، أخبرني بقراءة الواجهة فقط. إن ظهر خطأ «غير مصرَّح» عند فتح تفاصيل الطلب عبر مسار مباشر فهذا دليل؛ أما الإثبات الإيجابي فيحتاج DevTools.

**أو اتركه `NOT TESTED`** — وهو **الأمين والأدق**. لن أدّعي PASS لشيٍّ لم أره.

---

## 9. حالة CI

| التشغيل | SHA | النتيجة |
|---|---|---|
| Push CI `38999226727` | `ffd6784` | ✅ **success** — 4/4 |
| PR CI `38999230354` | `ffd6784` | ✅ **success** — 4/4 |
---

## 10. هل يمكن تنفيذ الجزء B **بدون نشر جديد**؟

### ✅ **نعم — بالكامل.**

| المتطلب | الحالة |
|---|---|
| نشر Hosting جديد؟ | **لا** — غير مطلوب إطلاقاً |
| تغيير شيفرة التطبيق؟ | **لا** — لا يوجد |
| نشر Functions؟ | **لا** |
| المِيعاد غيّر المخطّط؟ | `updateOrder` يرسل الحمولة الكاملة مع `revision` تلقائياً في الواجهة |

**الوظائف الـ23 المنشورة تحوي كل ما تحتاجه الرحلة** (مُتحقَّق منه سابقاً).

---

## 11. البلوكرات المتبقية

| # | البلوكر | النوع |
|---|---|---|
| 1 | **الرحلة لم تُنفَّذ بعد** — بانتظار خطواتك | ⏸️ إجراء المالك |
| 2 | **إثبات منع Firestore من العميل** غير مرصود | ⏸️ `NOT TESTED` — لا يُدّعى PASS |
| 3 | `firebaseapp.com` سيفشل عند App Check | ⚠️ استخدم `web.app` حصراً |
| 4 | 12 دالة غير منشورة | خارج النطاق |
| 5 | 18 golden خاصة بـmacOS | بيئي — CI المرجع |

---

## 12. ملاحظة أمنية عن الاعتماد

⚠️ اعتماد حساب اختبار Click **نُوقش في محادثة سابقة**. أدعوك لتدويره قبل أي اختبار تكامل مستقبلي. لا علاقة له بهذا الإصلاح.

---

## 13. قرار الانتقال

⛔ **متوقف قبل تنفيذ الإنتاج.** أنتظر:

1. تأكيد أنك فهمت أن الجزء B صار بالكامل في واجهة الإنتاج، بلا أي كود.
2. تنفيذ الخطوات 1–4 في متصفحك.
3. تشغيل `node functions/scripts/stage3_partb_verify.js` وإرسال الناتج.

**لم يُنشأ أي طلب. `orders = 0` · `auditEvents = 1` · `idempotency = 0` · `notices = 0`.**

---

**المراجع:** [الإجراء المعتمد](STAGE3_REAL_GM_ACCEPTANCE.md) · [نتيجة المرحلة 3 الجزء A](STAGE3_REAL_GM_ACCEPTANCE_RESULT_AR.md) · [نتيجة النشر](STAGE2_REAL_HOSTING_DEPLOYMENT_RESULT_AR.md)