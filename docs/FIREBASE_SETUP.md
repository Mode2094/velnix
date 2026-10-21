# إعداد Firebase

المرجع الحالي للدخول: [Google فقط وموافقة الانضمام وخطة الترحيل](GOOGLE_ONLY_ACCESS_MIGRATION_AR.md). هذه خطوات لاحقة مخولة وليست أوامر منفذة على Firebase.

> تحديث طلب المالك الحالي: التجربة والتسليم النهائي على مشروع واحد velnix-6c1a2. [وثيقة ربط المشروع الحالي](FIREBASE_CURRENT_PROJECT_SETUP_AR.md) تحدد التسجيلات والإعدادات المحلية والقيود. افتراض مشروع Staging مستقل في الخطط السابقة أُلغي بهذا الطلب؛ قيمة staging الآن لا تثبت عزل البيانات، ولا تسمح بتشغيل اختبارات المسح أو الاستعادة على المشروع الحقيقي. لا إنشاء موارد أو فوترة أو Deploy في هذا الطلب.
1. يعتمد الطلب الحالي مشروع velnix-6c1a2 الواحد للتجربة والتسليم؛ منطقة Functions europe-west1. لا تستخدم بيانات عميل أو اختبارات reset/import فيه. راجع firebase.json و109 فهارس المركبة قبل أي نشر مخول.
2. راجع تسجيلات Web وAndroid وiOS الموجودة ومعرف com.mode2094.velnix دون إنشاء تطبيقات مكررة؛ ضع إعداد العميل العام في config/firebase.public.json المستثنى، وملفات المنصات المحلية. راجع مثال config/firebase.public.example.json وأسماء dart-defines في lib/main.dart.
3. راجع Google provider وOAuth domains وSHA-1/SHA-256 وGoogle client IDs ثم VELNIX_GOOGLE_ENABLED=true بعد التهيئة المخولة. لا تغيّر Email/Password الآن؛ تعطيله يحتاج اختبار Google واعتماد المدير العام وموافقة منفصلة. اختبر Google UID المطابق للإدارة قبل أي نشر، ثم pending/approval/rejection للأعضاء.
4. سجل App Check الصحيح Android/Apple/Web. لا تسمح debug tokens على release. اختبر رفض الطلبات غير الموثوقة في staging.
5. أنشئ مفتاح KMS وخدمة Functions بأقل IAM اللازم، وحدد VELNIX_KMS_KEY وALLOWED_DELIVERY_HOSTS كما في functions/.env.example. مرر الاعتمادات عبر مدير أسرار/هوية الخدمة؛ لا ترسل قيم المفاتيح في المحادثة.
6. بعد موافقة نشر محددة: راجع القواعد والفهارس وFunctions على staging، ثم اختبار كامل من التطبيق عبر Auth وApp Check وFunctions وقاعدة البيانات. لا ينفذ هذا التقرير النشر.
7. Bootstrap أول مدير عند غياب الإدارة فقط عبر functions/scripts/bootstrap_admin.js مع VELNIX_BOOTSTRAP_CONFIRM_PROJECT المطابق وVELNIX_ADMIN_GOOGLE_UID الموثق؛ هوية المشغل مُدارة ومخولة دون طلب private-key JSON. الفحص dry-run افتراضي و--apply كتابة تحتاج إذناً منفصلاً؛ يرفض استبدال عضو أو إدارة قائمة. backfill_search_keys dry-run أولاً، ونسخة احتياطية ومراجعة --apply.
8. FCM اختياري: إعداد VAPID والـService Worker عبر scripts/configure_web_push.py والإذن الصريح، ثم VELNIX_PUSH_ENABLED. ملف worker الناتج محلي مستثنى. اختبر foreground/background ورفض الإذن والخروج.

الاختبارات المحلية: source scripts/cloud-env.sh ثم scripts/validate.sh. المحاكيات demo-velnix فقط؛ suite يمسح بيانات المحاكي المحلي عمداً. المحاكي لا يثبت صلاحية الفهارس المركبة ولا أداء الخدمة المنشورة.

قبل staging انشر فهارس notices pushState/pushNextAttemptAt وlegacy failures وفهرس members للفريق والاسم. retry للدفع يعيد استخدام reconcileDeliveryStatuses الحالي ولا يضيف جدولاً مدفوعاً، وقد يتأخر حتى دورة 15 دقيقة. نفذ اختبار FCM/lease على staging بعد تهيئة الخدمة، مع توقع احتمال تكرار نادر عبر الحد بين FCM والحفظ. إعداد Python QA: pip install -r scripts/qa-requirements.txt وPoppler، وVELNIX_QA_PYTHON يشير إلى interpreter الذي ثبتت فيه المكتبات.
