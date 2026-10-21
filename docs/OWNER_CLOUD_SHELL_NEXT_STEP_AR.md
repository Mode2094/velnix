> تحديث: وافق المالك على إنشاء عضوية الحساب المحدد فقط. المسار الحالي في [دليل الإنشاء](OWNER_BOOTSTRAP_GCLOUD_APPLY_AR.md)؛ إجراءات الجرد وZIP أدناه تاريخية وليست مطلوبة الآن. GitHub API أصبح قابلاً للقراءة في جلسة الإصلاح الأخيرة؛ الحجب المذكور أدناه وصف للحالة السابقة.

# الخطوة البشرية التالية — جرد رسمي من Google Cloud Shell

المسار الحالي المعتمد دون رفع ملفات: [افتح الفرع والدليل مباشرة](https://shell.cloud.google.com/cloudshell/editor?project=velnix-6c1a2&cloudshell_git_repo=https%3A%2F%2Fgithub.com%2FMode2094%2Fvelnix&cloudshell_git_branch=audit%2Fproduction-readiness&cloudshell_tutorial=docs%2FCLOUD_SHELL_OWNER_TUTORIAL.md) ثم اتبع [إجراء التشغيل الموحد](CLOUD_SHELL_OWNER_TUTORIAL.md). فتح الرابط لا يشغّل الأوامر تلقائياً ولا يمنح Codex التحكم. طرق الملف وZIP أدناه بدائل تاريخية، وليست مطلوبة لهذا الإجراء.

بوابة شبكة Codex تحجب Firebase وGitHub API؛ لا نكرر الطلبات نفسها ولا ننقل اعتماد المالك إليها. افتح https://shell.cloud.google.com/?project=velnix-6c1a2 بحساب Google يملك وصولاً مصرحاً للمشروع، وافق على مصادقة Cloud Shell الرسمية فقط، دون أي طلب فوترة أو منح صلاحيات جديدة.

ارفع ملف functions/scripts/read_cloud_inventory.js إلى مجلدك الخاص في Cloud Shell، ثم شغله باستخدام Node حديث:

```bash
node read_cloud_inventory.js YOUR_CANDIDATE_GOOGLE_EMAIL
```

لا يحتاج الملف npm أو Service Account JSON أو كلمة مرور. يستخدم جلسة gcloud البشرية الموجودة، ويرفض service-account/impersonation، ويحفظ access token في الذاكرة فقط، ولا يطبعه أو يضعه في ملف أو Git. كل طلب Google في الأداة GET؛ لا إنشاء مستخدمين أو بيانات أو موارد أو تعطيل مزودات أو نشر. صلاحيات القراءة غير المتاحة تسجل unverified ولا تفسر كخلو.

أرسل ناتج JSON المنقح فقط؛ لا ترسل ملف الاعتمادات أو مخرجات gcloud auth print-access-token. الناتج لا يتضمن كلمات مرور أو hash أو OAuth secrets أو قائمة بريد المستخدمين؛ قد يتضمن UID المرشح من سجل Auth فقط، وهو غير سري لكنه ليس إثبات جلسة Google. لا تنشر التقرير في مستودع عام.

بعد الجرد نحدد إن كان Google يحتاج تهيئة، ثم ينفذ المالك تسجيل Firebase Google حقيقياً للحساب المختار ونطابق UID موثقاً قبل bootstrap_admin.js الجاف. لا تشغل --apply الآن. وجود مدير قديم أو عضويات/قفل يستوجب المراجعة؛ Authentication خالٍ وحده لا يسمح بإنشاء إدارة. CI وGoogle/App Check والنشر والاختبار الحقيقي تبقى بوابات منفصلة؛ لا نجاح سحابي مستنتج من اختبارات الأداة المحلية.

## المسار الأسهل الأحدث: جرد ثم توثيق Google ثم bootstrap جاف

الحزمة المحلية build/owner-setup/velnix-owner-setup.zip تجمع المصدر المطلوب فقط مع checksums وlockfile؛ تولّد بـpython3 scripts/package_owner_setup.py. ارفعها إلى Cloud Shell ثم نفّذ أمراً واحداً:

```bash
unzip -q velnix-owner-setup.zip && bash velnix-owner-setup/start.sh YOUR_CANDIDATE_GOOGLE_EMAIL
```

تتحقق قبل فتح تسجيل Google من المشروع والحسابات والعضويات والقفل ومزود Google وتسجيل Web النشط. يستخدم المشغل جلسة gcloud البشرية المصادق عليها مسبقاً، دون ADC login أو تعديل ملف quota. يضاف X-Goog-User-Project لكل قراءة REST وطلب Auth SDK. تظل جلسة Firebase للمرشح مستقلة وتحتاج دخوله الحقيقي؛ لا كلمات مرور أو tokens في المحادثة ولا تفعيل Billing/API/IAM.

بعد جاهزية الطرفية افتح Web Preview على8080 في تبويب مستقل. إذا احتاج النطاق إضافة أو Google provider تهيئة، يعرض المسار إجراء Console المحدد؛ لا يعدّل هذه الإعدادات تلقائياً ولا يخفّض App Check. بعد استيفائها يسجل المرشح Google مرة واحدة للتحقق وdry-run. لا توجد خطوة apply أو نشر أو تغيير مدفوع. نتائج التحقق تعرض UID فقط دون ID token، ويمكن إرسال JSON المنقح. لا يمكن توفير رابط HTTPS النهائي قبل تشغيل المعاينة ومعرفة نطاقها الحقيقي؛ Cloud Shell Web Preview هو الذي يولده.
