# تهيئة المشروع الحالي على Android وiOS وWeb

> تحديث سياسة الدخول: [Google فقط وموافقة الانضمام](GOOGLE_ONLY_ACCESS_MIGRATION_AR.md). ملفات التهيئة المحلية السابقة ما زالت Google=false؛ يلزم true بعد ضبط المزود والهوية. لا تنشر Backend الجديد قبل إثبات Google UID للإدارة الحالية، ولا تعطّل Email/Password الآن.

الطلب الحالي يعتمد مشروعاً واحداً `velnix-6c1a2` للتجربة والتسليم النهائي، ابتداءً من f9071d1 على audit/production-readiness. هذا يحدّث افتراض المشروع التجريبي المستقل في الخطط السابقة. قيمة VELNIX_ENVIRONMENT=staging في ملفات التشغيل المحلية تعبر عن نية البناء فقط، ولا تعزل قاعدة البيانات أو المستخدمين أو الموارد. لا تختبر wipe/import/backfill أو suite محاكي على هذا المشروع؛ الاختبارات تبقى demo-velnix المحلية فقط. لا موارد أو Blaze أو Deploy أو Merge أو تعديل بيانات أو اتصال Click في هذه المهمة.

## التسجيلات المستخدمة ومصدرها

| المنصة | App ID | المصدر |
|---|---|---|
| Android | 1:948196868655:android:4465def254bb941ac43cda | google-services.json المرفق، client الخاص بـcom.mode2094.velnix |
| iOS | 1:948196868655:ios:58a6ca83ccb4e1e3c43cda | GoogleService-Info.plist المرفق، BUNDLE_ID=com.mode2094.velnix |
| Web | 1:948196868655:web:ace9b264b4fae48ac43cda | firebaseConfig الذي أرسله المالك في الطلب الحالي فقط |

project ID وsender ID وstorage bucket تطابقت عبر المصادر الثلاثة؛ مفاتيح SDK العامة مأخوذة من مصدر كل منصة ولا تفترض أنها متطابقة. لم نستعمل إعداد Web تاريخياً أو FlutterFire CLI ينشئ تسجيلات جديدة. نشاط التسجيل الأخير وعدم pending deletion لا تثبته ملفات SDK أو App ID؛ يتطلب تأكيد صفحة إعدادات مشروع المالك أو قراءة Management API مخولة. لا توجد هوية Google إدارية في البيئة، فلم نعلن تأكيد ذلك. measurementId ليس App Check؛ لم نضف Analytics أو Storage features.

## الملفات المحلية المحفوظة خارج Git

- android/app/google-services.json: الملف المرفق كما هو، Google Services plugin 4.4.4 يولد موارد SDK عند وجود الملف.
- ios/Runner/GoogleService-Info.plist: الملف المرفق كما هو؛ Xcode ينسخه إلى Runner.app بواسطة ios/scripts/copy_firebase_config.sh بعد Resources. إذا غاب في Demo يحذف ملفاً قديماً من target التجميعي، دون تغيير المصدر.
- ios/Flutter/Firebase.local.xcconfig: URL scheme العام المستخرج من REVERSED_CLIENT_ID. Debug/Release/Profile تستخدم optional include؛ Info.plist يقرأ متغيراً دون حفظ OAuth values في المصدر.
- config/firebase.android.public.json وfirebase.ios.public.json وfirebase.web.public.json: الخيارات العامة لكل منصة؛ iosBundleId وstorageBucket من التسجيلات، flags Google/Push/debugAppCheck معطلة.
- config/firebase.web.sdk.public.json: نسخة من Web SDK config المرسل في الطلب الحالي، ليست إدخالاً لملف منصة أصلية.

جميعها مستثناة من Git. لا API keys أو كلمات مرور أو private keys أو Admin SDK credentials في commit. يحتفظ المالك بنسخه الأصلية الآمنة؛ commit وحده لا يحتوي ملفات التشغيل المحلية. FlutterFire مستخدم عبر firebase_core وFirebaseOptions الصريحة لكل منصة؛ لا حاجة لإنشاء تطبيقات أو إعادة توليد المشروع.

## إعادة التجهيز دون اتصال خارجي

الأداة التالية تستخدم ملفات SDK فقط وتتحقق من المشروع وsender/Apps والبكت وpackage/bundle قبل الكتابة. ترفض استبدال تسجيل محلي مختلف وتحافظ على site key/VAPID المضافين سابقاً. لا تتصل بـFirebase ولا تنشئ Apps:

```bash
python3 scripts/prepare_firebase_config.py \
  --android-file /SAFE/PATH/google-services.json \
  --ios-file /SAFE/PATH/GoogleService-Info.plist \
  --web-file config/firebase.web.sdk.public.json \
  --project velnix-6c1a2
```

لا تمرر ملف Web إلى Android/iOS. lib/core/firebase_configuration.dart يتحقق من platform prefix/sender/bundle قبل initializeApp، ثم يحتفظ التطبيق الافتراضي الذي تستعمله Auth/Firestore/Functions. FirebaseFunctions region يبقى europe-west1؛ Firestore يستخدم قاعدة `(default)` وفق الكود الحالي. مطابقة التسجيلات لا تثبت أن قاعدة البيانات موجودة أو أن خدمات Backend منشورة/جاهزة.

## الفحوص والبناء المحلي

```bash
source scripts/cloud-env.sh
python3 scripts/check_runtime_config.py config/firebase.android.public.json --environment staging --platform android --expected-project velnix-6c1a2
python3 scripts/check_runtime_config.py config/firebase.ios.public.json --environment staging --platform ios --expected-project velnix-6c1a2
python3 scripts/check_runtime_config.py config/firebase.web.public.json --environment staging --platform web --expected-project velnix-6c1a2
flutter build apk --debug --dart-define-from-file=config/firebase.android.public.json
flutter build web --no-web-resources-cdn --no-wasm-dry-run --dart-define-from-file=config/firebase.web.public.json
```

فحص Android/iOS offline اجتاز. فحص Web الكامل محجوب بمفتاح reCAPTCHA v3 App Check المفقود؛ build قد ينجح رغم ذلك لكنه ليس تشغيل Firebase صالحاً. لا placeholder مفتعل ولا debug تجاوز للويب. Demo يبقى --dart-define=VELNIX_MODE=demo ويعود قبل تهيئة Firebase في Dart، وCI يبني دون الملفات المحلية. FCM auto-init معطل افتراضياً في إعدادات المنصات، ويعاد تفعيله بعد إذن المستخدم في مسار opt-in القائم ويوقف عند disable قبل حذف token، حتى إذا فشل unregister؛ لا دليل على push فعلي من بناء binary.

على Mac فقط، بعد التهيئة والمراجعة والتفويض المناسب، يمكن فحص بناء iOS عبر flutter build ios --no-codesign --dart-define-from-file=config/firebase.ios.public.json. لم ينفذ هنا؛ Linux بلا Xcode/Apple SDK لا يبني أو يوقع iOS. تمت مراجعة deployment target: iOS15 في المشروع يطابق الحد الأدنى15 في FlutterFire packages المثبتة. المشروع يستخدم Flutter Swift Package Manager الحالي، لا تضف Podfile أو تعيد flutter create بلا سبب. يحتاج تشغيل الجهاز Apple signing/team/provisioning وDeviceCheck؛ APNs وPush capabilities عند تفعيل FCM، وURL scheme/Google provider عند تفعيل Google.

## إعدادات المالك الناقصة وخطواتها

1. Firebase Console → Project settings → Your apps: أكد Apps الثلاثة المذكورة وخصوصاً Web app ID وعدم حذف التسجيل أو pending deletion. لا تنشئ Apps مكررة. تأكيد Web الجديد لا يستنتج من نجاح compile.
2. Console → App Check → Web app: سجل/راجع reCAPTCHA v3 site key العام والدومينات المعتمدة. ضعه في FIREBASE_APPCHECK_SITE_KEY في ملف Web المحلي فقط؛ لا ترسل reCAPTCHA secret key. Console → Authentication → Settings → Authorized domains: تحقق من نطاق اختبار HTTPS الذي ستستخدمه؛ قدم اسمه، ولا نختلق نطاقاً أو ننشئ استضافة الآن.
3. Android App Check: راجع تسجيل Play Integrity وبصمة SHA-256 لشهادة الاختبار/التوقيع ومتطلبات توزيع التطبيق. debug token فقط لبناء debug بعد تفويض مستقل وليس release. iOS App Check يحتاج تسجيل DeviceCheck وبيئة Apple فعلية. لا نعطل enforcement في callable.
4. Authentication → Sign-in method: تحقق من Email/Password، وGoogle لاحقاً إذا أردت اختباره. إعدادات العميل لا تنشئ حساب الموظف أو عضوية members؛ يلزم مدير وعضوية قائمة أو bootstrap مخول لاحقاً، دون تشغيله هنا.
5. Firestore Database: أكد وجود قاعدة `(default)` وموقعها والقواعد والفهارس الحالية دون حذف أو إعادة ضبط أو تعويضها بقواعد مفتوحة. Functions: أكد وجود Backend الموافق للنطاق الحالي في europe-west1 وحالته؛ لم نقرأ بيانات قاعدة حقيقية أو نتحقق من نشره.
6. إذا Backend غير منشور، لا يمكن نشر Functions v2 الحالي أو تشغيل المسار الكامل مع حظر Deploy وBlaze. لا نحول التطبيق إلى كتابة مباشرة في Firestore لتجاوز ذلك. يصبح المتاح إعداد SDK وبناء التطبيق فقط حتى قرار منفصل؛ لا نفرض تفعيل خدمات مدفوعة.
7. FCM لاحقاً: VAPID public key وWorker للويب، APNs وقدرات iOS، إذن الجهاز. Google/Push false الآن. KMS/Click ليسا مطلوبين لإعداد SDK الحالي، ولا مفاتيح شركة أو اتصال بها.

## حدود الإثبات ونتائج التسليم

اختبارات الربط تستخدم SDK fixtures وMock ومحاكيات loopback؛ لا جهاز Android/iOS ولا Auth/App Check/FCM حقيقي ولا API Management ولا عمليات قاعدة بيانات على velnix-6c1a2. نتائج suites والبناء وSHA النهائي وCI موثقة في تقرير التسليم بعد حفظ commit. Web preflight الفاشل يبقى معلناً، وiOS غير مبني. لا جاهزية تشغيل كامل مستنتجة من build أو تطابق الملفات.

## التعديلات المحفوظة

خيارات Firebase العامة والتحقق قبل initialize في lib/core/firebase_configuration.dart وmain.dart؛ Google Services الشرطي في Gradle؛ plist resource copy وOAuth scheme في Xcode/xcconfig/Info.plist؛ flags وتجديد token الموافقان للـopt-in في notifications_service/device_revocation؛ أدوات prepare/preflight و7 اختبارات Python للتسجيلات و4 Flutter للخيارات و2 Flutter لتنظيف token؛ CI يحافظ على جميع الفحوص السابقة ويضيف اختبارات التجهيز. لا Firebase credentials في المصدر، ولا تعديل على Backend أو قواعد Firestore أو صلاحيات الأعمال أو دورة الطلب.

قيد المشروع الواحد لا يجيز استعادة/cloud import أو ضغط بيانات تجريبية إلى قاعدة مشتركة بلا تفويض خاص. تمرين استعادة فعلي معزول يحتاج قراراً منفصلاً؛ لا تعوضه بمسح بيانات المشروع الحالي.

## النتائج المحلية النهائية

318 Flutter و54 Node و48 Auth/Firestore Emulator و12 Python (5runtime+7SDK) و36 PDF رقمي ناجحة. التنسيق/analyze وسلامة Backend syntax وnpm audit إنتاج ناجحة. بعد تعديل توافق FCM أعيد كامل Flutter والتحليل والأبنية المتأثرة؛ Backend لم يتغير. Web Demo/Live وAndroid Debug بالإعداد الحقيقي بنيت بنجاح، وتحُقق من SDK resources وFCM auto-init=false وتوقيع Debug داخل APK. iOS فحص ملفات/خيارات/deployment target فقط، ولم يبن. Web preflight الكامل يرجع1 بسبب App Check site key المفقود؛ لا نحوله إلى نجاح CI.

[دليل النتائج](evidence/firebase-current-project-validation.json) يسجل الحالات والتجزئات والقيود دون API keys أو بيانات مستخدم. CI النهائي يقرأ بعد رفع commit؛ CI لا يحمل SDK files المحلية ولا يثبت تسجيلات Firebase نشطة أو login فعلياً. شهادة Debug العامة الحالية في config/firebase.android.debug-certificate.public.json المحلي المستثنى عند الحاجة لتسجيل SHA، ولا تمثل شهادة release.
