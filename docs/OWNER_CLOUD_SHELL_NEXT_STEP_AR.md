# الخطوة البشرية التالية — جرد رسمي من Google Cloud Shell

بوابة شبكة Codex تحجب Firebase وGitHub API؛ لا نكرر الطلبات نفسها ولا ننقل اعتماد المالك إليها. افتح https://shell.cloud.google.com/?project=velnix-6c1a2 بحساب Google يملك وصولاً مصرحاً للمشروع، وافق على مصادقة Cloud Shell الرسمية فقط، دون أي طلب فوترة أو منح صلاحيات جديدة.

ارفع ملف functions/scripts/read_cloud_inventory.js إلى مجلدك الخاص في Cloud Shell، ثم شغله باستخدام Node حديث:

```bash
node read_cloud_inventory.js YOUR_CANDIDATE_GOOGLE_EMAIL
```

لا يحتاج الملف npm أو Service Account JSON أو كلمة مرور. يستخدم جلسة gcloud البشرية الموجودة، ويرفض service-account/impersonation، ويحفظ access token في الذاكرة فقط، ولا يطبعه أو يضعه في ملف أو Git. كل طلب Google في الأداة GET؛ لا إنشاء مستخدمين أو بيانات أو موارد أو تعطيل مزودات أو نشر. صلاحيات القراءة غير المتاحة تسجل unverified ولا تفسر كخلو.

أرسل ناتج JSON المنقح فقط؛ لا ترسل ملف الاعتمادات أو مخرجات gcloud auth print-access-token. الناتج لا يتضمن كلمات مرور أو hash أو OAuth secrets أو قائمة بريد المستخدمين؛ قد يتضمن UID المرشح من سجل Auth فقط، وهو غير سري لكنه ليس إثبات جلسة Google. لا تنشر التقرير في مستودع عام.

بعد الجرد نحدد إن كان Google يحتاج تهيئة، ثم ينفذ المالك تسجيل Firebase Google حقيقياً للحساب المختار ونطابق UID موثقاً قبل bootstrap_admin.js الجاف. لا تشغل --apply الآن. وجود مدير قديم أو عضويات/قفل يستوجب المراجعة؛ Authentication خالٍ وحده لا يسمح بإنشاء إدارة. CI وGoogle/App Check والنشر والاختبار الحقيقي تبقى بوابات منفصلة؛ لا نجاح سحابي مستنتج من اختبارات الأداة المحلية.
