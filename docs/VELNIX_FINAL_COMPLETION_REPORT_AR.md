# VELNIX — تقرير الإكمال النهائي

الفرع: `audit/production-readiness` · آخر Commit: `dc02ec768ef6e1c8fdc1b09461a4aa31cdd55f3d`
PR #1: Draft / Open · `main`: `0d10904ff6109096c0b361f2fca8719042160a1c` (لم يُمسّ)

> لم يُنشر أي Function، ولم تُعدّل Firebase Production أو قواعدها أو فهارسها أو إعدادات النسخ الاحتياطي، ولم تُنشأ أو تُلغَ أي شحنة Click، ولم تُفعّل أي خدمة مدفوعة.

---

## 1. ملخص تنفيذي

اكتملت محليًا جميع الأعمال البرمجية والاختبارية والواجهية القابلة للإنجاز دون موافقات إنتاجية:

- تحسينات UI/UX شاملة: كثافة الجداول، فلاتر الهاتف في Bottom Sheet، طي الشريط الجانبي، حماية التغييرات غير المحفوظة، وإصلاح ظهور حقول RTL في Web.
- قبول Web حقيقي على 10 مقاسات × 5 أدوار: **300 فحص، 0 فشل، 0 Overflow**.
- Stage 3: **11/11** · Stage 4D: **8/8** · Stage 4C: **7 ناجح / 2 Skip**.
- Functions Unit: **174/174** · Emulator: **133/133**.
- Flutter Analyze/Format نظيفان، وCI أخضر على Ubuntu.
- بناء Android Debug وiOS Simulator Debug ناجح، مع تشغيل فعلي جزئي.
- Click معزول بالكامل: لا 401 جديد، ولا setorder/removeorder، والحواجز سليمة.
- الأدوات المحلية للنسخ/الاسترجاع مختبَرة على المحاكي؛ الإنتاج **غير مفعّل**.
- لم يُلمس `main`، ولم يُدمج PR #1.

**الحكم:** نطاق الويب والواجهات **READY FOR OWNER ACCEPTANCE**، والإنتاج الكامل **BLOCKED EXTERNALLY** بموافقات وموارد المالك/المزود.

---

## 2. العمل المنجز

### 2.1 UI/UX

| البند | التنفيذ |
|---|---|
| جدول/بطاقات الطلبات | بطاقات أكثف + رقم الطلب والنطاق والتاريخ، والمبلغ حسب الصلاحية |
| فلاتر الهاتف | زر «الفلاتر والترتيب» + Badge + Bottom Sheet قابل للتمرير والإغلاق |
| الشريط الجانبي | زر طي/توسيع فعلي (230↔85) |
| قائمة «المزيد» | عناوين: التشغيل / الإدارة / التحليلات والتدقيق |
| كثافة السجلات | Audit / Reports / Notices / Sync بصفوف `dense` و`VisualDense.compact` |
| حماية النماذج | حوار «تغييرات غير محفوظة» في الطلب/الموظف/الشركة/الإعدادات |
| RTL Web | إصلاح ظهور اسم الموظف/الشركة قبل التركيز |
| فلتر محذوف | تجاهل شركة/موظف غير موجود بدل Assertion |

### 2.2 الأدوار والصلاحيات

- الأدوار من المصدر: `generalManager` · `manager` · `warehouse` · `sales` · `dataEntry`.
- الحالات: `pending` · `rejected` · `disabled`.
- الرفض خادمي عبر `functions/src/policy.js` و`requireAuth` و`currentActor`، وليس إخفاء أزرار.
- رحلات GM الكاملة: إنشاء/تعديل/بحث/حالات/إشعارات/شركات/فريق/انضمام/إعدادات/تدقيق/مزامنة/تقارير.
- الأدوار الأخرى مغطاة باختبارات المحاكي و`browser.cjs` ومصفوفة الأدوار.

### 2.3 الكود المحلي لتكامل Click

- `getOrderBody` يتحقق من `Order_ID` و`User_Name`/`User_Pass`.
- `vendorRequest` يفرض HTTPS والسماح بالمضيف و`Authorization: client` والمهلات.
- منع النجاح الوهمي: أي استجابة غير موثقة تُرفض ولا تُفسر كبيانات.
- إدارة الفشل: مهلة، حجم استجابة، JSON غير صالح، وعدم إعادة المحاولة العشوائية.
- `sendOrderToDelivery` و`resolveDispatchException` وقفل الإرسال ومنع التكرار موجودة ومختبرة.
- `Ord_Amt` و`Client_Serial` وحالات الرد تبقى محجوبة حتى وثيقة Click.

---

## 3. الأخطاء التي تم إصلاحها

| # | العيب | الملف | الاختبار |
|---|---|---|---|
| 1 | تحديث جزئي لشركة يعطّل/يمسح الحالات | `functions/src/index.js` | محاكي |
| 2 | تحديث جزئي لموظف يعيد التفعيل/يمسح الصلاحيات | `functions/src/index.js` | محاكي |
| 3 | `restoreCompany` يعطّل شركة غير مؤرشفة | `functions/src/index.js` | محاكي |
| 4 | `assignCompany` بلا تحقق وجود الطلب | `functions/src/index.js` | مراجعة |
| 5 | نسخة احتياطية تُنسب لتطبيق مشروع آخر | `functions/scripts/firestore_snapshot.js` | وحدة |
| 6 | عدم اكتشاف مجموعات جديدة بعد الاستعادة | نفس الملف | محاكي |
| 7 | صلاحية ملف النسخة `0644` | نفس الملف | محاكي |
| 8 | `listNotices`/`listAudit`/`listSyncEvents`/`getOrder` اقتطاع صامت | `functions/src/index.js` + UI | وحدة/محاكي/Widget |
| 9 | فشل تهيئة Google يُخزَّن للأبد | `lib/live/live_app.dart` | مراجعة |
| 10 | سباق `loadMore` في الإشعارات | `lib/live/live_notices.dart` | مراجعة |
| 11 | صفوف قديمة بعد فشل تحديث الطلبات | `lib/live/live_orders.dart` | Widget |
| 12 | فلتر شركة/موظف محذوف يسبب Assertion | `lib/live/order_filters.dart` | Widget |
| 13 | اسم الموظف/الشركة RTL لا يظهر في Web | `lib/live/live_admin.dart` | Widget + لقطات |
| 14 | فقدان تغييرات غير محفوظة | 4 نماذج | Widget |
| 15 | Stage 4D harness: رجوع/إلغاء حوار | `scripts/emulator-preview/stage4d-*.cjs` | Stage 4D 8/8 |
| 16 | Golden الطلبات بعد إعادة التصميم | `test/goldens/delivery_quality/*-orders-*.png` | CI Ubuntu |

---

## 4. الأدلة والاختبارات

| المجموعة | النتيجة | الدليل |
|---|---|---|
| Functions Unit | **174/174** | `npm test` |
| Functions Emulator | **133/133** | `npm run test:emulator` |
| Stage 3 Web | **11/11** · 14/14 mandatory | `build/qa/emulator-ui/stage3-acceptance.json` |
| Stage 4D | **8/8** | `build/qa/emulator-stage4d/stage4d.json` |
| Stage 4C | **7 ناجح / 2 Skip** | `build/qa/emulator-stage4c/stage4c.json` |
| Responsive 10 مقاسات | **300/0/0** | `build/qa/visual-audit-10/responsive.json` |
| Stage 4B | **150/0/0** | `build/qa/emulator-stage4b/responsive.json` |
| Widget/UI | ✅ | `flutter test` (Functional) |
| Golden | CI Ubuntu ✅ · macOS 18 فشل بيئي | CI runs |
| Analyze/Format | ✅ | `flutter analyze` · `dart format` |
| Builds | Web Demo/Live · Android Debug · iOS Simulator Debug ✅ | CI + محلي |

**قيود صريحة:** Goldens محليًا على macOS غير حتمية (خطوط/AA)؛ المرجع المعتمد هو CI Ubuntu. لا Skip يُحسب نجاحًا.

---

## 5. جاهزية Web / Android / iOS

| المنصة | الحالة | التفصيل |
|---|---|---|
| Web (Chrome حقيقي) | **READY FOR OWNER ACCEPTANCE** | 300+150 فحصًا، رحلات Stage 3/4C/4D، لقطات فعلية |
| Android | **PARTIAL / NOT TESTED تفاعليًا** | Demo Debug ثُبّت ووصل لشاشة الإقلاع؛ AVD تجمّد قبل التفاعل. CI يبني APK Debug Demo/Live |
| iOS | **PARTIAL / NOT TESTED تفاعليًا** | Simulator Debug ثُبّت وظهرت شاشة الدور؛ النقر عبر AppleScript رُفض بصلاحية macOS Accessibility `-25204` |
| أجهزة حقيقية/توقيع | **BLOCKED** | لا مفاتيح/حسابات/أجهزة |

---

## 6. جاهزية Firebase وخدمات الإنتاج

| الخدمة | الحالة | ملاحظة |
|---|---|---|
| Cloud Functions | **PARTIAL DEPLOYED** | 23/35 منشورة؛ 12 ناقصة |
| Firestore Rules | **VERIFIED (read-only)** | مطابقة للمصدر `e1c900b7…` |
| Firestore Indexes | **BLOCKED** | 109 في المصدر · 2 READY · 107 ناقصة |
| Authentication | **CONFIGURED / NOT TESTED** | Google مُفعّل · Email/Password ما زال مُفعّلًا |
| App Check | **BLOCKED** | `UNENFORCED` على Firestore/Identity/OAuth2 |
| KMS | **BLOCKED** | API معطّل ولا مفتاح إنتاجي |
| Cloud Scheduler | **BLOCKED** | API معطّل |
| FCM | **PARTIAL** | API مفعّل؛ APNs/جهاز حقيقي NOT TESTED |
| Hosting | **NOT TESTED هذه الجولة** | بناء Web ناجح في CI |
| Backups/PITR | **BLOCKED** | PITR معطّل · 0 جداول · 0 نسخ · Delete Protection معطّل |
| Monitoring/Alerts | **NOT TESTED** | لا قنوات تنبيه مهيأة |

**الدوال الناقصة (12):** `saveCompany` · `archiveCompany` · `restoreCompany` · `testCompanyConnection` · `assignCompany` · `sendOrderToDelivery` · `resolveDispatchException` · `deliveryWebhook` · `reconcileDeliveryStatuses` · `registerDevice` · `unregisterDevice` · `pushNotice`.

**خطة النشر المقترحة (بعد الموافقة):**
1. `firebase deploy --only firestore:indexes` (107 فهارس).
2. تفعيل `cloudscheduler.googleapis.com` ثم نشر `reconcileDeliveryStatuses`.
3. نشر مجموعة الشركات (5 دوال) + FCM (3 دوال) بعد KMS/App Check.
4. نشر دوال Click (4) تبقى محجوبة وظيفيًا حتى العقد.
5. التحقق بعد كل مرحلة، والتراجع بملف القواعد/إعادة نشر النسخة السابقة.

---

## 7. جاهزية الأمان والنسخ الاحتياطي

- **عزل الشركات**: كل الطلبات والعمليات تمر بـ`canSeeOrder` و`scopeQueries` و`currentActor`.
- **Idempotency**: `requestKey` + معاملة + `idempotency` collection، واختبارات سباق.
- **المبالغ**: `fils` صحيحة (`amountMinor`) ولا عشرية عائمة في التخزين.
- **منع التكرار**: قفل إرسال + `needs_review` + مراجعة GM، و`Client_Serial` بلا رفع حاجز.
- **الأسرار**: KMS و`companySecrets`؛ لا أسرار في Git أو الواجهة.
- **النسخ المحلي**: 12 سيناريو على المحاكي (نسخ/تحقق/استرجاع/انقطاع/تلف/تكرار/رفض الإنتاج).
- **الإنتاج**: لا PITR ولا جداول ولا تصدير Auth — يتطلب موافقة وميزانية.

---

## 8. حالة Click المعزولة

| البند | القيمة |
|---|---|
| POSTMAN CONFIG | **VERIFIED** من المجموعة الأصلية المسجلة |
| REQUEST SENT | **NOT SENT** — لا `Order_ID` آمن |
| HTTP | آخر محاولة موثقة: **401** «بيانات مستخدم غير صحيحة» |
| setorder/removeorder | لم يُستدعَ أي منهما |
| الحواجز | `Ord_Amt` · `Client_Serial` · الحالات · التكرار — سليمة |
| الأدلة | `docs/evidence/click-postman-verification.json` |
| المطلوب | اعتماد/تفعيل `/Client/` API + `Order_ID` آمن للقراءة |

---

## 9. العوائق المتبقية

### موافقات المالك (طلب واحد مجمّع)

| # | الموافقة | يحجب | التكلفة/المخاطر |
|---|---|---|---|
| A1 | تفعيل/تزويد اعتماد Click API + `Order_ID` آمن | كل تكامل Click | لا تكلفة مباشرة |
| A2 | مفتاح KMS + IAM `cryptoKeyEncrypterDecrypter` | حفظ أسرار الشركات | تكلفة KMS |
| A3 | تفعيل App Check + حساب Google اختبار + مراجعة Email/Password | المصادقة الحقيقية | مخاطر قطع مستخدمين إن فُعّل خطأ |
| A4 | Apple Developer + APNs + أجهزة اختبار | FCM/APNs | رسوم سنوية |
| A5 | مفتاح توقيع Android Release | نشر المتجر | إدارة مفتاح |
| A6 | قرار النسخ الاحتياطي (PITR/جداول/تصدير/Auth export) + RPO/RTO + ميزانية | أي بيانات إنتاجية | تكلفة تخزين/قراءات |
| A7 | نشر الـ12 دالة + الفهارس + Scheduler | التشغيل الكامل | تغييرات إنتاجية |
| A8 | صلاحية GitHub `workflow` لإيداع `ci.yml` | خطوة Stage 3 في CI | لا تكلفة |
| A9 | صلاحية macOS Accessibility لتشغيل iOS تفاعليًا | قبول iOS | إعداد محلي |
| A10 | ملفات العقد/الفيديو الأصلية | مطابقة المتطلبات | لا تكلفة |

### عوائق بيئية/مزود
- AVD غير مستقر على هذا المضيف.
- Golden macOS غير حتمي (المرجع CI Ubuntu).
- Click ينتظر المزود.

---

## 10. الحكم النهائي

- **UI/UX والأدوار والويب:** **READY FOR OWNER ACCEPTANCE** — الأدلة والاختبارات والبناء وCI خضراء.
- **الإنتاج الكامل:** **BLOCKED EXTERNALLY** — Click، KMS، App Check، FCM/APNs، النسخ الاحتياطي، النشر، التوقيع، والأجهزة.
- **لا يوجد عيب محلي مؤكد غير مُصلَح** في نطاق هذه المهمة.

> لا يُعد نجاح محاكي الويب أو نجاح البناء دليلًا على جاهزية الإنتاج. الإنتاج يبدأ فقط بعد تنفيذ الموافقات A1–A10 والتحقق الفعلي.
