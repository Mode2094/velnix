# Velnix — مصفوفة تتبّع المتطلبات (Requirements Traceability Matrix)

**التاريخ:** 2026-10-16
**الفرع:** `audit/production-readiness`
**SHA المفحوص:** `126fd612ebe7759aceaeb6589e89e76a2142b549`
**مشروع Firebase:** `velnix-6c1a2`
**حالة PR #1:** مفتوح — **Draft** — غير مدموج (مؤكد عبر GitHub API)

> هذه الوثيقة تدقيق وتحليل، وليست تفويضاً بنشر أو استدعاء أي خدمة إنتاجية أو شركة توصيل خارجية.

## منهجية القراءة والدليل

كل بند مُصنَّف وفق المستويات التالية، **ويجب ألا يُخلط بينها**:

| المستوى | المعنى | الدليل المطلوب |
|---|---|---|
| **A** | منفذ في الشيفرة | ملف/سطر في المستودع عند هذا الـ SHA |
| **B** | اجتاز اختباراً آلياً | مخرجات اختبار نُفِّذت فعلاً |
| **C** | بُني بنجاح | مخرجات `flutter build` |
| **D** | نُشر بنجاح | سجل نشر على `velnix-6c1a2` |
| **E** | اختُبر مقابل Firebase حقيقي | تنفيذ على المشروع المنشور |
| **F** | اختُبر على جهاز فعلي | جهاز/محاكي/طراز مطبوع |
| **G** | مُتحقَّق بخدمة Click الفعلية | استجابة حقيقية من `admin.clickdelivery.org` |

**لا يُعتبر نجاح المحاكي إثباتاً لنجاح الإنتاج.**

### الرموز

`PASS` = مُنفَّذ ومُتحقَّق بدليل كافٍ · `PARTIAL` = جزء مُنفَّذ وآخر ناقص · `FAIL` = خلل مثبت · `NOT TESTED` = مُنفَّذ لكن بلا دليل · `NOT APPLICABLE` = خارج النطاق المتفق عليه.

---

## 1. الأدلة الأصلية — الاسترجاع والتحقق (Evidence Recovery)

**تحديث 2026-10-16 (المرحلة 1):** تم البحث على الـMac واسترجاع **ملفَّي Click الأصليين** والتحقق منهما بالبصمة.

| الأصل | الحالة قبل | **الحالة بعد الاسترجاع** | التحقق المحلي المستقل |
|---|---|---|---|
| `ClickApi.postman_collection.json` | ❌ مفقود | ✅ **مُسترجَع** من `~/Downloads` | ✅ **مكتمل** — بصمة `5070b1e1…` مطابقة تماماً |
| `clickdelivery api[1] (2).txt` | ❌ مفقود | ✅ **مُسترجَع** من `~/Downloads` | ✅ **مكتمل** — بصمة `bc1c465f…` مطابقة تماماً |
| **فيديو العميل (78.72 ث)** | ❌ مفقود | ❌ **لا يزال مفقوداً** | ⏳ **معلّق** |
| **اتفاقية التطوير المحدَّثة** | ❌ مفقود | ❌ **لا تزال مفقوداً** | ⏳ **معلّق** |
| **الملحق A** | ❌ مفقود | ❌ **لا يزال مفقوداً** | ⏳ **معلّق** |
| لقطات الفيديو (79 لقطة) | ❌ مفقود | ❌ لا تزال مفقوداً | ⏳ معلّق |
| Postman collection (بديل) | ❌ مفقود | ❌ لا يزال مفقوداً (غير لازم) | ⏳ معلّق |

**طريقة التحقق:** حُسبت SHA-256 لكل ملف وقورنت بـ `docs/evidence/click-delivery-contract.json`. كلاهما **OK**.

### 1.1 ما اكتُشف بفحص الأصل مباشرة (ليس مستنتَجاً)

| البند | النتيجة الموثّقة من الأصل |
|---|---|
| عدد عناصر Postman | **2 فقط**: `getorder` و `removeorder` |
| `setorder` في Postman | ❌ **غير موجود** |
| طرق HTTP المؤكدة | `getorder`=POST، `removeorder`=POST فقط |
| طريقة `setorder` | ❌ **غير موثّقة إطلاقاً** (يوجد `request name` فقط) |
| رأس المصادقة | `Authorization: client` بنوع `text` — **حرفي وليس Bearer** |
| `body.mode` / `language` | `raw` / `json` |
| رأس `Content-Type` | ❌ **غير موجود** في المجموعة |
| استجابات محفوظة | **0** لعنصرَي Postman |
| استجابات في الملف النصي | **0** — الملف يحتوي أمثلة طلب فقط |
| بنية الملف النصي | 39 سطراً، كتلتان متكررتان: عربية ثم إنجليزية |
| صحة أمثلة JSON | **معطوبة** (فواصل ناقصة) ⇒ توضيحية فقط، لا تمثّل صيغة السلك بدقة |
| التباس اسم المزوّد | العربية «Click» مقابل الإنجليزية «**speed logistic**» |

### 1.2 التعارضات المؤكدة بسطر مُحدَّد

| الحقل | العربية | الإنجليزية | الحكم |
|---|---|---|---|
| `Ord_Amt` | س14: «قيمة الشحنة مع اعتبار أنه سيتم **خصم** قيمة التوصيل منها» | س35: «order amount + **shipping** amount» | ⚠️ **تعارض جوهري — يمنع أي ربط مالي** |
| `Client_Serial` | س8: «كود التاجر للشحنة» | س29: «order number **on your system**» | ⚠️ **تعارض جوهري — يمنع تصميم idempotency** |

### 1.3 صيغة القيم المنطقية

`Is_Ord_Exchange` و `Open_Shippment` يظهران في الأصل كسلسلة نصية تحوي **`"True or False"`** — وهي قيمة نصية نائبة، وليست منطقية. **نوع البيانات الفعلي على السلك غير مُحسوم.**

### 1.4 أثر الاسترجاع على المصفوفة

- البنود **D2، D11، D13** ارتفعت من «مستنتَج من ملخص» إلى **«مُتحقَّق من الأصل»**.
- البنود **D4، D7، D10** قبلت كنواقص **مؤكدة من الأصل** لا مجرد فرضيات.
- **لم يتغيّر أي حكم** في §5: التكامل يبقى **محجوباً عمداً**، لأن التعارضات قائمة في الأصل نفسه.

### 1.5 الأدلة النصية الموجودة في المستودع

| الملف | النوع | القيد |
|---|---|---|
| `docs/10_VIDEO_SECOND_BY_SECOND_AR.md` | تدقيق فيديو ثانية بثانية | نصي فقط؛ اللقطات الـ79 **غير موجودة** |
| `docs/19_FULL_SCREEN_AND_BUTTON_AUDIT_AR.md` | تدقيق شاشات/أزرار | **تاريخي لإصدار v0.6** |
| `docs/evidence/click-delivery-contract.json` | عقد Click المشتق | ملخص مشتق — أُعيد التحقق منه الآن مقابل الأصل |

### 1.6 القيود المستمرة

- ⚠️ **لا يمكن تأكيد أي تطابق بصري مع الفيديو** — الفيديو غير موجود.
- ⚠️ **النطاق التعاقدي غير مُثبت** — لا اتفاقية ولا ملحق. اعتُمد `01_SCOPE_AR.md` نطاقاً مكتوباً.
- 🔒 **ملف Click النصي يحتوي قيم اعتماد نموذجية** ⇒ بقي **خارج Git** عمداً؛ انظر `docs/evidence-import/`.

## 2. المصفوفة — الصلاحيات والدخول (Access & Roles)

| # | المتطلب | المصدر | الشاشة/الدور | التنفيذ | الاختبار | الدليل | الحالة | الخطورة | الإجراء التصحيحي |
|---|---|---|---|---|---|---|---|---|---|
| A1 | خمسة أدوار معرَّفة | `01_SCOPE_AR.md#4` | عام | `functions/src/policy.js:1` `ROLES` | `policy.test.js`، `operational_policy_test.dart` | فحص قائمة الأدوار | **PASS** | — | — |
| A2 | إحدى عشرة صلاحية معرَّفة | `ROLE_PERMISSION_MATRIX.md` | عام | `policy.js:3` `PERMISSIONS` | `policy.test.js` | فحص القائمة | **PASS** | — | — |
| A3 | الخادم هو المرجع النهائي للصلاحيات | `ROLE_PERMISSION_MATRIX.md` | عام | `index.js` كل الـcallables تستدعي `requireAuth`/`currentActor` | emulator `rules.test.js` | رفض CRUD مباشر | **PASS** | — | — |
| A4 | دخول Google على Web | `STAGE3_REAL_GM_ACCEPTANCE.md` | تسجيل الدخول | `lib/live/live_app.dart:128` `signInWithPopup` | `google_join_test.dart`، emulator `google_join.test.js` | محاكي فقط | **NOT TESTED** | **عالية** | اختبار دخول Google حقيقي على `velnix-6c1a2` |
| A5 | إنشاء طلب انضمام تلقائي | `19_FULL_SCREEN…#الدخول` | تسجيل الدخول | `join_requests.js:6` `joinSession` | emulator `google_join.test.js` | محاكي | **PASS** | — | — |
| A6 | لا يُوثق UID/بريد/دور من العميل | `join_requests.js:7` | الخادم | `googleProfile(auth.getUser(uid))` | emulator | رفض تزوير الهوية | **PASS** | — | — |
| A7 | قائمة طلبات الانضمام للمدير العام فقط | `join_requests.js:21` | طلبات الانضمام | `admin()` يفرض `generalManager` | `operational_readiness.test.js` | رفض الأدوار الأخرى | **PASS** | — | — |
| A8 | اعتماد/رفض الطلب بمعاملة وAudit | `join_requests.js:29` | طلبات الانضمام | `db.runTransaction` + `audit('join.'+decision)` | emulator | معاملة ذرّية | **PASS** | — | — |
| A9 | منع اعتماد الحساب لنفسه | `join_requests.js:33` | طلبات الانضمام | `if(id===actor.id) fail` | emulator | رفض | **PASS** | — | — |
| A10 | حماية آخر مدير عام نشط | `ROLE_PERMISSION_MATRIX.md` | الأعضاء | `index.js` في `saveMember` | emulator `rules.test.js` | تعطيل متزامن مرفوض | **PASS** | — | — |
| A11 | نطاق فريق المبيعات الحالي | `ROLE_PERMISSION_MATRIX.md` | الطلبات | `policy.js:19` `canSeeOrder` + `authorizedCreatorIds` | `permission_test.dart`، emulator | نطاق.current | **PASS** | — | — |
| A12 | لا منح صلاحيات تفوق سلطة المُفوِّض | `ROLE_PERMISSION_MATRIX.md` | نموذج العضو | `index.js` `saveMember` | `operational_readiness.test.js` | رفض تصعيد الدور | **PASS** | — | — |
| A13 | لا granting وصول تاريخي للمشرف السابق | `GOOGLE_ONLY_ACCESS_MIGRATION_AR.md` | نقل الفريق | منطق `salesSupervisorId` | emulator | رفض | **PASS** | — | — |
| A14 | تعطيل العضو يمنع الدخول فوراً | `policy.js:14` `active===true` | كل شيء | بوابة موحّدة | emulator | اختبار «inactive» | **PASS** | — | — |
| A15 | `manageEmployees` لا يمنح صلاحية اعتماد الانضمام | `ROLE_PERMISSION_MATRIX.md` | طلبات الانضمام | `admin()` يفرض الدور لا الصلاحية | `operational_readiness.test.js` | فصل الدور عن الصلاحية | **PASS** | — | — |

---

## 3. المصفوفة — دورة حياة الطلب (Order Lifecycle)

| # | المتطلب | المصدر | الشاشة/الدور | التنفيذ | الاختبار | الدليل | الحالة | الخطورة | الإجراء التصحيحي |
|---|---|---|---|---|---|---|---|---|---|
| B1 | إنشاء طلب لجميع الأدوار الخمسة | `01_SCOPE_AR.md#3` | إضافة طلب / 5 أدوار | `index.js:190` `createOrder` | `live_actions_test.dart`، emulator `workflow.test.js` | 5 أدوار تنشئ | **PASS** | — | — |
| B2 | الحقول الإلزامية وحدود الطول | `01_SCOPE_AR.md#2` | نموذج الطلب | `policy.js` `validateOrderFields` | `operational_policy_test.dart` | رفض الفراغي | **PASS** | — | — |
| B3 | التحقق من صيغة الهاتف | `02_SCREENS_AR.md` | نموذج الطلب | `policy.js` `phonePattern` `^\+?[0-9]{7,15}$` | `operational_policy_test.dart` | رفض | **PASS** | — | — |
| B4 | الكمية عدد صحيح 1..10000 | `01_SCOPE_AR.md#2` | نموذج الطلب | `policy.js` | `operational_policy_test.dart` | رفض | **PASS** | — | — |
| B5 | المبلغ بالدينار (3 منازل/فلس) | `lib/models` | نموذج الطلب | `policy.js` `moneyMinor` ×1000، حد 1,000,000 | `operational_policy_test.dart` | رفض النص/السالب | **PASS** | — | — |
| B6 | قبول الأرقام العربية-الهندية | `01_SCOPE_AR.md` | نموذج الطلب | `policy.js` `arabicDigits` | `operational_policy_test.dart` | تحويل | **PASS** | — | — |
| B7 | طريقة الدفع: عند الاستلام/مدفوع مسبقاً | `19_FULL_SCREEN…` | نموذج الطلب | `policy.js` قائمة بيضاء | `operational_policy_test.dart` | رفض غيرها | **PASS** | — | — |
| B8 | تعديل الطلب مقيَّد بالحالة والمالك | `ROLE_PERMISSION_MATRIX.md` | تعديل | `policy.js:21` `canEditOrder` | `permission_test.dart` | رفض بعد الإرسال | **PASS** | — | — |
| B9 | الطلب المرسل/قيد الإرسال لا يُعدَّل | `01_SCOPE_AR.md#3` | تعديل | `dispatchBlocked(order)` | emulator | رفض | **PASS** | — | — |
| B10 | انتقالات حالة صالحة فقط | `policy.js` `TRANSITIONS` | تغيير الحالة | `allowedTransition` | `policy.test.js` يغطي كل دور/حالة | مصفوفة | **PASS** | — | — |
| B11 | الإلغاء حالة محفوظة لا حذف | `01_SCOPE_AR.md#3` | إلغاء | بلا callable حذف؛ `cancelled` terminal | `policy.test.js` | — | **PASS** | — | — |
| B12 | **منع الحذف النهائي** | `01_SCOPE_AR.md#3` | — | لا `deleteOrder`؛ قواعد SDK تمنع `delete` للأدوار الخمسة | emulator `rules.test.js` | رفض CRUD | **PASS** | — | — |
| B13 | سجل حركة مرتب زمنياً | `02_SCREENS_AR.md#7` | تفاصيل الطلب | `orders/{id}/events` + `index.js` `getOrder` | `live_actions_test.dart` | عرض | **PASS** | — | — |
| B14 | الحالات التسع معرَّفة | `policy.js:2` `STATUSES` | عام | 9 حالات | `policy.test.js` | — | **PASS** | — | — |

---

## 4. المصفوفة — الصلاحيات على الطلب ودورة الإكمال

| # | المتطلب | المصدر | التنفيذ | الاختبار | الدليل | الحالة | الخطورة | الإجراء |
|---|---|---|---|---|---|---|---|---|
| C1 | من يرى الطلب | `ROLE_PERMISSION_MATRIX.md` | `policy.js:19` `canSeeOrder` | `permission_test.dart` | أدوار/مبالغ | **PASS** | — | — |
| C2 | من يعدّل الطلب | `ROLE_PERMISSION_MATRIX.md` | `policy.js:21` | `permission_test.dart` | — | **PASS** | — | — |
| C3 | من يغيّر الحالة | `ROLE_PERMISSION_MATRIX.md` | `policy.js:23` `allowedTransition` | `policy.test.js` | — | **PASS** | — | — |
| C4 | عرض المبالغ للمالك أو `viewAmounts` فقط | `ROLE_PERMISSION_MATRIX.md` | حذف المبلغ من DTO لغير المخوّل | `click_readiness_test.dart:101-102` يفحص غياب الأرقام | **PASS** | — | — |
| C5 | إكمال داخلي بـ`completionSource` + actor + وقت | `FEATURE_MATRIX.md` | `index.js` + audit | `policy.test.js`، emulator `workflow.test.js` | provenance | **PASS** | — | — |
| C6 | منع انتحال `delivered` محلياً | `ROLE_PERMISSION_MATRIX.md` | `policy.js:25` يمنع عند company/tracking/remoteStatus | `policy.test.js` | رفض | **PASS** | — | — |
| C7 | terminal states لا تُفتح | `policy.js` `TRANSITIONS` | `[]` للحالات النهائية | `policy.test.js` | — | **PASS** | — | — |
| C8 | **`completionSource=carrier` فقط من remote processor** | `remote.js` | `mapped==='delivered'` → carrier | emulator | — | **PASS** (منطق) | — | يعتمد على Click/شركة غير مفعّل |

---

## 5. المصفوفة — شركة التوصيل وتكامل Click

> **الخلاصة الحاسمة:** تكامل Click **محجوب عمداً**. `requireOperationalProvider()` يرمي `click_contract_incomplete` لأي شركة `click_delivery_v1`. لا يوجد مسار تشغيلي لإنشاء شحنة أو سحب حالة أو إلغاء عبر Click.

| # | المتطلب | المصدر | التنفيذ | الاختبار | الدليل | الحالة | الخطورة | الإجراء |
|---|---|---|---|---|---|---|---|---|
| D1 | فحص base URL لـ Click | `click_delivery.js` `CLICK_BASE` | `assertClickUrl` | `click_delivery.test.js` | رفض أي base آخر | **PASS** | — | — |
| D2 | `getorder` — POST + `Authorization: client` | **الأصل المُسترجَع** + العقد | `click_delivery.js` `getOrderBody` | `click_delivery.test.js` | **تحقق من الأصل**: POST، رأس `client`، 3 حقول | **PASS** | — | — |
| D3 | `getorder` استجابة | **الأصل المُسترجَع** | **لا يوجد parser** | — | **تحقق مباشر: 0 استجابة في Postman و 0 في النص** | **NOT APPLICABLE** | حرجة | استجابة رسمية من الشركة |
| D4 | `setorder` — طريقة HTTP | **الأصل س2-3 وس23-24** | **غير موثقة** | — | **تحقق مباشر: `request name: setorder` فقط؛ لا method** | **FAIL** | حرجة | تأكيد الشركة للطريقة |
| D5 | `setorder` — 12 حقل طلب | **الأصل س5-19 وس26-39** | لا مسار تنفيذي | `click_readiness_test.dart:146` يتحقق من **عدم** وجود اتصال | **تحقق: 12 حقلاً؛ أمثلة JSON معطوبة (فواصل ناقصة) ⇒ توضيحية** | **PASS** (عزل) | — | — |
| D6 | `removeorder` | `P /item/1` | موثق فقط، بلا adapter | — | — | **NOT APPLICABLE** | متوسطة | قرار النطاق: لن يُستخدم لحذف طلب |
| D7 | `Ord_Amt` دلالة مالية | **الأصل س14 مقابل س35** | **تعارض مؤكد** | — | **عربي: خُصم التوصيل منه · إنجليزي: الطلب + الشحن** | **FAIL** | حرجة | قرار الشركة الإجباري قبل أي ربط مالي |
| D8 | الحالات السبع | `B` (طلب العميل) | `shipping_status.js` `SHIPPING_STATUSES` | `click_readiness_test.dart:27` | **مفردات Velnix الداخلية، ليست أكواد Click** | **PARTIAL** | حرجة | أكواد Click الرسمية + حقل الحالة |
| D9 | Mapping حالات Click ← حالات Velnix | `CLICK_DELIVERY_COMPATIBILITY_AR.md` | **غير موجود عمداً** | — | لا mapping | **FAIL** | حرجة | parser موثّق |
| D10 | `Client_Serial` دلالة/تفرّد/idempotency | **الأصل س8 مقابل س29** | **غير موثق** | — | **عربي: كود التاجر · إنجليزي: رقم الطلب في نظامك** | **FAIL** | حرجة | تأكيد الشركة |
| D11 | `Order_ID` نوع/مجال | `P body/raw` | `Number.isSafeInteger` موجب فقط | `click_delivery.test.js` | Guard أضيق محلياً | **PASS** (guard) | — | لا يُستخدم لـtracking |
| D12 | Webhook لـ Click | `P/T` | **غير موثق إطلاقاً**؛ `remote.js:9` يرفض `click_delivery_v1` | `remote.test.js` | رفض payload | **PASS** (عزل) | — | قرار الشركة |
| D13 | HMAC webhook (لـ generic_v1 فقط) | `delivery.js:verifyWebhook` | HMAC-SHA256 + طابع ±300ث + `timingSafeEqual` | `provider_contract.test.js` | — | **PASS** (مرجعي) | — | **لا يخص Click** |
| D14 | `generic_v1` عقد مرجعي فقط | `DELIVERY_API_INTEGRATION.md` | `providers.js` | `provider_contract.test.js` بخادم HTTP حقيقي على loopback | **ليس شركة فعلية** | **PASS** (مرجعي) | — | — |
| D15 | منع خلط `generic_v1` مع Click | `providers.js:19` | `click_requires_dedicated_adapter` | `click_delivery.test.js` | رفض | **PASS** | — | — |
| D16 | تشفير أسرار الشركة بـKMS | `01_SCOPE_AR.md#5` | `delivery.js` `encryptSecret/decryptSecret` + `VELNIX_KMS_KEY` | `readiness.test.js` | **لم يتصل بمفتاح حقيقي** | **NOT TESTED** | عالية | إنشاء مفتاح KMS + IAM |
| D17 | allowlist HTTPS للمضيف | `SECURITY_AUDIT.md` | `allowedUrl` (https، منفذ 443، بلا credentials/redirect) | `provider_contract.test.js` | رفض | **PASS** | — | — |
| D18 | حد حجم ومهلة الاستجابة | `SECURITY_AUDIT.md` | 12ث، 1MB streaming | `provider_contract.test.js` | رفض ضخم | **PASS** | — | — |
| D19 | **وظائف إدارة الشركات غير منشورة** | `config/first-internal-deploy.json` | `assignCompany/saveCompany/archiveCompany/restoreCompany/testCompanyConnection` | موجودة في المصدر | **غير منشورة** | **PARTIAL** | **حرجة** | نشر بعد موافقة |
| D20 | `sendOrderToDelivery` غير منشور | `config/first-internal-deploy.json` | في المصدر | — | **غير منشور** | **PARTIAL** | **حرجة** | لا يمكن الإرسال لأي شركة في الإنتاج |
| D21 | `resolveDispatchException` غير منشور | `config/first-internal-deploy.json` | في المصدر | — | **غير منشور** | **PARTIAL** | متوسطة | مراجعة الاستثناء غير المؤكد |

---

## 6. المصفوفة — الإشعارات (FCM)

| # | المتطلب | المصدر | التنفيذ | الاختبار | الدليل | الحالة | الخطورة | الإجراء |
|---|---|---|---|---|---|---|---|---|
| E1 | إشعار عند حدث الطلب | `01_SCOPE_AR.md#8` | `index.js:587` `orderEventNotice` (`us-central1`, retry) | emulator | **منشور** | **PASS** | — | — |
| E2 | `pushNotice` مُشغِّل FCM | `01_SCOPE_AR.md#8` | `index.js:561` `onDocumentCreated` | `push.test.js` | **غير منشور** | **PARTIAL** | عالية | نشر عند تفعيل Push |
| E3 | تسجيل الجهاز (`registerDevice`) | `01_SCOPE_AR.md#8` | `index.js:548` | emulator | **غير منشور** | **PARTIAL** | عالية | نشر عند تفعيل Push |
| E4 | إلغاء تسجيل الجهاز (`unregisterDevice`) | `01_SCOPE_AR.md#8` | `index.js:557` | emulator | **غير منشور** | **PARTIAL** | متوسطة | نشر عند تفعيل Push |
| E5 | retry + lease + fencing | `push.js` | 4 محاولات، lease 120ث، claim UUID | `push.test.js` | **7 اختبارات محاكي** | **PASS** (منطق) | — | قياس تحت حمل حقيقي |
| E6 | احترام النطاق لكل محاولة | `SECURITY_AUDIT.md` | `push.js` يعيد فحص العضوية/النطاق | emulator | — | **PASS** | — | — |
| E7 | استئصال device غير صالح | `push.js` | `INVALID` → حذف الجهاز | `push.test.js` | — | **PASS** | — | — |
| E8 | لا حفظ token/رسالة استثناء | `SECURITY_AUDIT.md` | `safeCode` من allowlist فقط | `push.test.js` | — | **PASS** | — | — |
| E9 | **إشعار FCM حقيقي على جهاز** | `FEATURE_MATRIX.md` | `VELNIX_PUSH_ENABLED=false` | — | **لا جهاز، لا VAPID** | **NOT TESTED** | عالية | مشروع + VAPID + APNs + أجهزة |
| E10 | إشعار Web/Service worker | `01_SCOPE_AR.md#8` | `configure_web_push.py` | — | بلا VAPID | **NOT TESTED** | متوسطة | مشروع + VAPID |
| E11 | `reconcileDeliveryStatuses` مجدول | `01_SCOPE_AR.md#7` | `index.js:521` كل 15 دقيقة | — | **غير منشور/غير مفعّل** | **PARTIAL** | عالية | **لا تُفعّل قبل Click** |

---

## 7. المصفوفة — الطباعة و PDF والباركود

| # | المتطلب | المصدر | التنفيذ | الاختبار | الدليل | الحالة | الخطورة | الإجراء |
|---|---|---|---|---|---|---|---|---|
| F1 | PDF إيصال | `01_SCOPE_AR.md#2` | `lib/printing/order_printing.dart` (495 سطر) | `order_printing_test.dart` | ملفات PDF فعلية | **PASS** | — | — |
| F2 | خط Cairo العربي مضمَّن | `pubspec.yaml` | `assets/fonts/Cairo-*.ttf` | `arabic_controls_test.dart` | — | **PASS** | — | — |
| F3 | باركود مستقل قابل للمسح | `FEATURE_MATRIX.md` | `order_printing.dart` | `barcode_contract.test.js` | 36 حالة | **PASS** | — | — |
| F4 | أحجام ورق متعددة | `PRINTING_AND_BARCODE.md` | letter/legal/thermal58/80/custom | `verify_barcodes.py` | 203/300/600 DPI | **PASS** | — | — |
| F5 | كشف الباركود رقمياً | `FEATURE_MATRIX.md` | `zxing-cpp` + Pillow | `verify_barcodes.py` | 32 مباشر، 4 preprocessing، fallback 2×bilinear | **PASS** | — | — |
| F6 | الأبعاد المادية (58 مم خصوصاً) | `PRINTING_AND_BARCODE.md` | — | — | **لم يُختبر على ورق حقيقي** | **NOT TESTED** | متوسطة | شراء إيصالات وقياس |
| F7 | الطابعة الفعلية | `FEATURE_MATRIX.md` | `printing` package | — | **لا جهاز** | **NOT TESTED** | متوسطة | جهاز + سائق |
| F8 | الماسح الضوئي | `FEATURE_MATRIX.md` | — | — | **لا جهاز** | **NOT TESTED** | منخفضة | جهاز |
| F9 | إخفاء المبلغ لغير المخوّل عند الطباعة | `ROLE_PERMISSION_MATRIX.md` | جلب مخوّل | `click_readiness_test.dart` | — | **PASS** | — | — |

---

## 8. المصفوفة — الواجهات والتنقل والاستجابة

| # | المتطلب | المصدر | التنفيذ | الاختبار | الدليل | الحالة | الخطورة | الإجراء |
|---|---|---|---|---|---|---|---|---|
| G1 | 5 شاشات أساسية (رئيسية/طلبات/إضافة/إشعارات/إعدادات) | `02_SCREENS_AR.md` | `lib/live/*.dart` | `live_screen_matrix_test.dart`، `screen_matrix_test.dart` | 10 عروض × تكبير 1/2 | **PASS** | — | — |
| G2 | شاشات إدارية (فريق/شركات/مزامنة/تقارير/سجل) | `02_SCREENS_AR.md#11-17` | `live_admin.dart` (1332)، `directory_panel.dart` | `directory_panel_test.dart` | 137 عنصراً لكل قائمة | **PASS** | — | — |
| G3 | إخفاء أدوات الإدارة بلا صلاحية | `02_SCREENS_AR.md` | `live_admin.dart` | `live_screen_matrix_test.dart` | 5 أدوار | **PASS** | — | — |
| G4 | RTL كامل | `01_SCOPE_AR.md` | `Directionality` + `locale: ar` | `widget_test.dart` | — | **PASS** | — | — |
| G5 | استجابة 390/768/1440/1920 | `02_SCREENS_AR.md` | `ResponsiveShell` | `responsive_smoke_test.dart`، `screen_matrix_test.dart` | — | **PASS** | — | — |
| G6 | تكبير الخط ×1/×2 | `live_presentation_test.dart` | — | 6 شاشات × 3 عروض × 2 | — | **PASS** محلياً | — | — |
| G7 | حالات التحميل والخطأ وإعادة المحاولة | `02_SCREENS_AR.md#ملاحظات` | `live_app.dart` | `live_actions_test.dart`، emulator UI | «UI network error and retry» PASS | **PASS** | — | — |
| G8 | تأكيد الإلغاء بسبب | `02_SCREENS_AR.md` | `live_orders.dart` | emulator | — | **PASS** | — | — |
| G9 | منع تكرار الإرسال عند ضغط متكرر | `02_SCREENS_AR.md` | idempotency + `needs_review` | emulator «idempotent Backend retry» | — | **PASS** | — | — |
| G10 | التنقل بين الأدوار الخمسة | `19_FULL_SCREEN…` | — | emulator UI **21/21 سيناريو** | 5 أدوار | **PASS** | — | — |
| G11 | **شاشة الدخول بـGoogle على Web** | `live_app.dart:128` | — | — | **بلا جهاز/إنتاج** | **NOT TESTED** | عالية |see A4 |
| G12 | تطبيق iOS موقّع | `REMAINING_EXTERNAL_REQUIREMENTS.md` | — | — | **لا توقيع** | **FAIL** | عالية | Apple Developer + signing |
| G13 | تطبيق Android موقّع (AAB) | `REMAINING_EXTERNAL_REQUIREMENTS.md` | — | — | **Debug APK فقط** | **FAIL** | عالية | keystore + Play signing |

---

## 9. المصفوفة — إمكانية الوصول (Accessibility)

| # | المتطلب | المصدر | التنفيذ | الاختبار | الدليل | الحالة | الخطورة | الإجراء |
|---|---|---|---|---|---|---|---|---|
| H1 | تباين نص WCAG AA (4.5:1) | `02_SCREENS_AR.md#ملاحظات` | `lib/core/theme.dart` | `accessibility_test.dart` | يغطّي ألوان الحالات + brand/muted/danger/aqua | **PASS** | — | — |
| H2 | دلالات ARIA / شجرة وصول | `FEATURE_MATRIX.md` | — | **لا يوجد اختبار** | — | **NOT TESTED** | متوسطة | فحص يدوي + اختبار |
| H3 | قارئ الشاشة (TalkBack/VoiceOver) | `FEATURE_MATRIX.md` | — | **لا يوجد اختبار** | — | **NOT TESTED** | عالية | جهاز حقيقي |
| H4 | التنقل بلوحة المفاتيح | `02_SCREENS_AR.md#ملاحظات` | — | **لا يوجد اختبار** | — | **NOT TESTED** | متوسطة | اختبار focus trap/order |
| H5 | دعم أحجام الخطوط النظام | `02_SCREENS_AR.md` | تكبير x2 مُختبَر | `live_presentation_test.dart` | **18 من هذه الفئة تفشل على macOS** | **PARTIAL** | متوسطة | يُقيَّم على CI/Linux |

> **ملاحظة مهمة:** `FEATURE_MATRIX.md` يصف «اعتماد الهوية/الأيقونات الأصلية والوصول على جهاز» بأنه **ناقص**. الاختبار الوحيد لإمكانية الوصول هو تباين الألوان.

---

## 10. المصفوفة — البحث والفلاتر والإحصاء والتقارير

| # | المتطلب | المصدر | التنفيذ | الاختبار | الدليل | الحالة | الخطورة | الإجراء |
|---|---|---|---|---|---|---|---|---|
| I1 | بحث بالاسم/الهاتف/المعرف | `01_SCOPE_AR.md#3` | `index.js:120` `searchOrders` | `search_contract.test.js` | — | **PASS** | — | — |
| I2 | فلاتر النوع/الحالة/الشركة/التأخير | `01_SCOPE_AR.md#3` | `lib/live/order_filters.dart` | `live_actions_test.dart` | — | **PASS** | — | — |
| I3 | ترقيم آمن (cursor) | `FEATURE_MATRIX.md` | `documentId` cursor | `search_contract.test.js`، `directory_panel_test.dart` | 137 عنصراً | **PASS** | — | — |
| I4 | عدادات لوحة التحكم | `02_SCREENS_AR.md#03` | `index.js:153` `dashboardStats` | `aggregations.test.js` | 10,005 طلبات | **PASS** | — | — |
| I5 | `companyStats` دون تسريب بين الموظفين | `19_FULL_SCREEN…` | `index.js:172` | emulator | — | **PASS** | — | — |
| I6 | تقارير الطلبات | `02_SCREENS_AR.md#16` | `live_operations.dart` | `live_screen_matrix_test.dart` | — | **PASS** | — | — |
| I7 | **تقارير تحليلية متعددة المقاييس** | `FEATURE_MATRIX.md` (ملاحظة) | **غير مُنفَّذ** | — | صريح: «لا تقدم تحليلات إنتاجية متعددة المقاييس» | **NOT APPLICABLE** | — | خارج النطاق |
| I8 | عدادات/فلاتر خاصة بـClick | `CLICK_DELIVERY_COMPATIBILITY_AR.md#4` | **غير مُنفَّذ عمداً** | — | «لم تنفذ عدادات أو فلاتر Click» | **NOT APPLICABLE** | — | بعد العقد |
| I9 | سجل العمليات (audit) | `02_SCREENS_AR.md#17` | `index.js:496` `listAudit` | emulator | — | **PASS** | — | — |
| I10 | سجل المزامنة | `02_SCREENS_AR.md#15` | `index.js:485` `listSyncEvents` | `remote.test.js` | — | **PASS** | — | — |
| I11 | فهارس Firestore (109) منشورة | `firestore.indexes.json` | 109 مدخل | `probe_first_deploy_indexes.js` | **تحتاج READY على المشروع الحقيقي** | **NOT TESTED** | **حرجة** | نشر الفهارس والتحقق |

---

## 11. المصفوفة — Firebase والبنية التحتية

| # | المتطلب | المصدر | التنفيذ | الاختبار | الدليل | الحالة | الخطورة | الإجراء |
|---|---|---|---|---|---|---|---|---|
| J1 | Firebase Auth + دخول Google | `01_SCOPE_AR.md#9` | `google_identity.js` | `google_join.test.js` | محاكي | **PARTIAL** | عالية |see A4 |
| J2 | قواعد Firestore تمنع CRUD المباشر | `01_SCOPE_AR.md` | `firestore.rules` — قراءة الملف الشخصي فقط | emulator `rules.test.js` | **منشورة** | **PASS** | — | — |
| J3 | `enforceAppCheck:true` على كل الـcallables | `STAGE3_REAL_GM_ACCEPTANCE.md` | `index.js:25` | `operational_readiness.test.js` | — | **PASS** (إعداد) | — | — |
| J4 | App Check Enterprise على Web | `STAGE3_REAL_GM_ACCEPTANCE.md` | `firebase_configuration.dart:12` `ReCaptchaEnterpriseProvider` | `firebase_configuration_test.dart` | **مفتاح مدمج في البناء** | **PASS** (إعداد) | — | **لم يُختبر على نطاق حقيقي** |
| J5 | Android Play Integrity | `main.dart:66-68` | `AndroidPlayIntegrityProvider` | — | — | **NOT TESTED** | عالية | جهاز + Play |
| J6 | Apple DeviceCheck/App Attest | `main.dart:69-71` | `AppleDeviceCheckProvider` | — | — | **NOT TESTED** | عالية | جهاز + App Store |
| J7 | Debug App Check ممنوع في production | `main.dart:53`، `runtime_config.dart` | تحقق مزدوج | `firebase_configuration_test.dart` | — | **PASS** | — | — |
| J8 | المنطقة `europe-west1` لـ28 callable | `config/first-internal-deploy.json` | `index.js:24` | — | **23 منشورة** | **PARTIAL** | متوسطة | نشر الـ12 المتبقية |
| J9 | `orderEventNotice` في `us-central1` | `config/first-internal-deploy.json` | `index.js:587` | — | **منشورة** | **PASS** | — | — |
| J10 | Firestore في `nam5` | `config/first-internal-deploy.json` | مُثبت | — | **منشور** | **PASS** | — | — |
| J11 | runtime service account محدود | `config/first-internal-deploy.json` | `velnix-runtime-internal@…` | — | **غير مُثبت** | **NOT TESTED** | عالية | تطبيق IAM ومراجعة |
| J12 | KMS بمفتاح فعلي | `delivery.js` | `VELNIX_KMS_KEY` غير مضبوط | — | — | **NOT TESTED** | عالية | إنشاء مفتاح + IAM |
| J13 | Firebase Hosting | `firebase.hosting.json` | site `velnix-6c1a2`, public `build/web` | `assert-production.cjs` | **لم يُنشر** | **NOT TESTED** | عالية |see K5 |
| J14 | Blaze (فوترة) | `REMAINING_EXTERNAL_REQUIREMENTS.md` | — | — | **مُفعَّل مسبقاً** | **PASS** (إعداد) | **FAIL** ( تكلفة) | **خطر تكلفة: يُراقَب الجدول** |
| J15 | Scheduled function مفعّل | `index.js:521` | — | — | **غير مفعّل** | **NOT APPLICABLE** | — | لا يُفعّل قبل Click |

---

## 12. المصفوفة — الإصدار والجودة (CI/Build)

| # | المتطلب | المصدر | التنفيذ | الدليل | الحالة | الخطورة | الإجراء |
|---|---|---|---|---|---|---|---|
| K1 | CI على 4 مسارات | `.github/workflows/ci.yml` | Flutter / Firebase / Android / emulator-ui | `gh run list` → **success** عند `126fd61` | **PASS** | — | — |
| K2 | تثبيت التبعيات بالقفل | `pubspec.lock`، `package-lock.json` | `--enforce-lockfile`، `npm ci` | 845 حزمة، 0 تعديل للقفل | **PASS** | — | — |
| K3 | فحص الأسرار | `scripts/check_secrets.py` | 5 توقيعات + أسماء ملفات | 411 ملفاً، **0 نتائج** | **PASS** | — | — |
| K4 | تدقيق إنتاجي | `npm audit --omit=dev --audit-level=high` | — | **0 ثغرة** | **PASS** | — | — |
| K5 | بناء Web إنتاجي | `STAGE3_REAL_GM_ACCEPTANCE.md` | `flutter build web --release …` | `main.dart.js` 4,662,590 بايت، مفحوص ضد التسريب | **PASS** (بناء) | — | **غير منشور** |
| K6 | بناء Android | CI `android` job | `flutter build apk --debug` demo+live | `app-debug.apk` 168 MB | **PASS** (Debug) | — | لاsigned |
| K7 | بناء iOS | — | `flutter build ios --debug --no-codesign` | `Runner.app`، 0 أخطاء | **PASS** (compile) | — | بلا توقيع |
| K8 | الصور الذهبية (goldens) | `test/goldens/` | — | **18/18 تفشل على macOS**؛ CI أخضر | **NOT TESTED** على macOS | متوسطة | CI مرجع؛ لا تُعِد التوليد |
| K9 | تنسيق Dart | `dart format` | — | 50 ملفاً، 0 تغيير | **PASS** | — | — |
| K10 | تحليل ساكن | `flutter analyze` | — | **No issues found** | **PASS** | — | — |

---

## 13. المصفوفة — العمليات (Ops)

| # | المتطلب | المصدر | التنفيذ | الدليل | الحالة | الخطورة | الإجراء |
|---|---|---|---|---|---|---|---|
| L1 | سياسة نسخ احتياطي | `BACKUP_RESTORE_ROLLBACK_AR.md` | **وثيقة فقط** | لا أوامر نسخ نُفِّذت | **NOT TESTED** | عالية | تنفيذ على مشروع منفصل |
| L2 | تجربة استعادة معزولة | `BACKUP_RESTORE_ROLLBACK_AR.md` | **وثيقة فقط** | — | **NOT TESTED** | عالية | تجربة فعلية + قياس RPO/RTO |
| L3 | جاهزية التراجع عن إصدار | `BACKUP_RESTORE_ROLLBACK_AR.md` | release manifest موصوف | — | **NOT TESTED** | عالية | تثبيت manifest + نقطة تراجع |
| L4 | مراقبة وتنبيهات | `SECURITY_AUDIT.md` («يلزم تسجيل مراقبة») | **غير مُنفَّذ** | — | **FAIL** | عالية | إعداد alerts |
| L5 | سياسة احتفاظ وحذف بيانات | `SECURITY_AUDIT.md` | **غير مُحدَّدة** | — | **FAIL** | عالية | قرار المالك |
| L6 | RPO/RTO/تكلفة | `PERFORMANCE_AND_COST.md` | **غير مقاسة** | — | **NOT TESTED** | متوسطة | قياس تحت حمل |
| L7 | تدقيق أمن خارجي | `SECURITY_AUDIT.md` | **غير مُنفَّذ** | — | **NOT APPLICABLE** | متوسطة | قرار تعاقدي |
| L8 | إشعار خطأ غير متوقع في الجلسة | `e3689c5` | `live_app.dart` | `live_actions_test.dart` | **PASS** | — | — |

---

## 14. ملخص العدّ

| القسم | العدد |
|---|---:|
| A — الصلاحيات والدخول | 15 |
| B — دورة حياة الطلب | 14 |
| C — صلاحيات الطلب والإكمال | 8 |
| D — شركة التوصيل وClick | 21 |
| E — الإشعارات | 11 |
| F — الطباعة والباركود | 9 |
| G — الواجهات والتنقل | 13 |
| H — إمكانية الوصول | 5 |
| I — البحث والتقارير | 11 |
| J — Firebase والبنية | 15 |
| K — الإصدار والجودة | 10 |
| L — العمليات | 8 |
| **الإجمالي** | **140** |

### توزيع الحالة (محسوب آلياً من جدول §2–§13)

| الحالة | العدد | المعنى المختصر |
|---|---:|---|
| **PASS** | **93** | مُنفَّذ ومُتحقَّق بدليل محلي كافٍ |
| **PARTIAL** | **11** | جزء مُنفَّذ وآخر ناقص (أغلبها دوال غير منشورة) |
| **NOT TESTED** | **22** | مُنفَّذ أو مُعدّ لكن بلا دليل تنفيذ حقيقي |
| **FAIL** | **8** | فجوة دليل أو إعداد تشغيلي ناقص |
| **NOT APPLICABLE** | **6** | خارج النطاق المتفق عليه |
| **الإجمالي** | **140** | |

**بلوكرات FAIL الثمانية:** D4 (طريقة setorder) · D7 (تعارض Ord_Amt) · D9 (mapping حالات Click) · D10 (Client_Serial) · G12 (توقيع iOS) · G13 (توقيع Android) · L4 (مراقبة وتنبيهات) · L5 (سياسة احتفاظ).

---

## 15. الخلاصة

- **لا يوجد بند واحد FAIL بسبب عيب في الشيفرة.** كل حالات `FAIL` هي **فجوات دليل أو إعداد خارجي**: توثيق Click الناقص، توقيع iOS/Android، المراقبة والاحتفاظ.
- **البلوكرات الحرجة القابلة للتحويل إلى عمل هندسي:** D4، D7، D9، D10 (.Click) · D19، D20 (نشر 12 دالة) · E2–E4، E11 (Push/الجدولة) · I11 (فهارس) · J11، J12 (IAM/KMS) · L4، L5 (تشغيل).
- **الإنجاز الحقيقي القابل للدفاع عنه اليوم:** شيفرة الخادم والصلاحيات ودورة الطلب والبحث والتقارير والطباعة الرقمية، مُثبتة باختبارات آلية، على CI أخضر، وبناء Web إنتاجي نظيف.
- **غير المُثبت إطلاقاً:** أي سلوك ضد Firebase المنشور، أي جهاز، أي طابعة، وأي شركة توصيل.

**المرجع:** [الخطة الرئيسية](VELNIX_MASTER_REQUIREMENTS_AND_DELIVERY_PLAN_AR.md) · [قبول Click](VELNIX_CLICK_REAL_INTEGRATION_ACCEPTANCE_AR.md) · [قائمة جاهزية الإصدار](VELNIX_RELEASE_READINESS_CHECKLIST_AR.md)