# إعداد Firebase
1. يحدد المالك مشروع staging منفصلاً ومشروع الإنتاج والمنطقة؛ لا تستخدم بيانات عميل في الاختبارات. راجع firebase.json و106 فهارس المركبة قبل أي نشر مخول.
2. سجل Web وAndroid وiOS بعد اعتماد com.mode2094.velnix؛ ضع إعداد العميل العام في config/firebase.public.json المستثنى، وملفات المنصات المحلية. راجع مثال config/firebase.public.example.json وأسماء dart-defines في lib/main.dart.
3. فعّل Email/Password، وعند اعتماد Google اضبط OAuth domains وSHA-1/SHA-256 وGoogle client IDs ثم VELNIX_GOOGLE_ENABLED. اختبر دخول وخروج واستعادة كلمة المرور لكل منصة.
4. سجل App Check الصحيح Android/Apple/Web. لا تسمح debug tokens على release. اختبر رفض الطلبات غير الموثوقة في staging.
5. أنشئ مفتاح KMS وخدمة Functions بأقل IAM اللازم، وحدد VELNIX_KMS_KEY وALLOWED_DELIVERY_HOSTS كما في functions/.env.example. مرر الاعتمادات عبر مدير أسرار/هوية الخدمة؛ لا ترسل قيم المفاتيح في المحادثة.
6. بعد موافقة نشر محددة: راجع القواعد والفهارس وFunctions على staging، ثم اختبار كامل من التطبيق عبر Auth وApp Check وFunctions وقاعدة البيانات. لا ينفذ هذا التقرير النشر.
7. Bootstrap أول مدير عبر functions/scripts/bootstrap_admin.js مع VELNIX_BOOTSTRAP_CONFIRM_PROJECT المطابق؛ حساب خدمة المشغل آمن. backfill_search_keys dry-run أولاً، ونسخة احتياطية ومراجعة --apply.
8. FCM اختياري: إعداد VAPID والـService Worker عبر scripts/configure_web_push.py والإذن الصريح، ثم VELNIX_PUSH_ENABLED. ملف worker الناتج محلي مستثنى. اختبر foreground/background ورفض الإذن والخروج.

الاختبارات المحلية: source scripts/cloud-env.sh ثم scripts/validate.sh. المحاكيات demo-velnix فقط؛ suite يمسح بيانات المحاكي المحلي عمداً. المحاكي لا يثبت صلاحية الفهارس المركبة ولا أداء الخدمة المنشورة.
