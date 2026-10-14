# خطة قبول Staging لشركة توصيل حقيقية

هذه خطة تجهيز واختبار، وليست إذن نشر. لا مشروع إنتاج ولا مفاتيح إنتاج ولا بيانات عملاء حقيقية. أي نشر Staging أو تفعيل خدمات مدفوعة يحتاج تفويضاً وميزانية قبل التنفيذ.

## ما يقدمه المالك عبر وسائل آمنة

| المطلوب | التفاصيل | طريقة توفيره |
|---|---|---|
| مشروع Firebase تجريبي مستقل | project ID، تطبيقات Web/Android/iOS، مالك المشروع، حساب فوترة وميزانية معتمدة | معرفات عامة في ملف إعداد محلي مستثنى؛ IAM عبر إدارة المشروع |
| نطاق HTTPS تجريبي | نطاق التطبيق و Authorized Domains ورابط webhook يستطيع المزود الوصول إليه | إعداد DNS/Hosting منفصل عن الإنتاج |
| حساب شركة واحدة في sandbox | اسم الشركة، نسخة الوثائق، hostname/base path، نوع المصادقة، حساب/merchant تجريبي | روابط ومعرفات عامة؛ token و webhook secret عبر مدير أسرار أو إعداد الإدارة المخول |
| عقد REST/Webhook | حقول ووحدات العملة والوقت، endpoints، tracking، حالات وانتقالات، idempotency، timeout، rate limit/Retry-After، توقيع وإعادة محاولة webhook | وثائق رسمية وأمثلة منزوعة الأسرار |
| مصادقة المنصات | OAuth Client IDs، SHA-1/SHA-256 لتوقيع Android التجريبي، إعداد iOS و URL schemes | إعدادات Firebase/Google الرسمية؛ ملفات التهيئة محلية مستثناة من Git |
| App Check | reCAPTCHA v3 للويب كما يستعمل الكود الحالي، Play Integrity أو debug مسجل للـ debug التجريبي، Apple DeviceCheck | تسجيل المنصات؛ debug tokens آمنة ومشروع تجريبي فقط، ممنوعة في release |
| KMS وهوية التشغيل | مفتاح تجريبي symmetric encryption، service account مستقل و IAM محدود | هوية الخدمة/ADC آمنة، دون private-key JSON في التطبيق أو Git أو التقرير |
| أجهزة QA وطابعة/ماسح | Android/iOS، متصفحات، طراز 58/80 مم والدقة، ماسح أو كاميرا | أجهزة فعلية ومستخدمون اختباريون |
| خطة التشغيل | أهداف p95/التكلفة و RPO/RTO والاحتفاظ والتنبيهات، صاحب قرار الإرسال الملتبس | موافقة تشغيل مكتوبة |

لا ترسل قيم tokens أو كلمات المرور أو private keys أو ملفات توقيع في المحادثة. إعداد Firebase للعميل عام بطبيعته، لكن يبقى في config/firebase.public.json المحلي؛ المثال فارغ ولا يتحول إلى اعتماد إدارة.

## تهيئة المشروع قبل أول اتصال

1. تحقق أن project ID لا يطابق الإنتاج وأن الحسابات والـ buckets والمفتاح و OAuth منفصلة. اضبط المنطقة الحالية `europe-west1` للـ Functions لأن Gateway محدد عليها؛ لا تغير المنطقة سراً. سجل معرف التطبيقات الحالي `com.mode2094.velnix` أو اعتمد تغييره قبل OAuth.
2. فعّل Email/Password، واضبط Google عند توفر Client IDs/SHA/Authorized Domains. bootstrap لأول مدير عام باستخدام هوية مشغل محدودة و`VELNIX_BOOTSTRAP_CONFIRM_PROJECT` المطابق. أنشئ حساباً مستقلاً لكل دور، دون منح موظف لمجرد نجاح Google.
3. انشر القواعد والفهارس الـ 109 و Functions إلى Staging فقط بعد تفويض محدد، وانتظر READY للفهارس. لا تعتمد على Emulator لأنه لا يفرض جميع الفهارس. لا deploy أو bootstrap نفذ في جلسة التسليم هذه.
4. اضبط `VELNIX_KMS_KEY` إلى مرجع المفتاح التجريبي، و`ALLOWED_DELIVERY_HOSTS` إلى hostname sandbox المحدد فقط. امنح هوية Functions encrypt/decrypt على هذا المفتاح وأذونات Firestore/Auth المطلوبة، دون Owner/Editor واسع. تحقق من APIs والفوترة وسياسة سجل التدقيق قبل التشغيل.
5. مرر إعداد العميل العام عبر `--dart-define-from-file=config/firebase.public.json` مع `VELNIX_MODE=live`. Google و Push يبقيان disabled حتى اكتمال تهيئتهما. وللويب Push، اضبط VAPID و Service Worker عبر scripts/configure_web_push.py ثم أعد البناء. لا يُعد build Live الناجح تسجيل دخول ناجحاً.
6. إذا كانت الاختبارات من هذه البيئة السحابية، أضف وجهات الشبكة الدقيقة المطلوبة: endpoint الوظيفة التجريبية، firestore.googleapis.com، identitytoolkit.googleapis.com، securetoken.googleapis.com، firebaseappcheck.googleapis.com، cloudkms.googleapis.com، و hostname الشركة. راجع oauth2.googleapis.com/fcm.googleapis.com عند استعمالها فعلياً، وحافظ على TLS والتوثيق. مسار SDK/gRPC يجب اختباره، لا استنتاجه من مجرد حفظ allowlist.
7. تحقق من Secrets شركة sandbox عبر شاشة إدارة مخولة: تحفظ مشفرة KMS ولا تعاد إلى Flutter. لا تدخل token في URL أو query أو ملف إعداد عام. HTTPS443 فقط ومن دون redirects غير معتمدة.

## شرط توافق الشركة

`generic_v1` موصل مرجعي وليس تكاملاً جاهزاً لكل شركة. يقارن المهندس وثائق الشركة مع routes `/health` و`/orders` واستعلام التتبع، Bearer auth، الحقول و statusMap وتوقيع webhook الحالي. إذا اختلف العقد، يُسجل عدم التوافق ويحتاج adapter محدداً في مهمة ربط لاحقة مفوضة؛ لا يغير حقول شركة مجهولة ولا يختلق اختبار نجاح. المرحلة الأولى شركة واحدة.

## مصفوفة الاختبار الفعلي المطلوبة

| المجموعة | خطوات القبول | الدليل المطلوب |
|---|---|---|
| Auth/Google/App Check | دخول وخروج واستعادة ورفض حساب بلا ملف نشط، تعطيل أثناء الجلسة، سحب صلاحية، Google على كل منصة مستهدفة، رفض callable بلا App Check | معرف fixture ودور ومنصة ونتيجة؛ لا token أو cookie |
| الصلاحيات | جميع الأدوار تنشئ، رفض بيانات فرق أخرى، نقل مدخل بيانات، مبالغ محجوبة في البحث/التقارير/PDF، direct callable، آخر مدير عام وتعارض تحديث | assertions/screenshot منزوعة البيانات الحقيقية |
| الطلب الداخلي | created→review→preparing→ready→delivered، source=internal، terminal بلا إعادة فتح، رفض الإكمال عند أي أثر شركة/إرسال | الطلب التجريبي والأحداث وسجل audit |
| الشحنة الناجحة | اختبار اتصال، تعيين الشركة، إنشاء شحنة واحدة، tracking يطابق sandbox، webhook/poll حتى delivered أو returned | reference/idempotency/tracking تجريبية وتطابق سجل المزود |
| الإرسال الملتبس | timeout أو انقطاع بعد الإنشاء وقبل الرد، لا إعادة إنشاء تلقائية، needs_review، مراجعة المدير بحسب سجل المزود | إثبات شحنة واحدة وإجراء مراجعة وسبب بلا أسرار |
| webhook والأخطاء | توقيع صحيح/خاطئ/قديم، تكرار الحدث، حدث مبكر وإعادة 503، تحديث متأخر، رد مشوه/حجم زائد/429/5xx | حالات HTTP وأحداث inbox؛ لا raw body يحوي بيانات عميل |
| شركة معطلة/مؤرشفة | منع إنشاء جديد، متابعة شحنة قديمة، restore معطل واختبار اتصال جديد | status/events ونتيجة واضحة |
| FCM | opt-in/رفض إذن، foreground/background/open، scope بعد نقل الفريق، invalid token، transient retry/lease/partial failure | الأجهزة والـ noticeId والـ states، دون token الجهاز |
| UI/PDF/الأجهزة | رحلة كل دور،10 عروض و 200%، وصف طويل، المبلغ المحجوب،58/80 والمقاسات الأخرى ومسح المعرّف | صور و PDF تجريبية وتجربة طابعة وماسح فعلية |
| الأداء/التكلفة/الاستعادة | بيانات اصطناعية 10000+ وفرق كبيرة، pagination، p50/p95 و reads والكلفة، backlog retry، backup/restore إلى مشروع منفصل | أرقام فعلية مقابل أهداف معتمدة؛ لا أسعار أو SLA مختلقة |

## حدود وإجراءات التشغيل

push: أربع محاولات، lease دقيقتين، استعادة عبر جدول 15 دقيقة الحالي، وحد 25 حالة مستحقة وميزانية 45 ثانية. لا Scheduler أو Cloud Tasks إضافي. يبقى تكرار نادر ممكناً بين FCM والحفظ؛ اقرأ per-device acknowledgements و noticeId ولا تعد sent عشوائياً. الحالات الجزئية التاريخية تحتاج مراجعة قبل migration.

polling: حد 100 شحنة في الدورة، لا 100 شركة. سجل آخر sync/attempt والسبب الآمن. لا تحاول شحنة ثانية لإصلاح timeout دون مراجعة idempotency لدى المزود.

الباركود:36 حالة رقمية ناجحة، منها 4 احتاجت preprocessing. لا تثبت توافق الطابعة والماسح؛ يرفض الورق غير الكافي وتُعتمد النتيجة الفيزيائية لكل طراز ودقة قبل البيع.

## قرار الاجتياز

يوقع مالك المنتج والمهندس وممثل العميل على كل مجموعة بأدلة محددة. أي فشل صلاحية أو تضاعف شحنة أو مبلغ محجوب متسرب أو عدم توافق adapter يمنع اعتماد الربط. نجاح CI يتيح متابعة Staging؛ لا يمنح اعتماد إنتاج أو إذن Merge/Deploy. لا تُسلّم مفاتيح إنتاج لتعويض غياب sandbox.
