# إعداد Firebase الحقيقي لتشغيل Velnix

> وثيقة تاريخية؛ لا تنفذ أوامر إنشاء مشروع أو تفعيل مزودات/فوترة منها. المرجع الحالي [إعداد Firebase](FIREBASE_SETUP.md) و[Google فقط وموافقة الانضمام](GOOGLE_ONLY_ACCESS_MIGRATION_AR.md)؛ لا كلمات مرور موظفين ولا تعطيل Email/Password قبل القبول. عقد generic أدناه ليس عقد Click، ومحول Click محجوب.

## 1) البرامج والحسابات
- Flutter حديث يدعم Dart >=3.6 (حسب حزم Firebase المختارة)، Firebase CLI وFlutterFire CLI، Node 22 وGoogle Cloud CLI.
- أنشئ Firebase Project واحداً للعميل، وفعّل **Email/Password Authentication** وCloud Firestore وCloud Functions وApp Check.
- تحتاج خطة فوترة تدعم Cloud Functions (2nd gen) وCloud Scheduler وKMS؛ راقب الميزانية وحدود الاستخدام.

## 2) تثبيت الملفات المحلية

```bash
unzip Velnix_Firebase_Integrated_v5.zip
cd Velnix_Firebase_Integrated_v5
flutter create --platforms=android,ios,web .
flutter pub get
npm --prefix functions install
flutter analyze
flutter test
npm --prefix functions run syntax
npm --prefix functions test
```

**مهم:** لا توجد مجلدات منصات Flutter الأصلية ضمن ZIP؛ توليدها خطوة إلزامية. بناء iOS يحتاج macOS مع Xcode؛ نشر المتاجر غير مشمول.

## 3) التهيئة وربط المشروع

```bash
firebase login
firebase use --add
flutterfire configure --project=YOUR_PROJECT_ID --platforms=android,ios,web
```

بعدها لتشغيل **وضع المعاينة**:

```bash
flutter run -d chrome --dart-define=VELNIX_MODE=demo
```

و**وضع Firebase الحقيقي** يستخدم `VELNIX_MODE=live` (الافتراضي). إن تعذر تهيئة Web تلقائياً، زوّد FirebaseOptions العامة باستخدام `--dart-define` أو ملف إعدادات محلي لا يحتوي أسراراً. مثال دون قيم فعلية:

```bash
flutter run -d chrome --dart-define=VELNIX_MODE=live \
  --dart-define=FIREBASE_PROJECT_ID=YOUR_PROJECT_ID \
  --dart-define=FIREBASE_APP_ID=YOUR_WEB_APP_ID \
  --dart-define=FIREBASE_API_KEY=YOUR_PUBLIC_FIREBASE_API_KEY \
  --dart-define=FIREBASE_SENDER_ID=YOUR_SENDER_ID \
  --dart-define=FIREBASE_AUTH_DOMAIN=YOUR_PROJECT_ID.firebaseapp.com \
  --dart-define=FIREBASE_APPCHECK_SITE_KEY=YOUR_RECAPTCHA_SITE_KEY
```

مفاتيح إعداد Firebase التي تظهر في تطبيق العميل ليست **مفاتيح شركة التوصيل** ولا بيانات اعتماد مسؤول الخدمة. لكن ينبغي تقييد API key وفق توصيات Firebase.

تفعيل App Check إلزامي للوظائف الحية (`enforceAppCheck: true`). لا تشغّله بـdebug في الإنتاج. Android يستخدم Play Integrity، iOS يستخدم DeviceCheck، والويب reCAPTCHA v3 وفق إعدادات المشروع. استخدم debug provider للتطوير فقط:

```bash
flutter run --dart-define=VELNIX_DEBUG_APPCHECK=true
```

احرص على تسجيل تطبيقات Android/iOS/Web في App Check حتى لا تُرفض الطلبات الحقيقية.

## 4) أمان أسرار التوصيل

أنشئ KMS key وخوّل حساب خدمة Functions صلاحية encrypt/decrypt. مثال **توضيحي فقط** عبر Cloud Console أو gcloud (راجع Project Number والـregion واسم حساب الخدمة قبل التنفيذ). انقل قيم `functions/.env.example` إلى `functions/.env.YOUR_PROJECT_ID`:

```ini
VELNIX_KMS_KEY=projects/YOUR_PROJECT_ID/locations/europe-west1/keyRings/velnix/cryptoKeys/delivery-secrets
ALLOWED_DELIVERY_HOSTS=api.real-delivery-provider.example
```

الملف `.env.*` مستبعد من Git. لا تضع رمز API فيه ولا في Firebase client؛ المدير يدخله داخل شاشة الشركة فيتم تشفيره داخل Cloud KMS وتخزين ciphertext في `companySecrets` الذي لا يمكن لتطبيق العميل قراءته.

## 5) نشر القواعد والوظائف

```bash
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only functions
```

راجع تكلفة Cloud Scheduler، Cloud KMS، دوال الاستدعاء وقراءات Firestore قبل النشر. مثال استدعاء Webhook (بعد نشر الوظيفة):

```
https://europe-west1-YOUR_PROJECT_ID.cloudfunctions.net/deliveryWebhook?companyId=COMPANY_ID
```

يتطلب Webhook ترويسات `x-velnix-timestamp` (Unix seconds) و`x-velnix-signature` بالشكل `sha256=<hex>`. التوقيع هو `HMAC_SHA256(webhookSecret, "<timestamp>." + raw_request_body)`. صيغة الجسم المبدئية:

```json
{"reference":"FIRESTORE_ORDER_ID","status":"delivered"}
```

يجب أن يتوافق **Vendor Adapter** مع الشركة المحددة: `GET /health`، `POST /orders` مع `reference` و`idempotencyKey`، والاستجابة برقم `trackingNumber`، و`GET /orders/{tracking}` مع `status`. لا يصح افتراض أن أي شركة توصيل تستخدم هذا البروتوكول.

## 6) إنشاء المدير العام الأول

هذا القسم استُبدل بـ[خطة Google فقط والترحيل الآمن](GOOGLE_ONLY_ACCESS_MIGRATION_AR.md). لا تنشئ كلمات مرور للموظفين أو المدير. يحتاج bootstrap إلى Google UID موثق وتأكيد المشروع، وهو dry-run افتراضياً ويرفض أي إدارة موجودة؛ --apply يحتاج تفويضاً منفصلاً. عند وجود إدارة حالية، أثبت Google على UID نفسه قبل النشر ولا تعطل Email/Password الآن.

## 7) اختبارات قبل التشغيل

- `firebase emulators:start --only auth,firestore,functions` مع إعدادات App Check debug وSDK emulator routing (النسخة الحالية لا تضبطها تلقائياً).
- فحص كل حساب حقيقي بصلاحياته، ومحاولات الوصول غير المسموح عبر callable، والانتقالات المحظورة.
- إدخال/تعديل/إرسال طلب إلى sandbox الشركة، استقبال webhooks صحيحة ومزورة ومتكررة وبالترتيب العكسي.
- فحص 320/375/390/768/1024/1440/1920 px والتكبير وإمكانية الوصول.
- مراجعة بيانات حقيقية بعد طلبات كثيرة للتأكد من الكلفة والعدّادات ومزامنة أكثر من 100 شحنة.

## مصادر تقنية

- https://docs.flutter.dev/app-architecture/guide
- https://docs.flutter.dev/ui/adaptive-responsive
- https://firebase.google.com/docs/firestore/security/rules-query
- https://firebase.google.com/docs/firestore/solutions/role-based-access
- https://firebase.google.com/docs/app-check/flutter/default-providers
- https://firebase.google.com/docs/functions/callable
- https://firebase.google.com/docs/firestore/security/test-rules-emulator
- https://firebase.google.com/support/release-notes/flutter
