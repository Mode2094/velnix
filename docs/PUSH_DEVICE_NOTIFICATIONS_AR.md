# إشعارات الجهاز (FCM) — إصلاح السبب الجذري وتفعيلها على الويب وAndroid

> **الحالة: الويب PASS (12/12 اختبار حيّ). Android: البناء والتوقيع والترقية PASS.**
> اختبار الدفع الحيّ على Android لم يُنفَّذ لعدم توفّر جلسة موظف مخوّل (لا بيانات دخول، وتغيير الحسابات ممنوع) — مذكور بصراحة في «القيود».

---

## 1) المشكلة التي أبلغ عنها العميل

عند الضغط على **«تفعيل إشعارات الجهاز»** تظهر الرسالة:

> «إشعارات الجهاز تحتاج تهيئة المؤسسة أولًا؛ استخدم سجل الإشعارات داخل التطبيق»

ولا تصل أي إشعارات حقيقية إلى الجهاز على الويب أو Android، مع أن **سجل الإشعارات داخل التطبيق يعمل**.

---

## 2) السبب الجذري — ثلاثة أعطال مستقلة (لا عطل واحد)

لم يكن السبب مجرد شرط في الواجهة؛ كان النظام معطّلاً في ثلاث طبقات مختلفة، أي عطل منها وحده كان كافيًا لمنع وصول الإشعار:

| # | الطبقة | السبب | الدليل |
|---|---|---|---|
| 1 | **البناء (العميل)** | `VELNIX_PUSH_ENABLED=false` في **كل** ملفات الإعداد، فالزر يرفض الطلب قبل أي محاولة | الرسالة العربية نفسها مصدرها هذا الشرط في `notifications_service.dart` |
| 2 | **التشغيل السحابي (IAM)** | خدمة Cloud Run `pushnotice` كانت بلا **أي** IAM binding، فمُشغّل Eventarc (حساب `velnix-runtime-internal@`) لا يستطيع استدعاءها ويُرفض بـ`run.routes.invoke` | سجلات الإنتاج: مئات الرفض؛ و**902 إشعار داخلي حقيقي كلها `pushState=undefined`** أي أن جسم دالة الدفع **لم يُشغَّل ولا مرة واحدة** |
| 3 | **صلاحية الإرسال** | الدور المخصص `velnixInternalRuntime` يستثني FCM نصًا («no FCM»)، فـ`sendEachForMulticast` يفشل | ظهر كـ`push_send_failed` في الإنتاج، وبعد منح الصلاحية أصبحت الحالة `sent` |
| 4 | **الويب (إعداد ناقص)** | لا يوجد `web/firebase-messaging-sw.js`، وبلا ربط لنقر الإشعار بالطلب، وFCM auto-init معطّل | تحقّق قبل/بعد على الموقع الحيّ |

**ملاحظة مهمة:** الفشل في الطبقتين 2 و3 كان **صامتًا تمامًا** من واجهة المستخدم؛ لهذا ظلّ العميل يرى فقط رسالة «تهيئة المؤسسة» بينما العطل أعمق.

---

## 3) الإصلاحات المنفَّذة

### أ) الويب
- **تفعيل العلم:** `VELNIX_PUSH_ENABLED=true` في إعدادات الإنتاج (ويب + Android).
- **عامل خدمة الدفع:** مولّد `scripts/configure_web_push.py` ينشئ `web/firebase-messaging-sw.js` بلا مفاتيح سرية، ويضيف:
  - `clients.claim()` على `activate` لتملّك التبويبات المفتوحة،
  - معالج `notificationclick` يقرأ الطلب المخوَّل من الحمولة ويفتح `/?order=<id>` (بدل سلوك FCM الافتراضي الذي يكتفي بتركيز التبويب).
- **منع تعارض عامل خدمة Flutter:** `web/index.html` يمنع `flutter_service_worker.js` (المهجور) من استبدال عامل الدفع بعد إعادة التحميل.
- **الخدمة (Dart):** `lib/live/notifications_service.dart` — طلب الإذن، `setAutoInitEnabled(true)`، تسجيل الرمز عبر `registerDevice`، إعادة التسجيل عند `onTokenRefresh`، إلغاء التسجيل عند الإيقاف/الخروج، ورسائل عربية واضحة (مرفوض/محجوب/تعذّر العامل/متصفح غير مدعوم).
- **VAPID:** يُستخدم اعتماد الويب المدمج في FCM؛ مفتاح VAPID المخصص أصبح **اختياريًا** ويُتحق من صيغته فقط عند وجوده (`scripts/check_runtime_config.py` + اختباراته).
- **بوابة بناء تمنع الانحدار:** عند `VELNIX_PUSH_ENABLED=true` يرفض `check_runtime_config.py` (web) أي نشر بلا عامل دفع صالح (`notificationclick` + `clients.claim()`)، حتى لا يتكرر العطل الصامت نفسه.
- **موجّه النقر:** `lib/live/push_routing.dart` + `lib/live/live_app.dart` يفتحان الطلب من `?order=<id>` بعد تجهيز الواجهة المصادَقة.

### ب) الخلفية (Cloud Functions)
- `functions/src/push.js`:
  - حمولة ويب موحّدة: `tag` لكل إشعار (`velnix-<noticeId>`)، أيقونة/شارة، وربط `fcmOptions.link` إلى الطلب.
  - قناة Android `velnix_order_updates` والحقول الأساسية.
  - **مرصودية جديدة:** تسجيل رمز خطأ FCM ورسالته عند الفشل (كان الفشل صندوقًا أسود؛ النجاح يبقى بلا سجلات).
- لا تغيير في منطق الاستحقاق: `deliverNotice` لا يرسل إلا لعضو **نشط** ولطلب **مخوَّل**، وبلا أي بيانات عميل في الحمولة.

### ج) IAM في الإنتاج (التغييران الوحيدان على البنية)
1. `gcloud run services add-iam-policy-binding pushnotice` — منح `roles/run.invoker` للحساب `velnix-runtime-internal@velnix-6c1a2.iam.gserviceaccount.com`.
2. `gcloud iam roles update velnixInternalRuntime` — إضافة **`cloudmessaging.messages.create`** فقط (إرسال، بلا إدارة FCM).

تم إثبات أن كلا التغييرين **دائمان**: واجهة `firebase deploy` لا تكتب هذا الربط في مسار التحديث، لذا لا يُحذف لاحقًا. وأُضيف في `docs/FIRST_INTERNAL_DEPLOY_RUNBOOK_AR.md` فحصان إلزاميان بعد كل نشر: وجود `roles/run.invoker` للحالتين (`orderEventNotice` و`pushNotice`)، ووجود `cloudmessaging.messages.create` في الدور. وحُدِّث تعريف الدور في `config/iam.first-internal-runtime.role.yaml`.

---

## 4) الأدلة الحيّة

### الويب — **PASS 12/12**

اختبار حقيقي على الموقع المنشور: متصفح Chrome 157 عبر CDP، عامل خدمة الدفع الحقيقي، رمز FCM حقيقي، وإشعارات أُنشئت عبر **سلسلة الإنتاج الفعلية** (`pushNotice → deliverNotice → FCM`) لمستلم نشط مخوَّل. حُذف جهاز الاختبار وإشعاراته بعد الانتهاء.

| # | الفحص | النتيجة |
|---|---|---|
| 1 | توليد رمز FCM على الموقع الحيّ | PASS |
| 2 | الخلفية: التريغر يُرسل الحمولة (`pushState=sent`, success=1) | PASS |
| 3 | الخلفية: إشعار نظام واحد فقط | PASS |
| 4 | لا توجد بيانات عميل في نص الإشعار | PASS |
| 5 | حمولة النقر تحمل معرّف الطلب المخوَّل | PASS |
| 6 | أيقونة الإشعار موجودة | PASS |
| 7 | **النقر يفتح التطبيق على الطلب** (`/?order=364bTw6GJ6vWglMPZuX4`) | PASS |
| 8 | الواجهة الظاهرة: `onMessage` يصل داخل التطبيق | PASS |
| 9 | الواجهة الظاهرة: لا إشعار نظام مكرّر | PASS |
| 10 | منع التكرار (نفس معرّف الإشعار يُرفض) | PASS |
| 11 | إشعار عضو آخر لا يصل إلى هذا الجهاز (`no_devices`) | PASS |
| 12 | إذن الإشعارات ممنوح عند الطلب | PASS |

الأدلة الكاملة: `docs/evidence/push-notifications/web-live-verification.json`.

### Android

| البند | النتيجة | الدليل |
|---|---|---|
| بناء APK/AAB موقّع | PASS | `flutter build apk/appbundle --release --dart-define=VELNIX_MODE=live --dart-define=VELNIX_PUSH_ENABLED=true` |
| المفتاح الأصلي (لا إعادة توقيع) | PASS | شهادة `6e57f935…16:01` مطابقة لـ +10/+11/+12 |
| الترقية في المكان فوق نسخة سابقة دون فقدان بيانات | PASS | `versionCode` 11 → 13 و`firstInstallTime` ثابت `2026-11-10 00:09:24` |
| إعداد الدفع داخل الحزمة المبنية | PASS | `aapt2`: `POST_NOTIFICATIONS`، `firebase_messaging_auto_init_enabled=false`، `default_notification_channel_id=velnix_order_updates` |
| كود الدفع العربي فعلاً داخل `libapp.so` | PASS | استخراج `lib/arm64-v8a/libapp.so`: `registerDevice`، `getToken`، وجميع رسائل الخطأ/النجاح العربية (UTF-16LE) موجودة |
| موارد Firebase داخل الحزمة | PASS | `google_app_id`، `gcm_defaultSenderId`، `google_api_key` |
| دفع حيّ (واجهة/خلفية/مغلق) على شاشة Android | **لم يُنفَّذ** | لا جلسة موظف مخوّل + محاكي هذه البيئة بلا رسم مرئي (`screencap` يعيد ملف فارغ) |

---

## 5) ما لم يُختبر بصراحة

- **دفع حيّ على Android بجلسة عميل حقيقية:** لا تتوفر بيانات دخول لحساب مخوّل، وإنشاء/تعديل الحسابات ممنوع. لذلك: كود الإشعارات داخل `libapp.so`، وقناة `velnix_order_updates`، و`POST_NOTIFICATIONS`، ومنع auto-init، وبناء الإصدار — كلها **مُتحقَّق منها في المصدر وحزمة الإصدار المبنية**، لكن **وصول إشعار فعلي إلى شاشة Android لم يُثبت**. ولن يسجّل التطبيق رمز FCM بلا حساب مسجَّل دخول، لذا تعذّر إثبات الإرسال إلى جهاز Android حقيقي من هذه البيئة.
- **فتح تفاصيل الطلب داخل تطبيق ويب مسجَّل:** أُثبت أن النقر ينقل التبويب إلى `/?order=<id>`؛ أما فتح `LiveOrderDetail` من هذا الرابط فمغطّى باختبارات وحدة (`test/push_routing_test.dart`) وربط `live_app.dart`.
- **معاينة الإشعار في الواجهة الظاهرة:** أُثبت على مستوى FCM/SDK (onMessage على عميل مرئي + لا إشعار نظام)، لا من داخل جلسة تطبيق مسجَّلة.
- **`onTokenRefresh` على الويب:** مكتبة FlutterFire للويب تُرجع تيارًا فارغًا (FCM للويب لا يجدّد الرموز بنفس أسلوب الأصل)، فإعادة التسجيل عند الخروج/الدخول هي المسار المعتمد.

---

## 6) الاختبارات والبناء

| البند | النتيجة |
|---|---|
| `flutter analyze` | نظيف |
| `flutter test` | 541 نجاح / 25 فشل بيئي سابق (لا فشل جديد) |
| `functions` (`npm test` + syntax) | 244 نجاح |
| `python3 scripts/test_runtime_config.py` / `test_firebase_setup.py` | نجاح |
| نشر Hosting + Functions | تم |
| بناء ويب بالإعدادات الإلزامية | تم |

---

## 7) الروابط والحِزم

- الموقع الحيّ: `https://velnix-6c1a2.web.app`
- APK: `release/velnix-0.7.0+13/Velnix-0.7.0+13-release.apk` — SHA-256: `80ecbfe0afb74668c4924432037851055110bb930119061906aa4afca5333693`
- AAB: `release/velnix-0.7.0+13/Velnix-0.7.0+13-release.aab` — SHA-256: `fed18a85db5eb9fcbf75ded33d21c133adb4f2d4320a6dbb64bf4b628e320b50`
- وسم Git: `v0.7.0+13`
- MANIFEST الحزمة: `release/velnix-0.7.0+13/MANIFEST.txt`

> حزمة تسليم العميل مُحدَّثة تحت `release/velnix-0.7.0+13/` (APK + AAB + SHA256SUMS + MANIFEST).

## 8) ما لم يُنفَّذ / قيود البيئة

- لم يُغيَّر مشروع Firebase، ولا الفواتير، ولا أي طلب أو حساب.
- إنشاء **GitHub Release** تعذّر: رمز `gh` النشط منتهي الصلاحية (Bad credentials) والحساب البديل بلا صلاحية كتابة. الأثر: تجاوزنا التسمية إلى وسم Git + حزمة `release/` مع SHA-256.
- محاكي Android في هذه البيئة غير مستقر (انهيار `system_server` وQEMU عند التحميل الثقيل، و`screencap` يعيد ملفات فارغة)، ما حال دون اختبار واجهة Android المرئي.
