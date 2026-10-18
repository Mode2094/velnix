# Stage 7 — تكامل Click Delivery وKMS والسلامة المالية والجاهزية الإنتاجية

المستودع: `Mode2094/velnix` · الفرع: `audit/production-readiness` · خط الأساس: `a2d396fa469b90c825f64ce115dcb8fc6ea49b2d`
مشروع Firebase: `velnix-6c1a2`

**لم يُجرَ أي اتصال بـ Click. لم تُنشأ أي شحنة أو تُلغَ. لم يُنشأ مفتاح KMS ولم يُعدَّل IAM. لم يُنشر أي شيء. لم تُلمس بيانات إنتاجية.**

---

## 1. ملخص التنفيذ

التدقيق كشف أن العمارة **سليمة ومحجوبة عمداً** لا ناقصة. العمل المنفَّذ:

| # | التغيير | النوع |
|---|---|---|
| 1 | منفذ حقن لعميل KMS (`setKmsClientFactory`) + قراءة المفتاح ديناميكياً | `functions/src/delivery.js` |
| 2 | تصليب تحقق `encryptSecret`/`decryptSecret` ضد مدخلات غير نصّية | `functions/src/delivery.js` |
| 3 | 5 اختبارات KMS (fail-closed، حقن وهمي، عدم تسريب) | `functions/test/kms_secrets.test.js` |
| 4 | 8 اختبارات تُثبّت نقاط الحجب غير المحسومة آلياً | `functions/test/click_contract_blocking.test.js` |
| 5 | 8 اختبارات مرونة نقل المزوّد (مهلة/5xx/انقطاع/حجم) | `functions/test/vendor_transport_resilience.test.js` |

**+21 اختباراً جديداً.** لم يُخفَّف أي تأكيد ولم تُمسّ أي دلالة تجارية.

---

## 2. مقارنة متطلبات Click مع الكود

### 2.1 مصادر الأدلة المتاحة فعلياً

| المصدر | الحالة |
|---|---|
| `ClickApi.postman_collection.json` | ❌ **غير موجود محلياً** الآن (كان في `~/Downloads`، SHA-256 مسجَّل) |
| `clickdelivery api[1] (2).txt` | ❌ **غير موجود محلياً** الآن |
| عقد العميل وملحقاته | ❌ **مجلد فارغ** (`docs/evidence-import/agreement/`) |
| فيديو المتطلبات | ❌ **مجلد فارغ** (`docs/evidence-import/video/`) |
| **العقد المشتق المستخرج من الأصلين** | ✅ `docs/evidence/click-delivery-contract.json` (3590 بايت) |
| **البصمات المرجعية** | ✅ `docs/evidence-import/KNOWN_GOOD.sha256` |
| **15 سؤالاً للشركة** | ✅ `docs/CLICK_DELIVERY_QUESTIONS_AR.md` |

**لم أفترض توفر أي ملف غير موجود.** القطع الأصلية أُزيلت من `~/Downloads`، لكن العقد المشتق — المستخرج منها مع التحقق من البصمات في مرحلة سابقة — محفوظ في المستودع، وهو المرجع المعتمد.

### 2.2 جدول المطابقة

| العملية | الطريقة | التوثيق | حالة الكود |
|---|---|---|---|
| `getorder` | **POST** ✅ | موثّق من Postman | ✅ مُنمذَج ومُتحقَّق (`getOrderBody`) |
| `removeorder` | **POST** ✅ | موثّق من Postman | 🚫 محجوب — `/removeorder` مرفوض في `vendorRequest` |
| `setorder` | ❌ **`method: null`** | **غير موثّق** | 🚫 محجوب تماماً (`create` يرمي) |

| الحقل | موجود في العقد | حالة Velnix |
|---|---|---|
| `User_Name` / `User_Pass` | ✅ | يُمرَّران في الجسم، محجوبان في السجلات |
| `Client_Serial` | ✅ (دلالة متعارضة) | 🚫 غير مستخدم |
| `Reciver_Name/Phone/Address` | ✅ | يُطابق من نموذج الطلب |
| `Ord_Content/Quantity/Note` | ✅ | يُطابق |
| `Ord_Amt` | ✅ (دلالة متعارضة) | 🚫 **لا يُرسل** |
| `Is_Ord_Exchange` / `Open_Shippment` | ✅ (نوع السلك غير محسوم) | 🚫 غير مُرسَل |

**أسلوب المصادقة:** `Authorization: client` (حرفي) + `User_Name`/`User_Pass` في الجسم — **ليس** Bearer ولا OAuth. مؤكَّد ومطبَّق.

---

## 3. المتطلبات المثبتة وغير المحسومة

### مثبتة من المصدر
- base URL: `https://admin.clickdelivery.org/Client/` — مثبَّت بدقة في `assertClickUrl`
- رأس المصادقة `client`
- حقول `getorder`/`removeorder` الاثنا عشر لـ`setorder`
- غياب أي استجابة محفوظة (0 في Postman و0 في النص)

### غير محسومة — `PROVIDER-CONTRACT-BLOCKED`
| # | البند | الأثر |
|---|---|---|
| D4 | طريقة HTTP لـ`setorder` | لا يمكن بناء الطلب |
| D7 | دلالة `Ord_Amt` (تعارض صريح بين النص العربي والإنجليزي) | **يمنع الربط المالي** |
| D9 | أكواد حالات Click | `shippingStatus` لا يُملأ من الخارج |
| D10 | علاقة `Client_Serial`/`Order_ID`/التتبع | **يمنع idempotency لدى المزوّد** |

**لم أختر أي إجابة تخمينية.** النقاط الأربع مثبَّتة الآن **آلياً** في `click_contract_blocking.test.js` — أي أن رفع الحجب مستقبلاً بلا دليل سيُسقط الاختبار.

---

## 4. نتائج الفحص المالي

**التمثيل:** أعداد صحيحة بالـ**fils** (دينار × 1000) — `moneyMinor()` في `policy.js:36`.
لا حساب عشري ولا `floating-point` في أي مسار مالي.

| الفحص | النتيجة |
|---|---|
| `12.345` → `12345` | ✅ |
| `١٢٫٥٠٠` (أرقام عربية) → `12500` | ✅ |
| `٠٫١٢٣` → `123` | ✅ |
| `0` → `0` | ✅ مسموح |
| سالب (`-1`) | ✅ مرفوض |
| 4 منازل (`12.3456`) | ✅ مرفوض |
| `''`, `null`, `undefined`, `true`, `[]`, `{}`, `'1e2'`, `'0x10'`, `Infinity`, `NaN` | ✅ كلها مرفوضة |
| السقف `>1000000` | ✅ مرفوض |

**رسوم التوصيل والتحصيل المزدوج:** **لا يوجد حقل رسوم توصيل في النموذج إطلاقاً** (`shippingFee`/`deliveryFee`/`collectionAmount`/`codAmount` — صفر إشارة). لذلك التحصيل المزدوج **مستحيل بنيوياً**، وقد ثبّتُ ذلك باختبار يمنع إضافة الحقول ما دام `Ord_Amt` غير محسوم.

**منع إرسال مبلغ غير محسوم:** `Ord_Amt` لا يُرسل لأي مزوّد، و`generic_v1` محجوب من مضيف Click صراحةً.

---

## 5. سلامة منع التكرار

آلة حالات الإرسال: `idle` → `sending` → `sent` | `needs_review` | `idle`

| الضمانة | التنفيذ |
|---|---|
| مفتاح idempotency | `dispatchLockId = randomUUID()` يُطالب به داخل معاملة |
| قفل التزامن | `dispatchLockUntil` = إجازة 90 ثانية |
| Fencing | تطبيق النتيجة يُرفض إن تغيّر `dispatchLockId` (`aborted`) |
| منع الإرسال المكرر | `dispatchState==='sent'` و`'sending'` و`'needs_review'` كلها ترفض محاولة جديدة |
| **timeout بنتيجة غير مؤكدة** | `vendorAttempted=true` ⇒ `needs_review` + رسالة «قد تكون الشحنة قد أُنشئت» |
| فشل قبل محاولة المزوّد | `vendorAttempted=false` ⇒ عودة آمنة إلى `idle` |
| المسار اليدوي | `resolveDispatchException` — **مدير عام فقط**، سبب ≥10 أحرف، نتيجتان فقط (`shipment_exists`/`not_created`) |

**لا تُعاد محاولة `setorder` بعد مهلة غير محسومة** — إعادة المحاولة تتطلب قراراً بشرياً موثَّقاً. هذا مطابق للمطلوب تماماً.

**دليل المحاكي:** `disconnect` و`missing_tracking` ⇒ `needs_review` + منع شحنة مكررة (اختبار موجود)، و«concurrent duplicate requests produce one order» ✓.

---

## 6. التزامن والأقفال

| السيناريو | الحماية | الدليل |
|---|---|---|
| إرسالان متزامنان | معاملة + `dispatchLockId` | `dispatch_contract.test.js` |
| طلبان متزامنان | معاملة إنشاء | `workflow.test.js` — «one order and one creation event» |
| webhooks متزامنة مكررة | `deliveryInbox` بـ`tx.create` | `remote.test.js` |
| إيقاف/تفعيل متزامن للمدراء | معاملة | «preserves an active administrator» |
| تحديثات ضائعة | `revision` + فحص | «revisions prevent lost updates» |

---

## 7. KMS وحماية الأسرار

| الفحص | النتيجة |
|---|---|
| تخزين منفصل | `companySecrets/{id}` — منفصل عن `companies/{id}` ✅ |
| لا نص واضح | يُخزَّن `apiTokenCiphertext`/`webhookKeyCiphertext` فقط ✅ |
| وصول العميل | قواعد Firestore `allow read, write: if false` للجميع ✅ |
| رسائل الأخطاء | `testCompanyConnection` يعيد رسالة عامة، ويسجّل `code` فقط ✅ |
| **fail-closed** | غياب `VELNIX_KMS_KEY` ⇒ رمي فوري، لا تخزين ✅ |
| الوظائف المحجوبة | Click يرفض `apiToken`/`webhookKey`/`statusMap` عند الحفظ ✅ |

### التغييرات المنفَّذة
1. **منفذ حقن:** `setKmsClientFactory()` — يسمح باختبار المسار بعميل وهمي معزول. الإنتاج لا يستدعيه.
2. **قراءة المفتاح ديناميكياً:** `keyName()` بدل الالتقاط عند الإقلاع ⇒ سلوك fail-closed صحيح ومُختبَر.
3. **تصليب تحقق النوع:** كان `{}` يمرّ من الحرس لأنه truthy؛ الآن `typeof secret!=='string'` مرفوض صراحةً. **عيب حقيقي أُصلح.**

**5 اختبارات KMS** تشمل: fail-closed بلا مفتاح، رفض الفراغ/الحجم/النوع قبل أي استدعاء، دورة ذهاب-عودة كاملة، **عدم احتواء النص المُخزَّن على السر**، وفشل فك التشفير دون تسريب.

> **تنويه:** العميل الوهمي يثبت **توصيل الكود وترميز base64 والسلوك fail-closed**. و**لا يدّعي** أن Cloud KMS الحقيقي نجح — لا مفتاح إنتاجي أُنشئ ولا استُدعي.

---

## 8. مطابقة صلاحيات المستخدمين

| الوظيفة | الصلاحية المطلوبة |
|---|---|
| `saveCompany`/`archiveCompany`/`restoreCompany` | `manageCompanies` |
| `testCompanyConnection` | `manageCompanies` |
| `assignCompany` | `manageCompanies` |
| `sendOrderToDelivery` | `sendToDelivery` |
| `resolveDispatchException` | **`generalManager` حصراً** |
| `registerDevice`/`unregisterDevice` | جلسة مصادقة + عضو نشط |

الأدوار الخمسة (`generalManager`/`manager`/`warehouse`/`sales`/`dataEntry`) مُختبَرة، و`currentActor` يرفض تغيّر الصلاحيات أثناء العملية.

---

## 9. التتبع والإلغاء

**التتبع:** `processRemote` يرفض Click صراحةً (`unconfirmed_provider_contract`). لغير Click: تكرار عبر `eventId`، ترتيب عبر `remoteCanAdvance`، فصل `remoteStatus` (خام) عن `status` (مسقط)، تأجيل للطلبات في `sending`/`needs_review`، و`out_of_order` يمنع استبدال الأحدث بالأقدم.

`remoteCanAdvance`: الحالات الطرفية (`delivered`/`returned`/`cancelled`) **مقفلة** ولا تُبلَغ إلا من `dispatched`/`inTransit` ⇒ **لا انتقال إلى `delivered` بلا إرسال حقيقي**.

**الإلغاء:** لا يوجد callable لحذف الطلب نهائياً (مُثبَت باختبار)، و`removeorder` مرفوض في `vendorRequest`. لا يمكن إلغاء شحنة حقيقية برد غامض.

---

## 10. نتائج Mock API

Mock محلي على `127.0.0.1` فقط — **لا اتصال بـ Click**. الحقول المستخدمة هي المُثبتة من العقد، ولم يُخترع أي schema نجاح.

| # | السيناريو | النتيجة |
|---|---|---|
| 1 | `setorder` | 🚫 محجوب بـ`click_contract_incomplete` (مقصود) |
| 2 | رفض الطلب (401) | ✅ `vendor_http_401` |
| 3 | بيانات ناقصة | ✅ `invalid_click_credentials` |
| 4 | اعتماد خاطئ | ✅ مرفوض |
| 5 | **HTTP timeout** | ✅ يُجهَض فعلاً بعد 12 ثانية (اختبار حقيقي) |
| 6 | **HTTP 500/502/503/504 + 429** | ✅ `vendor_http_<status>` مميَّز، بلا تسريب جسم |
| 7 | رد غير صالح | ✅ `vendor_invalid_json` / `vendor_invalid_payload` |
| 8 | **انقطاع الاتصال** | ✅ ECONNRESET / ECONNREFUSED ينتشران كفشل |
| 9 | تكرار نفس الطلب | ✅ محجوب بـ`dispatchState` |
| 10 | إرسالان متزامنان | ✅ قفل واحد (محاكي) |
| 11 | قبول خارجي مع فقدان الاستجابة | ✅ `needs_review` + منع تكرار |
| 12–14 | `getorder` بحالات / اختلاف رقم | 🚫 لا schema ⇒ لا استنتاج |
| 15–16 | إلغاء ناجح/مرفوض | 🚫 `removeorder` محجوب |
| 17 | حساب مالي صحيح | ✅ fils صحيحة |
| 18 | منع مبلغ غير محسوم | ✅ `Ord_Amt` لا يُرسل |
| 19 | موظف غير مخوّل | ✅ (محاكي) |
| 20 | شركة مؤرشفة/غير مفعّلة | ✅ يرفض قبل قفل الإرسال |
| 21 | **KMS غير متوفر** | ✅ fail-closed |
| 22 | رفض اعتماد غير صالح | ✅ |
| 23 | منع تسريب الأسرار | ✅ |
| 24 | سجل التدقيق | ✅ (محاكي) |
| 25 | فشل جزئي واستعادة | ✅ آلة الحالات |

إضافات: حجم استجابة بلا `content-length`، مسارات غير موثّقة، مضيف غير مُدرَج — كلها تُرفض **قبل** أي استدعاء شبكي.

---

## 11–13. نتائج الاختبارات

| المجموعة | النتيجة | التغيير |
|---|---|---|
| Functions unit | **151 نجاح / 0 فشل** | كان 130 ⇒ **+21** |
| Functions emulator | **118 نجاح / 0 فشل** | ثابت |
| Firestore Rules (محاكي) | ✅ ضمن الـ118 | شامل رفض `devices`/`notices` |
| `flutter analyze` | **No issues found** | ثابت |
| `flutter test` | **+330 / −18** | الـ18 **golden pixel على macOS فقط**، موثَّقة منفصلاً |
| `npm run syntax` | ✅ نظيف | — |

**لم تُضعَّف أي تأكيدات.** لم تُكسر دورة الطلبات ولا صلاحيات الأدوار ولا الإشعارات الداخلية (Stage 6) ولا إعدادات الشركات ولا الطباعة ولا التقارير.

---

## 14. الوظائف غير المنشورة

**المنشور فعلاً: 24 دالة.** المصدر يُصدِّر 32.

| # | غير منشورة | السبب |
|---|---|---|
| 1 | `saveCompany` | مسار الشركات غير مُفعَّل |
| 2 | `archiveCompany` | « |
| 3 | `restoreCompany` | « |
| 4 | `testCompanyConnection` | « |
| 5 | `assignCompany` | « |
| 6 | `sendOrderToDelivery` | **محجوب تصميمياً** |
| 7 | `resolveDispatchException` | تابع للإرسال |
| 8 | `registerDevice` | Stage 6 |
| 9 | `unregisterDevice` | Stage 6 |
| 10 | `pushNotice` | مُشغِّل FCM |
| 11 | `deliveryWebhook` | لا webhook موثّق |
| 12 | `reconcileDeliveryStatuses` | جدولة معطّلة (صحيحة) |

مؤكَّد بـ`firebase functions:list` (قراءة فقط).

| التصنيف | الحالة |
|---|---|
| Exported in source | ✅ 32 |
| Deployed in Firebase | ⚠️ 24 (12 غير منشورة) |
| Configured correctly | ✅ (لا مراجع مفقودة) |
| **Production tested** | ❌ **لا** |

---

## 15. خطة نشر إنتاجية مقترحة — دون تنفيذ

| المرحلة | الدوال | الشرط المسبق | المخاطر | التراجع |
|---|---|---|---|---|
| **0** | لا شيء | — | — | — |
| **1** | `saveCompany` `archiveCompany` `restoreCompany` `testCompanyConnection` `assignCompany` | `manageCompanies` موجود | منخفضة — لا تدفق شحن | تعطيل الشركات |
| **2** | `registerDevice` `unregisterDevice` `pushNotice` | حساب اختبار + تفعيل FCM | متوسطة — إشعارات مكررة | إيقاف المُشغِّل |
| **3** | `sendOrderToDelivery` `resolveDispatchException` | ⛔ **إجابات D4/D7/D9/D10** | **عالية — شحنات مكررة** | إرجاع `dispatchState` |
| **4** | `deliveryWebhook` `reconcileDeliveryStatuses` | ⛔ schema استجابة + mapping حالات | متوسطة | تعطيل الجدولة |

**الترتيب إلزامي.** المرحلة 3 **محظورة** قبل حل النقاط الأربع.

**الرجوع:** كل الدوال إضافية؛ لا تغيير schema. التراجع = حذف الدوال، والبيانات تبقى متسقة.

---

## 16. العوائق التي تتطلب موافقة المالك

| # | العائق | النوع |
|---|---|---|
| 1 | **إرسال `CLICK_DELIVERY_QUESTIONS_AR.md` للشركة** والحصول على إجابات D4/D7/D9/D10 | مالك + مزوّد |
| 2 | **تدوير اعتماد Click** (نُوقش في محادثة سابقة غير سرّية) | مالك |
| 3 | إنشاء مفتاح KMS إنتاجي + منح صلاحية فك التشفير لحساب التشغيل | سحابي |
| 4 | استعادة الملفين الأصليين للتحقق من البصمات مجدداً | مالك |
| 5 | ملف العقد الموقَّع وفيديو المتطلبات (مجلدان فارغان) | مالك |
| 6 | نشر المرحلة 1 (شركات) و2 (FCM) | موافقة منفصلة |
| 7 | توقيع إصدار Android + هوية Apple | موافقة |

---

## 17. الملفات المعدّلة

| الملف | التغيير |
|---|---|
| `functions/src/delivery.js` | +منفذ حقن KMS، +قراءة ديناميكية للمفتاح، +تصليب النوع |
| `functions/test/kms_secrets.test.js` | **جديد** — 5 اختبارات |
| `functions/test/click_contract_blocking.test.js` | **جديد** — 8 اختبارات |
| `functions/test/vendor_transport_resilience.test.js` | **جديد** — 8 اختبارات |
| `docs/STAGE7_CLICK_KMS_ACCEPTANCE_AR.md` | **جديد** — هذا التقرير |

`.github/workflows/ci.yml` **محفوظ غير مُودَع**.

---

## 18–19. Git وCI

| البند | القيمة |
|---|---|
| آخر SHA | يُحدَّث أدناه |
| Push CI | يُحدَّث أدناه |
| PR CI | يُحدَّث أدناه |
| `main` | لم يُمسّ |
| PR #1 | OPEN / Draft |

---

## 20. الحكم النهائي

### **PARTIAL — IMPLEMENTED / LOCALLY TESTED / PRODUCTION NOT VERIFIED**

| التصنيف | البنود |
|---|---|
| **IMPLEMENTED** | عزل Click، آلة حالات الإرسال، الأقفال وfencing، مسار الاستثناء، التتبع والترتيب، KMS fail-closed، فصل الأسرار، التمثيل المالي بالـfils |
| **LOCALLY TESTED** | 151 اختبار وحدة (+21) · 118 اختبار محاكي · Mock نقل بلا اتصال · `flutter analyze` نظيف · `flutter test` +330 |
| **PRODUCTION NOT VERIFIED** | تكامل Click الحقيقي · Cloud KMS الفعلي · نشر الدوال · تسجيل/استقبال FCM · App Check على الخادم |

**لا PASS.** شرط القبول هو إثبات تكامل Click الحقيقي وحماية KMS الفعلية وسلامة إرسال وتتبع وإلغاء الشحنات وفق عقد المزوّد — وأيٌّ منها لم يتحقّق، لأن **عقد المزوّد نفسه غير مكتمل** (D4/D7/D9/D10) وليس بسبب نقص في التنفيذ. الحجب الحالي **حماية صحيحة** تمنع شحنات مكررة ومبالغ مالية خاطئة.