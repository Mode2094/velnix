# Stage 6 — FCM والإشعارات: التنفيذ والقبول

المستودع: `Mode2094/velnix` · الفرع: `audit/production-readiness` · خط الأساس: `e68ba9ba15c84f261b1ae49b008fa4bcd6aa18e3`
مشروع Firebase: `velnix-6c1a2` · Android App ID: `1:948196868655:android:4465def254bb941ac43cda` · الحزمة: `com.mode2094.velnix`

**لم يُنشر أي Cloud Function أو Rules أو Hosting.** لم تُغيَّر إعدادات App Check ولا IAM ولا OAuth. لم يُنشأ أي مستخدم أو طلب. لم تُرسَل أي رسالة FCM حقيقية.

---

## 1. البنية القائمة والتغييرات المنفَّذة

### 1.1 ما كان موجوداً (وأُعيد استخدامه — لم يُنشأ نظام موازٍ)

| الطبقة | الملف | الوظيفة |
|---|---|---|
| النموذج | `notices/{sha256(orderId:eventKey:recipientId)}` | إشعار داخلي: `recipientId, title, body, orderId, read, createdAt` + آلة حالات الدفع |
| المُشغِّل | `orderEventNotice` على `orders/{orderId}/events/{eventId}` | ينشئ الإشعارات عند أحداث الطلب |
| فلترة المستلمين | `notifyRecipients` | عضو `active` + اجتياز `canSeeOrder` |
| الإرسال | `pushNotice` على `notices/{noticeId}` → `processPush` | مطالبة ذرّية + إجازة + محاولات + تراجع أسّي |
| التسجيل | `registerDevice` / `unregisterDevice` | دوال callable موثَّقة الهوية + App Check |
| العميل | `notifications_service.dart` · `device_revocation.dart` · `live_app.dart` | تفعيل اختياري، إبطال، مستمعو FCM |

### 1.2 التغييرات المنفَّذة في هذه المرحلة

**(أ) قناة إشعارات Android مسمّاة** — كانت الإشعارات تسقط في قناة النظام الاحتياطية غير المسمّاة، فلا يستطيع الموظف تمييز تحديثات الطلبات ولا ضبط أهمّيتها:

- `android/app/src/main/kotlin/com/mode2094/velnix/MainActivity.kt` — إنشاء القناة في `onCreate`
- `android/app/src/main/res/values/strings.xml` — اسم ووصف عربيان (ملف جديد)
- `AndroidManifest.xml` — `com.google.firebase.messaging.default_notification_channel_id = velnix_order_updates`
- `functions/src/push.js` — `android.notification.channelId` بنفس المعرّف

**(ب) استخراج منطق التوجيه النقيّ** — كان منطق النقر/إزالة التكرار محبوساً داخل حالة واجهة غير قابلة للاختبار:

- `lib/live/push_routing.dart` (جديد): `PushRouting.orderTarget` و`shouldPresentForeground`
- `lib/live/live_app.dart` يستخدمه. **السلوك محفوظ**، مع تحسين دفاعي: معرّف غير نصّي يعيد `null` بدل رمي استثناء.

**(ج) اختبارات** — Dart وNode وتغطية قواعد للأجهزة (التفاصيل في §6).

---

## 2. مصفوفة الأحداث والمستلمين

| الحدث | المصدر | المستلمون | الفلترة |
|---|---|---|---|
| إنشاء طلب | `orders/{id}/events/{eventId}` بـ`action=created` | منشئ الطلب + المشرف المباشر (إن كان المنشئ `dataEntry`) + كل `generalManager`/`manager`/`warehouse` | `active===true` **و** `canSeeOrder` |

**عنوان الإشعار:** «طلب جديد» أو «تحديث طلب» · **النص:** «افتح الطلب لعرض آخر تغيير.»
**لا تُدرج أي بيانات عميل** (اسم/هاتف/عنوان/مبلغ) في الحمولة ولا في معاينة شاشة القفل — مؤكَّد باختبار.

مفتاح إزالة التكرار: `sha256(orderId:eventKey:recipientId)` ⇒ نفس الحدث لن يُنتج إشعاراً مكرّراً، ويُلتقط خطأ `already-exists` بصمت.

---

## 3. حالة تنفيذ Android

| البند | الحالة |
|---|---|
| `POST_NOTIFICATIONS` في المانيفست | ✅ موجود |
| `firebase_messaging_auto_init_enabled=false` | ✅ إنشاء الرمز صريح فقط عبر التفعيل الاختياري |
| قناة مسمّاة | ✅ **IMPLEMENTED + EMULATOR TESTED** |
| `launchMode=singleTop` | ✅ مطلوب لالتقاط النقر |
| بناء Debug | ✅ `exit 0` — المانيفست المبني يحتوي القناة |
| تفعيل اختياري | ✅ محكوم بـ`VELNIX_PUSH_ENABLED` |

---

## 4. حالة تنفيذ iOS

| البند | الحالة |
|---|---|
| بناء iOS Simulator | ✅ `exit 0` (70.6s) — لا انحدار |
| `SETUP`/مستمعو FCM في Dart | ✅ مشتركون مع Android |
| **ملف entitlements** | ❌ **غير موجود** |
| **`aps-environment`** | ❌ **غير موجود** |
| **`UIBackgroundModes: remote-notification`** | ❌ **غير موجود** |
| **Push Notifications capability في pbxproj** | ❌ غير مُعلَنة |

**لم أُضِف الأذونات عمداً.** إضافة `aps-environment` تغيير يمسّ **التوقيع**، وهو ممنوع صراحةً في قيود هذه المهمة («No release signing changes»). كما أنه **غير قابل للتحقق محلياً** بلا هوية مطوّر Apple، ويمكن أن يُعطّل مسار البناء الموقَّع الحالي.

**المطلوب (بموافقة المالك):** إضافة Push Notifications + Background Modes: Remote notifications في Xcode، وإنشاء ملف entitlements يحوي `aps-environment`، وملف تعريف تزويد يدعم Push، ثم تشغيل التطبيق على **جهاز حقيقي** — محاكي iOS لا يحصل على رمز APNs/FCM حقيقي.

---

## 5. دوال الخلفية وفحوص الأمان

### 5.1 الفحوص المُتحقَّق منها في المصدر

| المطلوب | التنفيذ | الدليل |
|---|---|---|
| مصادقة Firebase | `requireAuth` ⇒ `requireGoogleSession` + `members/{uid}.active===true` + دور صالح | `index.js:32-42` |
| App Check | `enforceAppCheck: true` على كل callable | `index.js:25` |
| تحقّق الدور/العضوية على الخادم | `currentActor(tx,user)` يعيد رفض تغيّر الدور/الصلاحيات/المشرف/`authorizationVersion` | `index.js:43-46` |
| ملكية المستخدم/الجهاز | `unregisterDevice` يحذف فقط إذا `device.uid===user.id` | `index.js:557-559` |
| تحقّق الرمز وحدّ الطلب | `deviceId` يرفض غير النصّي/`<20`/`>4096`/ذات الفراغات | `push.js:9-13` |
| تسجيل idempotent | معرّف الجهاز = `sha256(token)` ⇒ `set` يؤدي دور upsert، مع حدّ 20 جهازاً | `index.js:548-555` |
| إزالة رمز آمنة | الرموز غير الصالحة تُحذف تلقائياً عند `registration-token-not-registered` | `push.js:33-36` |
| أخطاء منظّمة بلا تسريب | `safeCode()` يعيد رموزاً مصنّفة فقط، ولا نصّ خطأ خام | `push.js:8` |
| الرموز لا تُكتب من العميل | قواعد Firestore: `match /{document=**}: allow read, write: if false` | `firestore.rules` |
| عدم إدراج بيانات حساسة | الحمولة: عنوان عام + نص عام + `noticeId`/`orderId` فقط | `push.js` + اختبار |

### 5.2 منع المستلمين غير المصرَّح لهم

مزدوج: `notifyRecipients` يفلتر عند **الإنشاء**، و`deliverNotice` يعيد فحص `active` + `canSeeOrder` عند **الإرسال**. أي إلغاء صلاحية بين الإنشاء والإرسال يمنع التسليم.

### 5.3 فشل التسليم

تصنيف الأخطاء إلى `TEMPORARY` (إعادة بتراجع أسّي، بحدّ 4 محاولات) و`INVALID` (حذف الجهاز فوراً). `recoverPushes` مجدول يسترد الإيجازات المنتهية والحالات القديمة.

**لا يُعتبر نجاح واجهة الإرسال إثباتاً للتسليم على الجهاز** — الحالة `pushOutcome` تسجّل نجاح/فشل كل جهاز على حدة، والفشل الجزئي المُستنفَد يُعلَن `failed` لا `sent`.

---

## 6. نتائج الاختبارات الآلية

| المجموعة | النتيجة | ملاحظة |
|---|---|---|
| Functions unit | **130 نجاح / 0 فشل** | كان 128 ⇒ **+2 جديد** |
| Functions emulator | **118 نجاح / 0 فشل** | يشمل تغطية `devices/*` الجديدة |
| `flutter analyze` | **No issues found** | المشروع كامل |
| `flutter test` | **+330 / −18** | كان +323 ⇒ **+7 جديد**؛ الـ18 فشل **golden pixel على macOS فقط** |

### اختبارات جديدة

**Node (`functions/test/push.test.js`):**
- حمولة Android تستهدف القناة المسمّاة `velnix_order_updates`، والعنوان `Velnix`، وبلا أي بيانات عميل
- هويّة الجهاز مرتبطة بالرمز ⇒ تسجيلان مختلفان لا يتصادمان

**Dart (`test/push_routing_test.dart`) — 7 اختبارات:**
- التوجيه إلى الطلب المسمّى، وتشذيب الفراغات
- عدم اختراع وجهة عند غياب `orderId`
- تجاهل معرّف غير نصّي بدل الفشل
- إزالة تكرار المقدمة بنفس `noticeId`
- إشعارات مختلفة تُعرض كلٌّ على حدة
- إشعار بلا `noticeId` لا يُسقَط أبداً

**القواعد (`functions/test/emulator/rules.test.js`):**
- أُضيف `devices/device` إلى قائمة المسارات الممنوعة لكل الأدوار الخمسة (قراءة/كتابة/حذف)

**لم تُخفَّف أي تأكيدات** لإرضاء الاختبارات. فشل الـgolden الـ18 موثَّق منفصلاً كفرق خطوط على macOS.

---

## 7. دليل وقت التشغيل على المحاكي

`emulator-5554` (AVD `palladium_test`) · `adb install -r` ⇒ `Success` · PID `7242` مستقر.

**القناة أُنشئت فعلياً في وقت التشغيل** (من `dumpsys notification`):

```
AppSettings: com.mode2094.velnix (10192) importance=NONE userSet=false
  NotificationChannel{mId='velnix_order_updates', mName=تحديثات الطلبات,
    mDescription=hasDescription, mImportance=3, mDeleted=false, mShowBadge=true}
```

| الفحص | النتيجة |
|---|---|
| معرّف القناة | `velnix_order_updates` ✅ |
| الاسم | «تحديثات الطلبات» بالعربية ✅ |
| الأهمية | `3` = IMPORTANCE_DEFAULT ✅ |
| محذوفة؟ | `mDeleted=false` ✅ |

كما أُكِّد وجود الـmeta-data في **الـAPK المبني** عبر `aapt2 dump xmltree`.

**ملاحظة دقيقة:** `AppSettings important=NONE` على مستوى التطبيق — أي أن الإشعارات **محجوبة على مستوى النظام حتى يمنح الموظف الإذن** عبر مسار التفعيل الاختياري. القناة موجودة، لكن لا شيء يُعرض قبل الموافقة. هذا السلوك مقصود.

---

## 8. سلوك تسجيل الرموز والتنظيف

| الحالة | السلوك |
|---|---|
| التسجيل | `registerDevice` ⇒ معرّف مشتق من الرمز ⇒ تكرار التسجيل لا يُنشئ نسخة ثانية |
| تدوير الرمز | `onTokenRefresh` ⇒ إعادة تسجيل تلقائية |
| الخروج | `signOut()` ⇒ إلغاء التسجيل ثم إبطال الرمز ثم إنهاء الجلسة، ويُتابَع التنظيف حتى لو فشل الخادم |
| الإيقاف | `disable()` ⇒ `revokeDeviceToken` (ترتيب مضمون مع محاولة كل خطوة) |
| الإيقاف الإداري | إرسال الإشعارات يتحقق من `members/{id}.active` في كل تسليم ⇒ العضو الموقوف لا يستقبل |
| رمز بائد | يُحذف تلقائياً من مجموعة `devices` ويُعلَن فشل ذلك الجهاز |
| حدّ الأجهزة | 20 جهازاً لكل مستخدم؛ الرسالة تطلب حذف جهاز قديم |

**نقص مُوثَّق:** لا يوجد استدعاء تلقائي لإلغاء التسجيل عند **إيقاف الحساب من الإدارة** بينما التطبيق مفتوح؛ الإيقاف يمنع التسليم على الخادم فوراً، لكن تنظيف المجموعة يتطلّب تسجيل خروج. مقترح لمرحلة لاحقة.

---

## 9. نتائج المقدمة/الخلفية/الإغلاق — منفصلة

| الحالة | التنفيذ | الحالة |
|---|---|---|
| **المقدمة** | `FirebaseMessaging.onMessage` ⇒ شريط داخلي مع زر «فتح» + إزالة تكرار بـ`noticeId` | **UNIT TESTED** (منطق `PushRouting`) — لم يُختبر بحمولة حقيقية |
| **الخلفية (نقر)** | `onMessageOpenedApp` ⇒ فتح تفاصيل الطلب | **IMPLEMENTED + UNIT TESTED** — لم يُختبر بحمولة حقيقية |
| **الإغلاق التام** | `getInitialMessage()` ⇒ نفس المسار | **IMPLEMENTED + UNIT TESTED** — لم يُختبر بحمولة حقيقية |
| **عرض النظام في الخلفية** | حمولة `notification` ⇒ النظام يعرضها في القناة المسمّاة | **EMULATOR TESTED** (القناة قائمة) — **لم تُستقبل حمولة فعلية** |

**لا يُدَّعى** وصول أي إشعار حقيقي: لم تُرسَل رسالة ولم يُستقبَل رمز، فالاختبارات إعلاه منطقية/بنية وليست إثبات تسليم.

---

## 10. متطلبات النشر الإنتاجي الدقيقة

| # | المتطلب | النوع |
|---|---|---|
| 1 | نشر `registerDevice` و`unregisterDevice` و`pushNotice` و`orderEventNotice` و`recoverPushes` إلى `velnix-6c1a2` (منطقة `europe-west1`، والمُشغِّل على `us-central1`) | نشر — **ممنوع هنا** |
| 2 | جدولة `recoverPushes` (Cloud Scheduler) | نشر |
| 3 | تفعيل `VELNIX_PUSH_ENABLED=true` في بناء الإصدار | بناء إصدار |
| 4 | توفير `FIREBASE_VAPID_KEY` (Web فقط) | إعداد |
| 5 | iOS: أذونات Push + **جهاز حقيقي** + ملف تزويد | موافقة + جهاز |
| 6 | Android: توقيع الإصدار (حالياً شهادة Debug فقط) | توقيع |

---

## 11. العوائق والصلاحيات المطلوبة من المالك

| # | العائق | السبب الدقيق |
|---|---|---|
| 1 | التسجيل المُ authenticated غير مُختبَر | يتطلّب حساب Google اختبار معتمد (نفس عائق Stage 5) |
| 2 | الإرسال الحقيقي غير مُختبَر | يتطلّب نشر الدوال — **ممنوع** |
| 3 | الاستقبال غير مُختبَر | يتبع الإرسال الحقيقي + رمز جهاز صالح |
| 4 | iOS APNs | لا entitlements ولا هوية مطوّر Apple؛ إضافتها **تغيير توقيع — ممنوع** |
| 5 | App Check على الخادم | غير مُختبَر (Stage 5) |
| 6 | تنظيف تلقائي عند إيقاف الحساب | نقص تصميمي موثَّق (§8) |

---

## 12. الحكم

### **PARTIAL**

| التصنيف | البنود |
|---|---|
| **IMPLEMENTED** | كل الطبقات: النموذج، المُشغِّل، فلترة المستلمين، idempotency، آلة حالات الإرسال، التسجيل/الإلغاء، مستمعو المقدمة/الخلفية/الإغلاق، القناة المسمّاة، إزالة التكرار |
| **UNIT TESTED** | 130 اختبار Functions + 330 اختبار Flutter (منها 7 جديدة للتوجيه) |
| **EMULATOR TESTED** | إنشاء القناة المسمّاة وقت التشغيل + المانيفست في APK + 118 اختبار محاكي Firestore شاملة رفض وصول العملاء إلى `devices` |
| **PRODUCTION NOT VERIFIED** | التسجيل المُ authenticated · الإرسال من الخادم · الاستقبال فعلياً في المقدمة/الخلفية/الإغلاق · APNs على iOS · App Check على الخادم |

**لا يُعلن Stage 6 PASS** — القبول يشترط تسجيلاً مُ authenticated حقيقياً وإرسالاً من الخادم واستقبالاً فعلياً في الحالات المطلوبة، ولم يتحقّق أيٌّ منها. القيود المانعة المفروضة على هذه المهمة هي سبب ذلك، لا نقص في التنفيذ.

---

## 13. حالة Git

- `main` **لم يُمسّ** · PR #1 **OPEN/Draft**
- تعديل `ci.yml` المعلّق **محفوظ ولم يُودَع**
- لم تُودَع أي رموز أو مفاتيح أو أسرار

**آخر SHA:** `70e4bcbe39032ba8fdabaaf066a1e85748f8a5d9`
**CI:** Push ✅ `success` (39115412271) · PR ✅ `success` (39115415041)