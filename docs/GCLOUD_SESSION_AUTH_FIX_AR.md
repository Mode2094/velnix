# إصلاح مصادقة المرحلة الأولى — جلسة gcloud دون ADC

السبب المثبت: gcloud auth print-access-token يستخدم جلسة CLI، بينما applicationDefault() يبحث عن ADC منفصل. المشغل السابق طلب ADC حتى مع وجود جلسة بشرية تعمل. كذلك Firebase Admin Firestore يرفض credential مخصصاً عاماً، رغم أن Admin Auth يقبله؛ لم نزوّر نوع الاعتماد أو نعدّل SDK.

المسار الموحد الآن يستخدم gcloud_session.js: يثبت الحساب البشري النشط، ويرفض service-account/impersonation/overrides، ويطلب access token من gcloud لحساب المشغل نفسه عند الحاجة، دون طباعته أو نسخه إلى env أو ملف أو Git. gcloud يظل مسؤولاً عن تجديد ومخبأ جلسته الرسمي. لا ADC login أو set-quota-project. القراءة REST ترسل X-Goog-User-Project: velnix-6c1a2، وAdmin Auth يستخدم Credential الرسمي المخصص مع GOOGLE_CLOUD_QUOTA_PROJECT محصوراً بعملية الأداة لإرسال header نفسه. لا نفترض صلاحية token لساعة؛ يُطلب من gcloud مجدداً عند طلب SDK التالي.

التحقق من Firebase ID token وتوقيعه ومشروعه ووقت الدخول وgoogle.com والبريد والـUID والإلغاء يبقى عبر Admin Auth SDK كما كان. جلسة المشغل ليست جلسة Firebase للمرشح ولا تستبدلها.

bootstrap_admin.js الجاف الافتراضي، أو --gcloud-session صراحةً، يستخدم Admin Auth نفسه ومحول Firestore REST **للقراءة فقط**، ثم bootstrapGoogleAdmin نفسه بحالة apply=false. يتحقق من المستخدم والقفل وعضويته وطلبه ووجود أي مدير سابق، ولا توجد set/update/delete/transaction في المحول. --gcloud-session مع --apply أو --managed-adc يُرفض قبل الاتصال. نمط ADC المُدار القديم يبقى اختياراً منفصلاً صريحاً عبر --managed-adc للفحص أو --apply للتغيير المخول لاحقاً؛ ليس fallback عند فشل gcloud، ولا يستعمله مسار Cloud Shell الحالي.

الأمر الموحد، من المستودع الحالي على audit/production-readiness، هو تحديث fast-forward ثم تشغيل scripts/owner-setup/start.sh مع بريد المرشح المعتمد. لا رفع ZIP أو كلمة مرور أو token ولا مصادقة ADC إضافية. لا يتغير Email/Password أو IAM أو Billing أو Backend، ولا يُنشأ مدير. إن كانت جلسة gcloud أو الصلاحيات غير صالحة يتوقف المسار بدلاً من بدء login أو اختيار حساب بديل.

الاختبار المحلي شغّل CLI الحقيقي وFirebase Admin Auth SDK الحقيقي مع GOOGLE_APPLICATION_CREDENTIALS يشير إلى ملف غير موجود. استُخدم gcloud بديل محلي ومخدمات HTTP محلية تحاكي Google؛ اختبر Authorization وquota header، ونجاح dry-run، ورفض القفل والمدير السابق وapply وتعارض النمط. لم نستخدم Auth emulator لتجاوز OAuth headers في هذا الاختبار، ولم نتصل بمشروع حقيقي. اختبارات إضافية تغطي تجديد الطلب من gcloud، منع إخراج أسرار أخطاء CLI، الوجهات وredirect والهوية البشرية. لا يُدَّعى نجاح التنفيذ الحقيقي في Cloud Shell قبل تشغيل المالك للإصلاح.

[دليل الاختبارات النهائي](evidence/gcloud-session-auth-validation.json) يفصل المحلي عن CI والخدمات الحقيقية. لا نشر أو إنشاء عضوية في هذه المعالجة.
