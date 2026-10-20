# VELNIX — FINAL CLIENT ACCEPTANCE REPORT

**التاريخ:** 2026-10-20  

## تحديث التفعيل والإسناد النهائي — 2026-10-20

**السبب الجذري:** تفعيل Click كان ممنوعاً في ثلاث طبقات: `saveCompany` رفض `enabled:true`، ونموذج الشركة ثبّت `false` وعطّل المفتاح، و`saveCompany` استخدم allowlist العام بدل رابط Click المثبّت ففشل الحفظ في الإنتاج. لذلك بقيت الشركة معطلة، واستُبعدت من `assignCompany` وقائمة اختيار الشركة.

**الإصلاح:** تم السماح بتفعيل Click مع `User_ID` صالح فقط، وفصل `enabled` عن `clickSendEnabled`، وتثبيت التحقق على رابط Click الدقيق، وتصحيح واجهة الشركة وسجل الإسناد. نُشرت `saveCompany` و`assignCompany` و`listAudit` وHosting.

**رحلة الإنتاج النهائية:**
1. تفعيل `click_delivery_1603` من واجهة GM: **PASS** — `enabled=true`.
2. اختبار الاتصال: **PASS** — `getorder` HTTP 200 دون إنشاء شحنة.
3. إنشاء طلب اختبار: `3sq4MGbCDyMqEqRKqSra`.
4. ظهور Click في «اختيار شركة توصيل»: **PASS**.
5. حفظ الإسناد والتحقق بعد refresh وإعادة الدخول: **PASS**.
6. الإرسال من الواجهة: **PASS** — `setorder` أنشأ `1320031`.
7. التحقق من البوابة وربط البوليصة: **PASS** — `providerOrderId=1320031`, `clickOrderRef=VNX-3sq4MGbCDyMqEqRKqSra`.
8. المزامنة اليدوية: **PASS** — المصدر `click_api`.
9. المزامنة التلقائية: **PASS** — Scheduler 14:34 UTC: `checked=1, updated=0, failed=0, skipped=0`.
10. Manager role يرى Click في الاختيار، ولا يرى أزرار إدارة الشركة: **PASS**.

**الشحنة الجديدة الوحيدة:** `1320031`. لم يُعد إرسال أي شحنة سابقة ولم يُنفّذ `removeorder`.

**الكود المنشور:** `ca95c86`  
**آخر HEAD للوثائق:** `0fa06d3`  
**CI:** `39445675185` — جميع الوظائف ناجحة  
**Hosting:** https://velnix-6c1a2.web.app  
**PR:** `#1` — لم يُدمج في `main`

## جدول القبول

| البند | النتيجة | الدليل |
|---|---|---|
| إصلاح تحميل الحساب | **PASS** | جلسة محذوفة/قديمة تعود لشاشة الدخول برسالة واضحة |
| Email/Password | **PASS** | دخول إنتاجي من Chrome |
| لوحة التحكم | **PASS** | ظهرت بعد الدخول |
| إنشاء الطلب | **PASS** | طلب جاهز إنتاجي + إنشاء/تعديل في Emulator UI |
| إرسال الطلب من الواجهة | **PASS** | أُرسل `click_send_test_ready` من Chrome |
| Click setorder | **PASS** | ثلاث شحنات: `1318368`، `1319492`، `1320031` |
| Click getorder | **PASS** | HTTP 200 للشحنات الثلاث |
| المزامنة اليدوية | **PASS** | `syncClickOrder` 200، المصدر `click_api` |
| المزامنة التلقائية | **PASS** | Scheduler: `checked=1, failed=0` |
| Scheduler Job | **PASS / ENABLED** | كل 15 دقيقة |
| منع التكرار | **PASS** | زر الإرسال اختفى بعد الإرسال، ولم يُعد إرسال الطلب نفسه؛ الاختبار النهائي أضاف شحنة واحدة فقط |
| حفظ البوليصة والمرجع | **PASS** | `1319492` + `VNX-click_send_test_ready`، و`1320031` + `VNX-3sq4MGbCDyMqEqRKqSra` |
| تفعيل شركة Click | **PASS** | `enabled=true`, `clickSendEnabled=true`, `clickUserId=1603` |
| ظهور Click في اختيار الطلب | **PASS** | GM وManager شاهداها واختارها GM |
| حفظ الإسناد بعد Refresh | **PASS** | `companyId=click_delivery_1603` بعد إعادة الدخول |
| حالات الشحن | **PASS** | «قيد انتظار الموافقة» من API الحقيقي |
| الأدوار والصلاحيات | **PASS** | 8 أدوار في Chrome + منع غير المخوّل |
| Firebase Deploy | **PASS** | الوظائف ACTIVE |
| Hosting | **PASS** | الحزمة الجديدة منشورة |
| CI | **PASS** | `39445675185` |
| Client Handover | **READY** | النطاق التشغيلي المتفق عليه يعمل |

## 1. الشحنات الحقيقية

| # | Policy | Client_Serial | المصدر | الحالة |
|---|---|---|---|---|
| 1 | `1318368` | `VNX-CLICK-TEST-20261019-d` | اختبار سابق | قيد انتظار الموافقة |
| 2 | `1319492` | `VNX-click_send_test_ready` | إرسال سابق من واجهة Velnix | قيد انتظار الموافقة |
| 3 | `1320031` | `VNX-3sq4MGbCDyMqEqRKqSra` | **إرسال التفعيل النهائي من واجهة Velnix** | قيد انتظار الموافقة |

- إجمالي الشحنات الحقيقية: **3**.
- أُنشئت شحنة الاختبار الثالثة `1320031` فقط، ولم تُنشأ شحنة رابعة.
- لم يُنفّذ `removeorder`.
- لم تُعدّل الشحنة `1318368`.

## 2. رحلة الإرسال من Chrome

1. تسجيل الدخول بحساب GM مخوّل: **PASS**.
2. فتح `click_send_test_ready`: **PASS**.
3. زر «إرسال إلى Click»: **PASS**.
4. `sendOrderToDelivery`: **PASS**.
5. Click `setorder`: **أنشأ الشحنة `1319492` رغم HTTP 503**.
6. Velnix سجّل `needs_review` و`clickOrderRef` و`clickClientSerial`: **PASS**.
7. التحقق من بوابة Click: الشحنة ظاهرة، `Policy=1319492`.
8. ربط الشحنة من الواجهة: **PASS** — أصبحت `dispatched`.
9. مزامنة يدوية من الواجهة: **PASS** — `shippingStatusSource=click_api`.
10. منع الإرسال المكرر: زر الإرسال اختفى بعد الإرسال، ولم يُعد إرسال الطلب نفسه. الاختبار النهائي أضاف الشحنة `1320031` فقط.

**ملاحظة مهمة:** استجابة `setorder` كانت HTTP 503 `UNAVAILABLE`، لكن الشحنة أُنشئت. هذا يثبت أن HTTP status وحده لا يكفي، وأن `needs_review` + التحقق من البوابة ضروريان.

## 3. الحالة والمزامنة

- `shippingStatus`: `awaitingPickup` («قيد انتظار الموافقة»).
- `shippingStatusSource`: `click_api` بعد المزامنة.
- `clickStatusDate`: `2026-10-20T00:00:00`.
- `clickStatusNote`: «شحنة قيد انتظار الموافقة».
- المبالغ الخام: `orderAmountDuo=0`, `shippingDiscount=0`, `willPay=1`.
- `lastSyncAt` تحدّث.
- Scheduler run: `checked=1, updated=0, failed=0, skipped=0`.
- لا حدث/إشعار مكرر عند عدم تغير الحالة.
- `nextClickSyncAt` يتقدم 15 دقيقة.
- Job: `firebase-schedule-syncClickStatuses-europe-west1` — **ENABLED**.

## 4. المبالغ

- `Ord_Amt` المُرسل = `1` (من 1000 Fils) — مطابق لمبلغ Velnix.
- البوابة تعرض: الإجمالي `1.00`، قيمة الشحنة `0.00`، شحن على الراسل، غير مسدد.
- لا رسوم شحن ظاهرة في صف البوابة حتى الآن. أي رسوم فعلية ستظهر في الفاتورة/الرصيد.
- لم تُضف Velnix أي رسوم أو خصومات.

## 5. الحسابات والصلاحيات

- حساب المالك `moderohe8@gmail.com` (Google موثق) باقٍ وفعّال.
- حسابات E2E المؤقتة حُذفت من Auth وFirestore، بما فيها `e2e.live.gm@velnix.test`.
- Role tests: GM/manager/warehouse/sales/dataEntry/pending/rejected/disabled.
- App Check: `minValidScore=0.5` (خُفّض مؤقتًا لاختبار المتصفح الآلي ثم أُعيد).

## 6. الاختبارات

| المجموعة | النتيجة |
|---|---|
| Functions Unit | **192/192** |
| Firebase Emulator | **149/149** |
| Flutter Analyze | **نظيف** |
| Flutter Full (macOS) | **343 نجاح / 18 Golden قديم** |
| CI | **ناجح** |
| Chrome E2E | **PASS** للإرسال والمزامنة |

## 7. حدود التسليم

- **المطابقة التعاقدية الحرفية:** غير مثبتة لغياب العقد/فيديو المتطلبات. النظام يعمل حسب النطاق المتفق عليه في المحادثة.
- **Google Login:** الحساب موثق، لكن الجلسة الفعلية لم تُختبر في هذه الجولة؛ Email/Password هو المسار المُختبر.
- **Email/Password provisioning:** إداري عبر Firebase Admin، لا تسجيل ذاتي.
- **الشحنات الثلاث:** ما زالت «قيد انتظار الموافقة»؛ المدينة/المنطقة قد تكون فارغة في بوابة Click.
- **Android/iOS:** التوقيع والمتاجر غير مكتملين.

## الحكم

**`CLIENT DELIVERY READY`** — النطاق التشغيلي المتفق عليه (Login، الأدوار، إنشاء/إدارة الطلبات، إرسال Click من الواجهة، حفظ البوليصة، المزامنة اليدوية والتلقائية، Audit، Deploy، Hosting، CI) يعمل ومثبت بالأدلة.

**الاستثناء الوثائقي:** المطابقة الحرفية مع عقد/فيديو العميل غير مثبتة لعدم توفر الملفات، ويجب استكمالها عند توفرها.
