# Stage 8A — خطة الإصدار والتراجع

المستودع: `Mode2094/velnix` · الفرع: `audit/production-readiness` · مشروع Firebase: `velnix-6c1a2`

**لم يُنفَّذ أي نشر.** هذه خطة تتطلب موافقة المالك عند كل بوابة.

---

## 1. مبادئ حاكمة

1. **Click يبقى معطّلاً** حتى حل D4/D7/D9/D10 بدليل من المزوّد — بلا استثناء.
2. **تفعيل FCM منفصل تماماً عن تفعيل Click** — لا تسلسل بينهما.
3. **كل مرحلة قابلة للتراجع بلا فقدان بيانات** — كل الدوال إضافية ولا تغيير في schema.
4. **بوابة موافقة صريحة قبل كل مرحلة** — لا نشر تراكمي.

---

## 2. المرحلة 0 — تحقق ما قبل النشر (بلا نشر)

| # | الخطوة | معيار الإنجاز |
|---|---|---|
| 0.1 | تأكيد أن `main` والفرع في حالة نظيفة | `git status` نظيف |
| 0.2 | `flutter pub get --enforce-lockfile` + `npm --prefix functions ci` | نجاح |
| 0.3 | تشغيل المجموعات الثلاث | 151 + 122 + 330 |
| 0.4 | تحقق من `ALLOWED_DELIVERY_HOSTS` في بيئة التشغيل | مُعرَّف لغير Click فقط |
| 0.5 | تحقق من **غياب** `VELNIX_KMS_KEY` أو وجوده صحيحاً | fail-closed إن غائب |
| 0.6 | التحقق من حساب تشغيل الدوال وأدواره | `runtimeServiceAccount` مطابق |
| 0.7 | لقطة من قواعد Firestore وفهارسها الحالية | مُحفوظة للتراجع |

---

## 3. المرحلة 1 — دوال إدارة الشركات

**الغرض:** تمكين المدير العام من إعداد شركات التوصيل (بدون أي إرسال).

### الدوال المطلوب نشرها

| # | الدالة | النوع | الصلاحية |
|---|---|---|---|
| 1 | `saveCompany` | callable · `europe-west1` | `manageCompanies` |
| 2 | `archiveCompany` | callable · `europe-west1` | `manageCompanies` |
| 3 | `restoreCompany` | callable · `europe-west1` | `manageCompanies` |
| 4 | `testCompanyConnection` | callable · `europe-west1` | `manageCompanies` |
| 5 | `assignCompany` | callable · `europe-west1` | `manageCompanies` |

### التبعيات
- **`VELNIX_KMS_KEY` MUST exist** — `saveCompany` يستدعي `encryptSecret`. بدونه يفشل الحفظ بـ`kms_not_configured_or_bad_secret`.
- `ALLOWED_DELIVERY_HOSTS` لـ`testCompanyConnection`.
- App Check مفعّل — التطبيق يجب أن يمرّر رمزاً صالحاً.

### أوامر النشر (للتنفيذ بموافقة فقط)
```bash
firebase deploy --only functions:saveCompany,functions:archiveCompany,\
functions:restoreCompany,functions:testCompanyConnection,functions:assignCompany \
  --project velnix-6c1a2
```

### تحقق بعد النشر
| # | التحقق | المتوقع |
|---|---|---|
| 1 | `firebase functions:list` | 29 دالة |
| 2 | استدعاء من دور غير مخوّل | `permission-denied` |
| 3 | حفظ شركة **بدون** KMS | يفشل بـ`kms_not_configured_or_bad_secret` |
| 4 | حفظ شركة Click بـ`enabled:true` | **يُرفض** — «مسودة معطلة فقط» |
| 5 | حفظ Click مع `apiToken`/`webhookKey`/`statusMap` | **يُرفض** |
| 6 | قراءة `companySecrets` من العميل | **مرفوضة** بقواعد Firestore |
| 7 | `sendOrderToDelivery` | يبقى **غير منشور** |

### التراجع
```bash
firebase functions:delete saveCompany archiveCompany restoreCompany \
  testCompanyConnection assignCompany --project velnix-6c1a2 --force
```
**أثر البيانات:** صفر — الشركات المحفوظة تبقى، لكن لا يمكن تعديلها حتى إعادة النشر.

### المخاطر
| # | الخطر | التخفيف |
|---|---|---|
| 1 | حفظ شركة Click مفعّلة بالخطأ | **مُمنع في الكود** — يرفض `enabled:true` لـClick |
| 2 | تسريب سرّ | مشفّر بـKMS؛ العميل محجوب بالقواعد |
| 3 | `testCompanyConnection` يصل لمضيف غير مُدرَج | `allowedUrl` يرفض |

---

## 4. المرحلة 2 — إشعارات FCM

**الغرض:** إشعارات الجهاز الحقيقية. **مستقلة تماماً عن Click.**

### الدوال المطلوب نشرها

| # | الدالة | النوع | المنطقة |
|---|---|---|---|
| 1 | `registerDevice` | callable | `europe-west1` |
| 2 | `unregisterDevice` | callable | `europe-west1` |
| 3 | `pushNotice` | `onDocumentCreated` على `notices/{noticeId}` | `europe-west1` |
| 4 | `recoverPushes` | مُجدوَل | `europe-west1` |

### التبعيات
- **نشر 1 و2 معاً** — إلغاء التسجيل بلا تسجيل لا معنى له.
- تفعيل `VELNIX_PUSH_ENABLED=true` في بناء التطبيق (منفصل عن النشر).
- APNs (iOS) أو شهادة عادية (Android) — لا يتطلّب Click.
- **حساب Google اختبار معتمد** لإثبات التسجيل المُ authenticated.
- `pushNotice` يعتمد على `notices` المُنشأة من `orderEventNotice` (**منشور فعلاً**).

### تحقق بعد النشر
| # | التحقق | المتوقع |
|---|---|---|
| 1 | `firebase functions:list` | 33 دالة |
| 2 | `registerDevice` بلا مصادقة | `permission-denied` |
| 3 | تسجيل رمز قصير/غير نصّي | `invalid-argument` |
| 4 | تسجيل نفس الرمز مرتين | **مستند واحد** (معرّف مشتق من الرمز) |
| 5 | 21 جهازاً | رفض بـ`resource-exhausted` |
| 6 | `unregisterDevice` لجهاز موظف آخر | **لا يحذف** (فحص `uid`) |
| 7 | تسليم لموظف موقوف | **لا تسليم** (`active` يُفحص عند الإرسال) |
| 8 | إشعار لا يحتوي بيانات عميل | الحمولة عامة فقط |
| 9 | المقدمة/الخلفية/الإغلاق التام | وصول فعلي على جهاز حقيقي |

### التراجع
```bash
firebase functions:delete registerDevice unregisterDevice pushNotice recoverPushes \
  --project velnix-6c1a2 --force
```
**أثر البيانات:** مجموعة `devices` تبقى لكنها غير مستخدمة. الإشعارات داخل التطبيق (`notices`) **تستمر بالعمل** لأنها لا تعتمد على FCM.

### المخاطر
| # | الخطر | التخفيف |
|---|---|---|
| 1 | إشعارات مكررة | مفتاح `sha256(orderId:eventKey:recipientId)` + مطالبة ذرّية |
| 2 | تسريب بيانات في شاشة القفل | الحمولة عامة؛ التفاصيل داخل التطبيق فقط |
| 3 | إغراق FCM | حدّ 20 جهازاً؛ فشل الدفعة يُصنَّف ويُعاد بتراجع أسّي |

---

## 5. المرحلة 3 — إرسال الشحنات عبر Click ⛔ **محظورة**

**الشرط الوحيد للبدء:** إجابات المزوّد على D4/D7/D9/D10 **موثَّقة كتابةً**.

| # | الدالة | محظورة حتى |
|---|---|---|
| 1 | `sendOrderToDelivery` | D4 + D7 + D10 |
| 2 | `resolveDispatchException` | تابع |

**لماذا محظورة:**
- **D4**: بلا طريقة HTTP لـ`setorder` لا يمكن بناء الطلب.
- **D7**: بلا حسم `Ord_Amt` سيكون **المبلغ المُرسل خاطئاً** — مشكلة مالية حقيقية مع العميل.
- **D10**: بلا idempotency لدى المزوّد، انقطاع الشبكة قد يُنشئ **شحنتين لنفس الطلب**.

**ما يجب إنجازه قبلها:**
1. إجابات مكتوبة من Click
2. اختبار `getorder` على شحنة اصطناعية في sandbox (قراءة فقط) — يستخدم `exerciseGetOrderRequest`
3. **إعادة بناء محلّل الاستجابة على استجابات حقيقية**
4. `setorder` واحدة في sandbox بموافقة منفصلة
5. اختبار إعادة الإرسال بنفس `Client_Serial`
6. بناء mapping حالات مُثبَت من استجابات حقيقية
7. **عندها فقط** النشر والتفعيل لشركة واحدة

---

## 6. المرحلة 4 — الجدولة والمزامنة

| # | الدالة | الشرط |
|---|---|---|
| 1 | `reconcileDeliveryStatuses` | mapping حالات مُثبَت (من المرحلة 3) |
| 2 | `deliveryWebhook` | عقد webhook موثّق + سرّ توقيع |

**تبقى معطّلة** حتى إثبات mapping — تفعيلها قبل ذلك يُدخل حالات غير موثّقة على طلبات حقيقية.

---

## 7. متغيرات البيئة المطلوبة

| المتغير | المرحلة | إلزامي؟ | ملاحظة |
|---|---|---|---|
| `VELNIX_KMS_KEY` | 1 | **نعم** | مسار مفتاح Cloud KMS — يفشل الحفظ بدونه |
| `ALLOWED_DELIVERY_HOSTS` | 1 | **نعم** | قائمة مضيفين بديلة عن Click |
| `VELNIX_PUSH_ENABLED` | 2 | **نعم** (بناء) | راية بناء في التطبيق لا في الدوال |
| `FIREBASE_VAPID_KEY` | 2 | Web فقط | غير مطلوب للجوال |
| `FCM_*` | — | لا | لا حاجة لتهيئة يدوية |

**لا يُضاف أي سرّ إلى المستودع.** تُدار عبر بيئة الدوال.

---

## 8. مصفوفة التراجع السريع

| السيناريو | الإجراء | الأثر |
|---|---|---|
| فشل حفظ شركة | حذف دالة `saveCompany` | الإعدادات القائمة تبقى |
| إشعارات مكررة | حذف `pushNotice` | الإشعارات الداخلية تستمر |
| تسريب أسرار | تدوير مفتاح KMS + حذف `companySecrets` | إعادة إدخال الاعتمادات |
| إرسال شحنة خاطئ | حذف `sendOrderToDelivery` + `dispatchState='needs_review'` | يمنع أي إرسال إضافي |
| قواعد Firestore خاطئة | إعادة النشر من آخر إصدار | فوري |
| بناء سيئ للتطبيق | إعادة الإصدار السابق (Git tag) | البناء قابل لإعادة الإنتاج |

**قاعدة:** كل تراجع يحافظ على البيانات. **لا عملية تراجع تمسّ `orders` أو `members`.**

---

## 9. فجوة حرجة يجب حلّها قبل بيانات حقيقية

⛔ **لا توجد استراتيجية نسخ احتياطي/استرجاع مُوثَّقة أو مُختبَرة لـFirestore.**

| الخيار | ملاحظة |
|---|---|
| تصدير مجدول (`gcloud firestore export`) | يتطلب bucket + جدولة |
| Point-in-Time Recovery | يتطلب تفعيله على قاعدة البيانات |
| تصدير يدوي قبل كل مرحلة | حدّ أدنى مقبول للبداية |

**يجب اختيار أحدها وتنفيذ اختبار استرجاع فعلي قبل أي تشغيل ببيانات إنتاجية.**

---

## 10. بوابات الموافقة

| البوابة | قبل | يحجب |
|---|---|---|
| **G1** | المرحلة 1 | لا يوجد KMS إنتاجي |
| **G2** | المرحلة 2 | لا حساب اختبار معتمد |
| **G3** | المرحلة 3 | عقد Click ناقص |
| **G4** | المرحلة 4 | لا عقد webhook ولا mapping |
| **G5** | أي بيانات حقيقية | لا نسخ احتياطي |

**لا تُعبَر أي بوابة بلا موافقة مالك صريحة ومنفصلة.**