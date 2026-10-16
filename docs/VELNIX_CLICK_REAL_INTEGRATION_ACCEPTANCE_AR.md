# Velnix — خطة قبول التكامل الحقيقي مع Click Delivery

**التاريخ:** 2026-10-16
**الفرع:** `audit/production-readiness`
**SHA:** `126fd612ebe7759aceaeb6589e89e76a2142b549`
**مشروع Firebase:** `velnix-6c1a2`
**الحالة:** **تحضير فقط — لم يُنفَّذ أي اتصال بـ Click**

> ⚠️ **قيود مُلزِمة على هذه الوثيقة**
> لم يُجرَ أي اتصال بـ `admin.clickdelivery.org`. لم تُنشأ شحنة، ولم يُلغَ طلب، ولم تُفعَّل مزامنة مجدولة، ولم تُطلب بيانات اعتماد. كل ما يلي **خطة** تتطلب موافقة المالك قبل أي تنفيذ.

---

## 1. الخلاصة الحاكمة

**تكامل Click غير مُنفَّذ — وهو مُعطَّل عمداً في الشيفرة، لا نتيجة نقص عمل.**

في `functions/src/click_delivery.js`:

```js
const blocked=()=>{throw Error('click_contract_incomplete');};
// Quarantined adapter: there is no production path for shipment creation,
// polling, removal or an invented /health endpoint while responses are unknown.
const clickDelivery=Object.freeze({health:blocked,create:blocked,status:blocked});
```

وفي `functions/src/providers.js`:

```js
function requireOperationalProvider(company){
  const adapter=providerFor(company);
  if(company.provider===CLICK_PROVIDER)throw Error('click_contract_incomplete');
  ...
}
```

**النتيجة:** أي شركة `click_delivery_v1` تُرفض عند التشغيل. لا يمكن إنشاء شحنة ولا سحب حالة ولا إلغاء عبر Click في أي بيئة، حتى لو حُفظت إعداداتها. هذه **حماية تصميمية صحيحة** وليست عطلاً.

---

## 2. حالة الأدلة: ما هو مُثبت وما هو غير مُثبت

### 2.1 المصادر الأصلية — ✅ مُسترجَع ومُتحقَّق منه (تحديث 2026-10-16)

**الملفان الأصليان وُجدا على الـMac وتم التحقق منهما بالبصمة:**

| الملف | الموقع | SHA-256 | النتيجة |
|---|---|---|---|
| `ClickApi.postman_collection.json` | `~/Downloads/` | `5070b1e14c4a6831c29bfba3c2f13267ca821b1e895215c109ed9639b0925061` | ✅ **مطابق** |
| `clickdelivery api[1] (2).txt` | `~/Downloads/` | `bc1c465ff57a5f67550fab43b8812217d380e260652c285a20a542c0af6f405f` | ✅ **مطابق** |

طابقت البصمتان القيم المسجَّلة في `docs/evidence/click-delivery-contract.json` **تماماً**، وهذا يثبت أنهما الأصلان الأصيلان.

> 🔒 **لم يُلتزم أيٌّ منهما في Git.** الملف النصي يحتوي قيم `User_Name` و`User_Pass` نموذجية. حُفظت البصمات في `docs/evidence-import/KNOWN_GOOD.sha256` مع تعليمات الاستيراد في `docs/evidence-import/README_AR.md`.

**لماذا هذا مهم:** كل استنتاج في هذه الوثيقة أصبح الآن **مُتحقَّقاً من المصدر** بدل الاعتماد على ملخص مشتق.

### 2.2 ما أكّده الفحص المباشر للأصل

| البند | النتيجة الموثّقة من الأصل |
|---|---|
| Base URL | `https://admin.clickdelivery.org/Client/` |
| عدد عناصر Postman | **2 فقط** — `getorder` و `removeorder` |
| `setorder` في Postman | ❌ **غير موجود** |
| `getorder` | **POST** — جسم: `Order_ID`, `User_Name`, `User_Pass` |
| `removeorder` | **POST** — الجسم نفسه |
| `setorder` — الطريقة | ❌ **غير موثّقة**: `request name: setorder` فقط، بلا `method` |
| رأس المصادقة | `Authorization: client` بنوع `text` — **حرفي وليس Bearer** |
| `body.mode` / `language` | `raw` / `json` |
| رأس `Content-Type` | ❌ **غير موجود** في المجموعة |
| استجابات محفوظة | **0** في Postman، و**0** في الملف النصي |
| بنية الملف النصي | 39 سطراً، كتلتان: عربية ثم إنجليزية |
| أمثلة JSON | **معطوبة بفواصل ناقصة** ⇒ توضيحية فقط، لا تمثّل صيغة السلك |
| التباس اسم المزوّد | العربية «Click» مقابل الإنجليزية «**speed logistic**» |

**التعارضات المؤكدة بسطر محدَّد:**

| الحقل | العربية | الإنجليزية | الحكم |
|---|---|---|---|
| `Ord_Amt` | س14: خُصم قيمة التوصيل **منه** | س35: `order amount + shipping amount` | ⚠️ **يمنع الربط المالي** |
| `Client_Serial` | س8: كود التاجر للشحنة | س29: order number **on your system** | ⚠️ **يمنع idempotency** |

**القيم المنطقية:** `Is_Ord_Exchange` و `Open_Shippment` يظهران كسلسلة **`"True or False"`** — قيمة نائبة نصّية، لا منطقية. **نوع السلك غير محسوم.**

**الاستنتاج الحاسم:** التعارضات ليست سوء فهم في الملخص المشتق — هي **موجودة في المستند الرسمي نفسه**. لذلك لا يمكن تجاوزها هندسياً.

### 2.3 ما لا يمكن إثباته (قائمة `not_documented` الأصلية — 10 بنود)

1. كل مخططات الاستجابة وعلامات النجاح/الخطأ
2. رموز الحالة وأسماء حقولها/أنواعها
3. نقطة webhook وتوقيعها أو ترتيب الأحداث/إصدارها
4. نقطة فحص صحة (health)
5. طريقة HTTP لـ `setorder`
6. عملة `Ord_Amt` ودلالات الرسوم
7. علاقة `Client_Serial`/`Order_ID`/التتبع و idempotency
8. صيغة القيم المنطقية `Is_Ord_Exchange`/`Open_Shippment` على السلك
9. التحصيل الجزئي/المستردات ورسوم الإلغاء
10. عنوان sandbox وبيانات الاعتماد

### 2.4 حقول `setorder` — التأكيد مقابل الفجوة

| الحقل | ما يؤكده المصدر | ما بقي غير مُثبت |
|---|---|---|
| `User_Name` | اسم دخول في الجسم | قيود الترميز، حساب sandbox |
| `User_Pass` | كلمة مرور في الجسم | سياسة توفير آمنة وتدوير |
| `Client_Serial` | نص في المثال | **تعارض دلالة**: العربي «كود التاجر للشحنة» مقابل الإنجليزي «رقم الطلب في نظامنا» |
| `Reciver_Name` | اسم المستلم | الإلزام والحدود |
| `Reciver_Phone` | هاتف كنص | صيغة الدولة، الهاتف الإضافي |
| `Reciver_Address` | عنوان شامل | لا حقول `city`/`area` مستقلة موثقة |
| `Ord_Content` | محتويات الشحنة | الحدود والإلزام |
| `Ord_Quantity` | كمية (العربي يوجب رقمية) | هل عدد صحيح فقط؟ المدى؟ |
| `Ord_Amt` | رقم في المثال | ❌ **تعارض يمنع الربط المالي**: العربي «يُخصم منه رسوم التوصيل» مقابل الإنجليزي «قيمة الطلب + الشحن» |
| `Ord_Note` | ملاحظات | الحدود والإلزام |
| `Is_Ord_Exchange` | اختيار True/False | منطقية أم نص؟ لا افتراض `False` |
| `Open_Shippment` | اختيار True/False | الصيغة ومعنى المرتجعات |

**حقول مطلوبة في `generic_v1` وغير موجودة في Click:** `extraPhone`, `currency`, `paymentMethod`, `idempotencyKey`, `trackingNumber`, `status`, collection/refund/fee، timestamps.

### 2.5 الحالات السبع — تمييز جوهري

`functions/src/shipping_status.js` — التعليق الأصلي:

```js
// Velnix business vocabulary supplied by the client, NOT Click API codes.
// No response parser, external status mapping or financial calculation exists.
const SHIPPING_STATUSES=Object.freeze(['awaitingPickup','carrierWarehouse','outForDelivery',
  'delivered','partiallyDelivered','deferred','cancelled']);
```

| حالة العميل | معرّف Velnix الداخلي | الحالة في المشروع | كود Click المطلوب |
|---|---|---|---|
| قيد انتظار الموافقة | `awaitingPickup` | موجود في الـtaxonomy | ❌ |
| مخزن الشحن | `carrierWarehouse` | موجود | ❌ |
| في الشحن | `outForDelivery` | موجود | ❌ |
| تم التسليم | `delivered` | موجود | ❌ |
| تسليم جزئي | `partiallyDelivered` | موجود مع فصل قيمة الطلب عن التسوية | ❌ |
| مؤجل | `deferred` | موجود | ❌ |
| ملغي | `cancelled` | موجود دون استنتاج رسوم | ❌ |

⚠️ **هذه المعرّفات ليست أكواد Click.** لا يوجد أي كود يملأ `shippingStatus` من Click حالياً. `click_readiness_test.dart:36-37` يتحقق صراحةً من أن `ShippingStatus.parse('1')` و `parse(1)` يعيدان `null` — أي رفض افتراض أي كود غير معروف.

---

## 3. التدقيق التفصيلي حسب المحور

### 3.1 نمذجة الطلب (Request Modeling)

| البند | الحالة | الدليل |
|---|---|---|
| بنية جسم `getorder` | ✅ منفَّذة ومحمية | `getOrderBody()` يفرض `Number.isSafeInteger` موجب وحدود 2000 حرف للاعتماد |
| تثبيت base URL | ✅ منفَّذ | `assertClickUrl` يقارن بـ`CLICK_BASE` بدقة |
| التحقق من الاعتمادات | ✅ منفَّذ | `getOrderBody` يرفض غيرها |
| بنية جسم `setorder` | ❌ **غير موجودة** | لا مسار تنفيذي |
| التحقق من `Ord_Amt` أو `Ord_Quantity` | ❌ **لا يمكن** | التعارض الدلالي يمنع أي تحقق |
| `extraPhone` / عملة / `paymentMethod` | ❌ **غير مدعومة** | حقول `generic_v1` فقط |

### 3.2 المصادقة (Authentication)

- **مؤكد:** `Authorization: client` + `User_Name`/`User_Pass` داخل JSON. **ليس** OAuth ولا Bearer.
- `functions/src/delivery.js` يمنع إرسال `Bearer ${token}` إلى Click صراحةً:
  ```js
  headers:{Authorization:click?'client':`Bearer ${token}`, ...}
  ```
- **لا يوجد** تخزين آمن لـ`User_Name`/`User_Pass` في Click path. `encryptSecret` في `delivery.js` مربوط بـ`companySecrets` العامة؛ Click محجوب قبل ذلك.
- **غياب كامل:** لا OAuth، لا API token، لا HMAC متبادل، لا تدوير.

### 3.3 Idempotency

- **Click:** ❌ **غير موجود وغير ممكن** — علاقة `Client_Serial` بـ`Order_ID` غير موثقة.
- **Velnix داخلياً:** ✅ ممتاز — `lib/` يستخدم idempotency + `dispatchState: sending/needs_review` + `resolveDispatchException`. اختبار المحاكي «idempotent Backend retry preserves one order» **PASS**.
- **الفجوة:** حماية Velnix من الإرسال المكرر **لا تحمي** من ازدواج شحنة **داخل Click**، لأن `Client_Serial` غير مثبت كـidempotency key.

### 3.4 معالجة الأخطاء والمهل وإعادة المحاولة

| البند | الحالة |
|---|---|
| مهلة 12 ثانية | ✅ `delivery.js` `setTimeout(()=>control.abort(),12000)` |
| `redirect:'error'` | ✅ يمنع SSRF عبر إعادة التوجيه |
| حد حجم 1MB مع بث | ✅ يمنع استنزاف الذاكرة |
| `Retry-After` / 429 | ❌ **غير مُنفَّذ** — لا سياسة موثّقة |
| حدود معدل (rate limits) | ❌ **غير معروفة** |
| إعادة محاولة `setorder` | ❌ **محظورة عمداً** — الشحن غير المؤكد يبقى `needs_review` |

**سلوك الفشل الآمن مُثبت:** فشل التجهيز قبل `transport` يُعيد الطلب إلى `idle` مع audit؛ بدء طلب ثم انقطاع يُبقي `needs_review` و**يمنع** محاولة ثانية. هذا يمنع الازدواج.

### 3.5 المطابقة (Reconciliation)

- `functions/src/remote.js` يرفض أي `click_delivery_v1` صراحةً:
  ```js
  if(companyDoc.data().provider==='click_delivery_v1')
    return {ignored:'unconfirmed_provider_contract'};
  ```
- `reconcileDeliveryStatuses` مجدول كل 15 دقيقة — **غير منشور وغير مفعّل**.
- **حدود:**
  - polling محدود بـ**100 شحنة/دورة**
  - `remoteCanAdvance` يمنع التراجع في الحالة ويحمي `delivered`/`returned`/`cancelled`
  - `deferred` قد يستأنف، `partiallyDelivered` قد يتغير — **بلا ترتيب رقمي أو terminal موثّق**
  - منع التحديث المتأخر يعتمد على **تكرار `eventId`** فقط، **بلا طابع زمني أو إصدار موثّق** — هذه فجوة موثّقة في `CLICK_DELIVERY_QUESTIONS_AR.md#14`

### 3.6 سجلات التدقيق (Audit)

- ✅ `audit('order.remote_status', actor, orderId, {raw, mapped, companyId}, tx)` لكل تحديث حالة.
- ✅ `deliveryInbox/{companyId}/events/{eventId}` بـ`tx.create` لضمان التفرّد.
- ✅ `remoteStatus` يُحفظ خاماً منفصلاً عن `status` المسقط.
- ⚠️ **فجوة:** لا يوجد `shippingStatus` مملوء من مصدر خارجي؛ الإحصائيات القائمة تقيس دورة الطلب القديمة فقط.

### 3.7 منع التسريب عبر `generic_v1`

✅ **مُنفَّذ ومنتج:** `providers.js` يرفض أي شركة non-Click تستخدم مضيف Click:
```js
else if(new URL(company.apiUrl).hostname==='admin.clickdelivery.org')
  throw Error('click_requires_dedicated_adapter');
```
وكذلك `saveCompany` يرفض تغيير `provider` لشركة لها شحنات سابقة.

---

## 4. فجوات الدليل الحرجة (D4، D7، D9، D10)

هذه العيوب **توقف أي ربط حقيقي**، ولا يمكن حلّها هندسياً — فقط بإجابة الشركة:

| # | الفجوة | لماذا لا يمكن تجاوزها هندسياً | سؤال الشركة |
|---|---|---|---|
| **D4** | طريقة HTTP لـ `setorder` | لا يمكن بناء الطلب دون اختيار GET/POST — التخمين يُنتج فشلاً صامتاً أو شحنة مكررة | #2 |
| **D7** | تعارض دلالة `Ord_Amt` | أي تحويل للمبلغ سيُرسل قيمة مالية **خاطئة** للعميل | #7 |
| **D9** | لا أكواد حالات | `shippingStatus` لا يمكن ملؤه؛ لا mapping ممكن | #4 |
| **D10** | `Client_Serial` دلالة/تفرّد | لا يمكن توفير idempotency أو ربط التتبع | #5، #6 |

**أسئلة الشركة الجاهزة للإرسال موجودة في** `docs/CLICK_DELIVERY_QUESTIONS_AR.md` (15 سؤالاً مفصّلاً). **لم تُرسل رسالة إلى الشركة.**

---

## 5. إدارة بيانات الاعتماد (منع تسريبها)

**القاعدة المتبعة في هذا التدقيق: لا تُطلب بيانات الاعتماد ولا تُكتب في Git ولا تُمرَّر كوسائط طرفية ولا تُطبع في السجلات.**

| القاعدة | التطبيق |
|---|---|
| التخزين | خزنة أسرار مشفّرة (KMS أو منصة أسرار) خارج المستودع |
| النقل للمالك | قناة مشفّرة منفصلة، **ليس** Git ولا CI artifacts |
| الاستخدام | Backend فقط — **لا تُعاد للتطبيق ولا للتقارير** |
| التدوير | عند الاشتباه بالتسريب |
| الطباعة | ممنوعة؛ الأدوات الحالية تعالج `User_Pass` كسر ولا تسجله |

⚠️ **ملاحظة أمنية صريحة:** تم مشاركة حساب اختبار Click **في محادثة سابقة**. بما أن الاعتمادات نُوقشت خارج قناة سرّية، **يُنصح المالك بتدويرها قبل أي اختبار حقيقي**. هذا إجراء وقائي معتاد ولا يعني بالضرورة تسريباً فعلياً، لكنه يزيل افتراض الطمأنينة.

**آلية الاست-storage المقترحة:** `companySecrets` مشفّرة بـKMS، تُقرأ في `functions` فقط، وتُحذف من الذاكرة بعد الطلب. `check_secrets.py` يجب أن يبقى خالياً من النتائج بعد إضافتها.

---

## 6. خطة قبول حقيقي — بأمان، بعد موافقة صريحة

### المرحلة 0 — تحضير (لا اتصال)

**شرط البدء:** موافقة المالك الخطية + إجابات الشركة على §4.

| # | خطوة | المخرج | معيار الإنجاز |
|---|---|---|---|
| 0.1 | استعادة الملفين الأصليين والتحقق من SHA-256 | نقطتان مطابقتان | البصمتان `5070b1e1…` و `bc1c465f…` |
| 0.2 | حفظ ردود الشركة منزوعة الأسرار | `docs/evidence/click-response-samples.json` | لا يحتوي أي secret |
| 0.3 | تدوير اعتماد الاختبار | اعتماد جديد | القديم غير صالح |
| 0.4 | إدخال الرؤوس/المفاتيح في `config/` **المُتجاهَل** | — | خارج Git |
| 0.5 | `check_secrets.py` | — | 0 نتائج |

### المرحلة 1 — sandbox للقراءة فقط (بلا شحنة)

| # | خطوة | side effect |
|---|---|---|
| 1.1 | `getorder` على **شحنة اصطناعية معروفة** فقط | قراءة فقط |
| 1.2 | توثيق الاستجابة الحقيقية: أسماء الحقول والأنواع | — |
| 1.3 | استخراج حقل الحالة وأكود الحالات السبعة | — |
| 1.4 | توثيق `Order_ID` و`Client_Serial` السلوك الفعلي | — |
| 1.5 | قياس المهل وحدود المعدل لـ429/5xx | ضغط خفيف |
| 1.6 | **إعادة بناء `parsing` على استجابات حقيقية** | كود جديد |

**بوابة توقف:** إذا اختلف أي استجابة عن الملخص المشتق، **يُحدَّث العقد ويُعاد التحقق قبل المتابعة**.

### المرحلة 2 — شحنة واحدة في sandbox (بموافقة منفصلة)

| # | خطوة | ضابط side effect |
|---|---|---|
| 2.1 | `setorder` واحدة على حساب اختبار، مستلم اصطناعي | **شحنة واحدة فقط** |
| 2.2 | تسجيل `Order_ID`/التتبع العائد فوراً | — |
| 2.3 | اختبار إعادة الإرسال **نفس `Client_Serial`** | يثبت سلوك التكرار |
| 2.4 | **`removeorder` على نفس الشحنة فقط** | لا يُستخدم على أي طلب Velnix |

**ضوابط إلزامية:** عرض القائمة الكاملة للخطوات على المالك قبل التنفيذ · إيقاف فوري عند أي غير متوقع · **لا** تشغيل على حساب إنتاجي · **لا** تفعيل `reconcileDeliveryStatuses`.

### المرحلة 3 — التفعيل المُحكَّم

| # | خطوة | شرط |
|---|---|---|
| 3.1 | نشر `sendOrderToDelivery` و`assignCompany` و`resolveDispatchException` | موافقة منفصلة |
| 3.2 | تفعيل شركة واحدة فقط | — |
| 3.3 | تفعيل الجدولة بعد إثبات mapping | **ليس قبلها** |

---

## 7. ما لا يُنفَّذ أبداً في هذه الخطة

- ❌ أي اتصال بـ Click قبل موافقة صريحة
- ❌ إرسال أي شحنة قبل إجابات D4/D7/D9/D10
- ❌ أي ربط مالي مبني على `Ord_Amt` قبل حسم التعارض
- ❌ افتراض webhook أو نقطة health أو أكواد حالات
- ❌ استخدام `generic_v1` كبديل لـ Click (محظور صريح)
- ❌ `removeorder` على أي طلب Velnix (قرار نطاق)
- ❌ تفعيل الجدولة قبل إثبات mapping

---

## 8. حالة الجاهزية

| السؤال | الإجابة |
|---|---|
| هل التكامل جاهز للاختبار الحقيقي؟ | **لا** — 4 فجوات دليل حرجة |
| هل يمكن تفعيله في الإنتاج اليوم؟ | **لا** — محجوب في الشيفرة عمداً |
| هل العزل صحيح؟ | **نعم** — لا path تشغيلي، ولا خلط مع `generic_v1` |
| هل الفشل آمن؟ | **نعم** — `needs_review` يمنع الازدواج |
| ما الخطوة التالية؟ | إرسال `CLICK_DELIVERY_QUESTIONS_AR.md` للشركة + استعادة الملفين |

**المرجع:** [المصفوفة](VELNIX_REQUIREMENTS_TRACEABILITY_AR.md) §5 · [الخطة الرئيسية](VELNIX_MASTER_REQUIREMENTS_AND_DELIVERY_PLAN_AR.md)