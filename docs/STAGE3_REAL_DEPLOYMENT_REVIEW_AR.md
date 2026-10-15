# المرحلة الثالثة — مراجعة النشر الحقيقي دون تنفيذه

## القرار والأدلة

**Go للتحضير والاختبارات؛ No-Go لتنفيذ النشر الآن.** لم يصدر تفويض نشر أو تغيير
سحابي لهذه المرحلة. Blaze **مفعلة بإفادة المالك**؛ لم نقرأ billingInfo مجددًا من
Codex. تعذر قراءة الفوترة مستقبلًا يبقيها غير مؤكدة ولا يثبت أنها معطلة.

المصدر الأساسي `4a9540726e86b450ac49ce821a9341635f6ba26a`، والفرع
`audit/production-readiness`. المشروع الوحيد `velnix-6c1a2`؛ اسم staging في
إعداد البناء لا يعزل قاعدة البيانات المشتركة. لا bootstrap، ولا إنشاء مدير، ولا
تعديل Auth أو IAM أو App Check أو قواعد أو فهارس أو APIs أو فوترة أو Deploy/Merge.

في البيئة الحالية لا يوجد gcloud ولا ربط اعتماد Google ظاهر؛ لم نحاول استنتاج
حالة خدمات المشروع بطلبات غير مخولة. Google Sign-In السابق وإنشاء المدير
`moderohe8@gmail.com` وreadbackVerified حقائق أبلغ بها المالك سابقًا، وليست قراءة
حديثة من هذه الجلسة. القواعد المنشورة deny-all بحسب إفادة المالك؛ لا توجد هنا
نسخة منشورة حديثة كاملة أو تجزئتها يمكن اعتمادها كنسخة تراجع.

## ما أُصلح فعليًا

1. `functions/scripts/operational_readiness.js` كان يحصي صادرات `exports.foo`
   فقط، ويسقط `joinSession/listJoinRequests/decideJoinRequest` المصدرة عبر factory.
   أُضيف الحصر المتحقق من شكل الربط، وتجـزئة مصدر handlers، والفشل الآمن عند
   صادرات ديناميكية غير معروفة. الحصر الصحيح **35** وليس32، ومنها **31 callable**.
   لم تتغير handlers أو الصلاحيات؛ الخطأ في تقرير الجاهزية فقط.
2. أضيف `pubsub.googleapis.com` و`storage.googleapis.com` اللذان يتطلبهما مسار
   Functions v2 في CLI المثبت، و`firebaserules.googleapis.com` لنشر القواعد إلى
   جرد APIs. غيابها ينتج blockers بدل جاهزية كاذبة.
3. اختبارات الانحدار تقارن manifest بالصادرات الفعلية في عملية اصطناعية دون
   تنفيذ أي handler، وتثبت كشف غياب joinSession، ورفض مصدر ديناميكي غير معروف،
   وكشف APIs الناقصة. جميع أعمال الجرد تظل قراءات؛ لا أضيف executor للنشر.

## Functions v2 / Node22 / المنطقة

- `functions/package.json`: Node22، Admin14.5.0 وFunctions7.4.0؛ lockfile يثبت
  Firebase CLI15.33.0. `firebase.json` يحدد codebase `default` ومصدر `functions`.
  تستخدم الدوال `europe-west1`، وcallables تفرض App Check، وحدها15 instance
  وtimeout60 ثانية **لكل دالة**. webhook حدها10 و30 ثانية. لا حد instances صريح
  للمحفزين أو المجدول في المصدر؛ يلزم اعتماد السعة والكلفة قبل نشرهما، ولا ندعي
  أن maxInstances سقف فاتورة أو حد تزامن إجمالي.
- قبل التنفيذ: تثبيت commit ناجح Push/PR، npm ci على Node22، قفل النسخ، هوية
  تشغيل معتمدة وهوية build معتمدة ومنح actAs المناسبة. لا مفاتيح JSON خاصة،
  ولا استخدام حساب المدير البشري كـruntime identity، ولا منح Owner/Editor.
- runtime يحتاج Firestore read/write (`roles/datastore.user` مرشح) وعمليات Auth
  التي يستخدمها الانضمام والتعطيل وسحب الجلسات (`firebaseauth.admin` واسع؛ الأفضل
  role أضيق مُراجع إذا غطى get/update/revoke القائمة، دون hash export). FCM send
  لاحقًا يتطلب صلاحياته، لا KMS للطلبات الداخلية.
- deployer يحتاج صلاحيات نشر Functions/Cloud Run والبناء والمستودعات وactAs
  للحسابات المحددة؛ نشر القواعد والفهارس له صلاحياته المنفصلة. لا يكفي Firebase
  Auth generalManager لمنح صلاحيات Google Cloud. راجع IAM الموروث والشروط
  والسياسات التنظيمية؛ لا تستبدل project policy من ملف مثال.
- Eventarc يحتاج service identities والمنح المناسبة للاستقبال وRun invocation،
  وPub/Sub service agent قد يحتاج tokenCreator وفق عمر المشروع والتهيئة. CLI
  قد يولد هويات خدمات ويعدل IAM أثناء deploy؛ هذا **تغيير سحابي** يجب تضمينه في
  التفويض اللاحق، وليس خطوة تشخيص آمنة أو تفويضًا حاليًا.
- ثبّت موقع `(default)` الفعلي أولًا. موقع تنفيذ الدالة europe-west1 منفصل عن
  event trigger location. CLI يضبط موقع trigger ليتطابق مع موقع قاعدة Firestore؛
  لا تضبطه عشوائيًا على europe-west1 ولا تنقل قاعدة البيانات. eur3 مثلًا يقابله
  تنفيذ قريب europe-west1 وفق الوثائق، مع trigger في eur3. قيّم تكلفة نقل
  البيانات عند اختلاف المناطق. Auth/App Check/FCM ليست قواعد بيانات إقليمية بديلة.

## APIs — المطلوب تحديدًا، دون تفعيل

الحالة المفعلة/المعطلة **غير مقروءة حديثًا**. لا يعني إدراج API وجوب تفعيله من جديد.

| API | الحاجة والأولوية |
| --- | --- |
| cloudfunctions.googleapis.com | نشر وإدارة Functions v2؛ أول دفعة |
| cloudbuild.googleapis.com | بناء الحاويات؛ أول دفعة |
| artifactregistry.googleapis.com | صور البناء وتخزينها؛ أول دفعة |
| run.googleapis.com | تشغيل v2؛ أول دفعة |
| eventarc.googleapis.com | أحداث Firestore، وCLI يطلبه لمسار v2 حتى عند اختيار callables |
| pubsub.googleapis.com | نقل أحداث/هوية خدمة؛ CLI يطلبه لمسار v2 |
| storage.googleapis.com | رفع/تخزين مصادر البناء؛ CLI يطلبه لمسار v2؛ لا نضيف ميزة ملفات للتطبيق |
| firestore.googleapis.com | قاعدة البيانات والفهارس وBackend |
| firebaserules.googleapis.com | قراءة ونشر قواعد Firestore |
| identitytoolkit.googleapis.com | Google/Firebase Auth وإدارة الحسابات الحالية |
| firebaseappcheck.googleapis.com | تبادل إثباتات App Check الحقيقية |
| fcm.googleapis.com | إرسال Push لاحقًا؛ ليس شرطًا لقبول الطلبات مع Push معطل |
| firebaseinstallations.googleapis.com | تثبيت عميل FCM/token لاحقًا، تحقق من حالته عند تجهيز الأجهزة |
| cloudscheduler.googleapis.com | فقط عند تفويض reconcileDeliveryStatuses لاحقًا |
| cloudkms.googleapis.com | مؤجل؛ لا مفاتيح شركات توصيل في قبول الطلبات الداخلية |
| secretmanager.googleapis.com | ليس متطلبًا حاليًا: لا secret bindings في تعريف الدوال؛ لا نفعله احتياطيًا |
| firebase.googleapis.com / serviceusage.googleapis.com / cloudresourcemanager.googleapis.com | قراءة تسجيلات المشروع والخدمات وسياسات المشروع وأعمال أداة النشر؛ تحقق من الوصول/الحالة دون تفعيل عشوائي |
| iam.googleapis.com / iamcredentials.googleapis.com | راجع الحاجة مع هوية النشر/build وEventarc/OIDC/حساب التشغيل المعتمد؛ لا إنشاء حسابات أو توليد credentials خلال التحضير |

التوثيق الداخلي لدليل APIs: CLI15.33.0 في
`lib/deploy/functions/prepare.js` يستدعي Cloud Run/Eventarc/PubSub/Storage لكل v2؛
Secret Manager مشروط بـsecret bindings. لا Runtime Config قديم أو Cloud Tasks
أو OAuth/Drive APIs إضافية مطلوبة من منطق Velnix الحالي.

## القواعد المنشورة مقابل المحلية

وفق إفادة المالك: المنشور يحظر كل read/write. المصدر المحلي يضيف استثناءين فقط:

| المسار | القراءة المقترحة من client SDK | الكتابة/list |
| --- | --- | --- |
| members/{uid} | get للمستخدم المصادق نفسه فقط | ممنوعة بالكامل |
| joinRequests/{uid} | get لقرار انضمام المستخدم نفسه فقط | ممنوعة بالكامل |
| بقية المسارات، ومنها orders/devices/companies/auditEvents/settings | ممنوعة | ممنوعة |

لا دور يمنح استثناء لقراءة الطلبات مباشرة، حتى المدير العام. عمليات الأعمال
عبر Backend المحمي؛ Admin SDK يتجاوز هذه القواعد ولذلك يلزم IAM وحماية handlers.
المعلّق يستطيع مراقبة قراره، والمُعطّل قد يقرأ ملفه غير السري إذا بقي Auth token
مقبولًا؛ هذا لا يمنحه طلبات أو إدارة. لا تتضمن عضوية العميل مفاتيح الشركات.
القواعد deny-all الحالية تمنع streams التي تحتاجها بوابة العضوية في الواجهة.

SHA256 المحلي: `e1c900b72da82dbe03fd5fd87e277e1e7bcb21e8d79d0764b53b70b1bb959075`.
قبل أي نشر يجب قراءة وحفظ محتوى القواعد المنشورة وruleset/release/hash كاملًا
واستخراج diff الفعلي؛ لا نختلق تجزئة منشورة ولا نساوي الوصف بنسخة backup.
نشر القواعد لا ينشئ أعضاء أو طلبات ولا يعدل المستندات، لكنه يغير صلاحية الوصول.

## الفهارس وخطأ400 وFunctions403

المصدر يطلب **109 composite indexes: orders105، notices3، members1**، وfieldOverrides
فارغ. تغطي البحث وتوليفات الفلاتر/المُنشئ والفرز والإحصاء ومزامنة الحالات وPush
والفريق. ليست كلها لازمة لاستدعاء me، لكن الاستعلامات المعتمدة يجب أن تبلغ READY
قبل قبول البحث/لوحة التحكم. المحاكي ليس دليل وجود composite indexes سحابية.

المسار الحالي `v1/projects/velnix-6c1a2/databases/(default)/collectionGroups/-/indexes`
هو مسار Firebase CLI المثبت نفسه. REST discovery الرسمي يعرّف parent وpageSize
وpageToken؛ لا دليل أن pageSize100 أو `(default)` خطأ. **لم نغير المسار تخمينًا**.
من400 وحده لا نعرف هل الخطأ argument أو fields أو سياسة consumer. التقرير المنقح
يعرض API status وErrorInfo/BadRequest المسموحين فقط. عند توفر جلسة Cloud Shell
المخولة، يعاد الجرد GET-only مرة للحصول على السبب، ويمكن مقارنة طلب CLI بدون
pageSize وطلب collectionGroup محدد من orders/notices/members إذا دلت الاستجابة
على parent أو pagination؛ لا تعتمد نتيجة جزئية على أنها جرد المشروع الكامل.

كذلك403 لقائمة Functions لا يثبت تعطيل الخدمة: SERVICE_DISABLED يثبت رفض API
لذلك consumer، IAM_PERMISSION_DENIED يثبت نقص permission، وACCESS_TOKEN_SCOPE_INSUFFICIENT
مشكلة scope؛ عدم وجود تفاصيل يبقي السبب غير محدد. لا نعالج أيًا منها تلقائيًا
بتفعيل خدمة أو تغيير IAM. الفوترة تبقى منفصلة عن هذه الأخطاء.

عند تفويض الفهارس لاحقًا: اجرد الموجود وموازنته أولًا، أضف الناقص فقط، انتظر
READY وافحص حالات ERROR. لا force ولا حذف index قديم/fieldOverride غير مراجع.
109 فهارس تحمل تكلفة تخزين وصيانة إدخالات مع الكتابة، حتى إن غطتها حصص جزئية.

## Google وApp Check والمنصات

الحساب الحالي يُحافَظ عليه بــUID المحفوظ في bootstrap lock وعضويته، لا بمطابقة
البريد وحده. الجرد الآمن الموجود يقرأ lock/member وAuth ويتحقق من Google والبريد
الموثق وactive/approved/generalManager؛ لا يعيد إنشاء المدير أو تشغيل bootstrap.
لا نغير Email/Password في Console الآن. Velnix يقبل Google فقط، والمستخدم الجديد
pending، وصلاحية الموافقة للمدير العام من Backend ومعاملة وAudit.

| المنصة | متطلبات الدخول وApp Check | المانع/التأجيل |
| --- | --- | --- |
| Web | التسجيل النشط ace9b264b4fae48ac43cda، Google provider/OAuth consent وأسماء مستخدمي الاختبار عند الحاجة، نطاق HTTPS النهائي في Authorized Domains وreCAPTCHA v3، site key عام في البناء والسر في Console فقط | site key فارغ محليًا؛ preflight يفشل. لا يوجد نشر Web/Hosting مفوض أو نطاق نهائي مثبت؛ لا إعادة نطاق Cloud Shell المؤقت |
| Android | com.mode2094.velnix، OAuth server client الحالي، SHA1 لتسجيل Google وSHA256 لـPlay Integrity لشهادة البناء المثبّتة فعلًا | preflight بنيوي ناجح مع Google flag=false؛ لا يثبت شهادة البناء أو provider. release signing غير مجهز. يلزم جهاز يدعم Integrity وسياسة توزيع/recognition متوافقة مع التثبيت الاختباري دون نشر متجر |
| iOS | bundle مطابق وCLIENT_ID/REVERSED_CLIENT_ID وURL scheme من التسجيل الحالي، DeviceCheck كما يستخدمه الكود، Apple Team/Key ID ومفتاح خاص داخل Console الآمن | يلزم Mac/Xcode وتوقيع وجهاز/provider؛ preflight بنيوي فقط. App Attest ليس المزود الحالي ولا نبدله دون حاجة مثبتة |

App Check ليس خيارًا يمكن تأجيله للمنصة التي ستبدأ القبول: callables تستخدم
`enforceAppCheck:true` حتى لو Firestore enforcement في Console غير مفعل. إعداد
الـSDK وحده لا يثبت إصدار token حقيقي. يجب اختبار token صالح، ورفض غيابه/فساده.
لا تدخل وسائل emulator/debug في بناء قبول حقيقي ولا تُضعف enforcement لتجاوز مانع.
يمكن تأجيل تهيئة منصتين إذا كان أول قبول Web فقط، مع التصريح بأن قبولهما غير مكتمل.
Firestore App Check enforcement تغيير مستقل بعد قياس المنصات؛ ليس جزءًا ضمنيًا
من نشر القواعد، ولا تُعطَّل حماية حالية لتجاوز الفشل.

## FCM — ما يمكن إثباته بعد أول نشر

الإشعارات الداخلية تحتاج orderEventNotice وlistNotices/markNoticeRead؛ لا تتطلب
جهازًا أو VAPID/APNs. Push في ملفات المنصات **false** وVAPID فارغ؛ الإرسال للأجهزة
ليس بوابة لقبول الدخول/الطلبات الأولي.

- Web Push: FCM API + Firebase Installations، VAPID public key، HTTPS وإذن المتصفح،
  وworker متوافق مع نطاق التطبيق. `web/firebase-messaging-sw.js` غير مولّد حاليًا؛
  أداة `scripts/configure_web_push.py` الموجودة تولده محليًا من الإعداد العام، ثم
  يلزم rebuild والتأكد من تقديمه وتسجيله بالنطاق الصحيح. لا أسرار VAPID في Git.
- Android: Play Services وجهاز مخول، permission للإشعارات (موجود بالـmanifest)،
  إذن المستخدم وtoken وتسجيله عبر Backend. auto-init معطل حتى opt-in.
- iOS: Push Notifications capability وaps-environment/entitlements وتوقيع صحيح،
  Background Modes عند اختبار الخلفية، APNs auth key/team/key ID في Firebase Console
  عبر وسيلة آمنة. entitlements غير مجهزة في المصدر الحالي. يلزم التحقق من وصول
  APNs token قبل getToken على جهاز؛ لا ندعي نجاح iOS أو نصلح سباقًا غير معاد إنتاجه.
- بعد نشر Push مفوض: اختبر register/unregisterDevice، إرسال تحديث اصطناعي عام دون
  بيانات طلب حساسة، foreground/background/terminated وفق المنصة، وسحب الوصول
  والتعطيل. نجاح إرسال FCM لا يثبت ظهور إشعار؛ الكود لا يقدم دليل banner foreground
  على جميع المنصات. التجربة على الأجهزة هي التي تحسم السلوك.
- pushNotice يعالج أول محاولة، واستعادة pending/retry تعتمد على
  reconcileDeliveryStatuses. تأجيل scheduler يعني أن retry recovery غير مقبول بعد؛
  لا نعلن اكتمال Push لمجرد وصول رسالة واحدة. نشر المجدول يتطلب مراجعة شركات
  الشحن القائمة والـegress قبل السماح، لأنه يجمع المهمتين.

## دفعات النشر المقترحة — لا أوامر تنفيذ تلقائي

ملف الأدلة المصاحب يسجل أسماء الدوال لكل دفعة؛ هذه خطة مراجعة وليست إذن تشغيل.
لا تستخدم `firebase deploy` عامًا؛ قد يُفعّل APIs وينشئ service identities ويغير
IAM، وقد يعرض حذف دوال/فهارس غير موجودة بالمصدر. لا force، ولا حذف تلقائي.

1. **بوابة قراءة قبل التغيير:** من جلسة Cloud Shell البشرية المخولة الموجودة،
   تشغيل إجراء `scripts/phase1-readiness/start.sh` المحدث للقراءة فقط. احفظ
   project/region/locations، الفوترة، APIs، ruleset، الفهارس، deployed functions
   وrevisions وهوية runtime/build وسياسات IAM ذات الصلة، دون عرض UID أو tokens
   أو مستندات المستخدمين. لا إعادة bootstrap أو authorized domain مؤقت.
   أي403/400 غير محسوم يبقى بوابة غير متحققة، لا دليل غياب خدمة.
2. **بعد موافقة مجموعة APIs المحددة أدناه فقط:** تفعيل الناقص من APIs الأساسية،
   انتظار propagation ثم إعادة القراءة. لا نشر ضمن هذه الموافقة. اختيار runtime
   وbuild accounts والمنح اللازمة يحتاج مراجعة هوية محددة وموافقة تغييرها؛ لا
   نختلق اسم حساب أو نمنح صلاحيات قبل قراءته. استكمل Web OAuth/App Check الحقيقيين
   ونطاق HTTPS والبناء العام المعتمد. أي تغيير Console أو استضافة يحتاج تفويضه.
3. **بعد تفويض نشر منفصل محدد بالـcommit والموارد:** أضف الفهارس الناقصة فقط
   وانتظر READY. انشر الدفعة الداخلية المحددة أدناه وهوية التشغيل المعتمدة،
   وتحقق من Node22 وeurope-west1 وingress/Run invocation وApp Check وEventarc.
   callables تحتاج وصول HTTPS من العميل؛ لا تجعلها inaccessible بالـIAM ثم
   تتجاوز ذلك بفتح Firestore. وصول HTTP إلى callable لا يلغي Auth/App Check.
   بعدها انشر استثناءَي قواعد الملف الشخصي وقرار الانضمام فقط، بعد مقارنة وحفظ
   القواعد القديمة. إبقاء deny-all حتى جاهزية Backend يقلل نافذة التشغيل الجزئي.
   لا تبدأ تجربة مستخدم حتى نجاح كل مكونات الدفعة وقواعدها.
4. **قبول داخلي حقيقي أولًا:** Web HTTPS ثم Android ثم iOS عند استيفاء كل منصة.
   تحقق من الحساب الحالي والـUID عبر lock/Auth دون إنشاء العضوية، ثم Google
   وApp Check صالحين ورفض جلسة password أو token غير صالح. وافق منفصلًا على
   كتابات قبول اصطناعية في المشروع المشترك: إنشاء طلب مسمى للاختبار، حالات
   داخلية وتعديل وبحث وAudit وتعارض، مستخدمون Google حقيقيون مخولون للأدوار
   الأخرى→pending→موافقة/فريق/صلاحية→رفض/تعطيل/سحب فوري. لا حذف/مسح للاختبارات.
   لا تستخدم هويات emulator على Firebase الحقيقي.
5. **دفعة Push مستقلة لاحقًا:** تهيئة FCM/VAPID/APNs والأجهزة والـworkers وتفويض
   إرسال اختباري، ثم نشر registerDevice/unregisterDevice/pushNotice واختبار
   التسليم والمشاركة وسحب token. لا اكتمال retry recovery حتى اعتماد scheduler.
6. **المؤجل:** تهيئة إدارة اعتمادات الشركات/KMS عند الحاجة والاتفاق، ومراجعة
   scheduler المدمج مع مزامنة التوصيل قبل أي تشغيل دوري. تبقى دوال إرسال/اختبار
   التوصيل وwebhook خارج النشر الأول، وClick محجوبًا داخل الكود حتى استكمال العقد
   والتفويض. generic_v1 ليس بديلاً عنه. لا تجربة شركة أو شحنات أو طباعة أو متاجر.

**الدفعة الداخلية (23 دالة):** 22 callable هي:
`joinSession`, `listJoinRequests`, `decideJoinRequest`, `me`, `listOrders`,
`searchOrders`, `dashboardStats`, `companyStats`, `getOrder`, `createOrder`,
`updateOrder`, `changeOrderStatus`, `listCompanies`, `listMembers`, `saveMember`,
`listNotices`, `markNoticeRead`, `listSyncEvents`, `listAudit`, `listOrderCreators`,
`getSettings`, `saveSettings`، والمحفز `orderEventNotice` للإشعارات الداخلية.
تضمين listCompanies ضروري لنموذج إنشاء الطلب حتى إذا كانت القائمة فارغة.
هذه الدفعة تقبل الدخول والطلبات والإشعارات الداخلية فقط؛ لا ندعي عمل إدارة
اعتمادات الشركات أو تعيينها أو Push أو كل أزرار نطاقها المؤجل. لا فتح عام أو
تسليم نهائي بناء على قبول جزئي. أي دوال شحن منشورة سابقًا يجب جردها؛ عدم إدراجها
في دفعة جديدة لا يعطّل نسخة قديمة، وأي containment لها يحتاج موافقة منفصلة.

## التغييرات والأثر والتكلفة المحتملة

| المقترح | الأثر المتوقع | التكلفة/الحدود |
| --- | --- | --- |
| تفعيل APIs الناقصة | إتاحة منتجات النشر وربما إنشاء service agents مدارة | تفعيل API بحد ذاته ليس حجز compute؛ الاستخدام اللاحق قابل للفوترة، ولا ضمان صفر |
| هوية runtime/build ومنح ضيقة معتمدة | السماح ببناء وتشغيل Backend وقراءة/تحديث Auth/Firestore | IAM ليس تقدير استهلاك؛ لا Owner/Editor أو منح KMS مسبقة |
| 109 فهرسًا كحد المصدر، إضافة الناقص فقط | تمكين الاستعلامات وبناء إدخالات فهارس للبيانات القائمة | تخزين/عمليات استعلام index-entry بحسب التسعير والحجم؛ عدد الفهارس لا يعني109 كتابة مستند إضافية لكل طلب |
| Functions v2 / Build / Run / Registry / Storage / Eventarc/PubSub | صور وحاويات وأحداث وlogs وتخزين مصادر | CPU/memory/requests/build minutes/artifacts/storage/egress/retention؛ حدود كل دالة ليست budget cap |
| استثناءا قواعد Firestore | قراءة الملف والقرار الشخصيين فقط من SDK | قراءات/listeners تتكلف وفق الحصص؛ لا إتاحة طلبات مباشرة |
| Google OAuth وApp Check Web/mobile | تمكين عميل موثوق للقبول | حصص المزود/attestations/reCAPTCHA وشروط Apple؛ راجع الخطة ولا تفترض سعرًا موحدًا |
| FCM لاحقًا | رسائل عامة لأجهزة اختبار مخولة | FCM مدرج بلا تكلفة في تسعير Firebase الحالي؛ عمليات Backend/Firestore والأجهزة وحسابات Apple ليست مجانية بالضرورة |
| Scheduler مؤجل | job كل15 دقيقة، نحو96 تشغيل يوميًا/2880 في30 يومًا | المرجع الرسمي يذكر0.10USD/job/month قبل الإعفاء المؤهل (3 jobs/account)، إضافة إلى كلفة تنفيذ الدالة والقراءات؛ ليس عرض سعر للمشروع |
| KMS مؤجل | تشفير/فك اعتمادات الشركات إن فُوض | مفاتيح/إصدارات/عمليات قابلة للفوترة؛ غير مطلوب للقبول الداخلي |

لا تقدير شهري إجمالي موثوق دون عدد المستخدمين والطلبات والاستعلامات/اليوم، حجم
البيانات والفهارس والـlogs، عدد الأجهزة، زمن CPU والذاكرة والمنطقة والعملة وحصص
الحساب. قبل تفويض التشغيل راجع Billing calculator/quotas الفعلية وحدد ميزانية
وتنبيهات مع المالك؛ التنبيهات لا توقف الإنفاق. لا نفعّل budget أو retention policy
أو نبني حاويات أو نستحدث وظيفة مجدولة في هذه المرحلة.

## خطة التراجع والاحتواء

- قبل التغيير احفظ snapshot آمنًا للقواعد المنشورة والفهارس وحالة APIs وIAM
  وإعدادات الخدمة وrevisions الحالية وSHA/source/archive الدوال، وعيّن مسؤول
  التنفيذ. تجزئة source ليست نسخة استعادة. لا تنسخ private keys أو بيانات عملاء
  إلى Git. راجع `BACKUP_RESTORE_ROLLBACK_AR.md`.
- عند فشل البناء/الدالة: أوقف الانتقال للدفعة التالية. ارجع إلى إصدار آمن موثق
  إن كان موجودًا؛ أول نشر بلا نسخة سابقة لا يملك rollback وهميًا. قد يلزم إيقاف
  الوصول/trigger/job محدد أو إصلاح أمامي بموافقة تنفيذية، لا مسح بيانات.
- القواعد: إعادة ruleset/release المحفوظة قد تعيد deny-all وتغلق الواجهة؛ هذا
  احتواء متوقع يجب إبلاغه. لا تغيير أعضاء/Auth/lock ولا إعادة bootstrap.
- الفهارس الإضافية: اتركها أثناء التراجع ما لم تثبت ضرورة حذفها ويُفوض؛ لا ترجع
  fieldOverrides أو تحذف index موجودًا عشوائيًا. إنشاء فهرس لا يمكن اعتباره تراجعًا
  عن بيانات اختبار كُتبت.
- IAM: أزل فقط المنح المضافة لهذا التغيير بعد مراجعة التبعيات؛ لا تستبدل policy.
  لا تعطّل API كان مفعلًا من قبل أو تعتمد عليه خدمة أخرى؛ تعطيل API ليس rollback
  تلقائيًا آمنًا. لا تعدّل App Check/Domain لإخفاء فشل.
- العميل: ارجع لآخر build آمن مع flags معروفة، لا Demo مكان Live ولا debug App Check.
  لا يمكن التراجع عن رسالة وصلت أو استدعاء خارجي أو كتابات Auth/Firestore بمجرد
  إرجاع حاوية. لا Click في أي دفعة حالية.

## أول مجموعة تغييرات تحتاج موافقة المالك

**ليس طلب تنفيذ الآن؛ لا تصبح هذه الخطة تفويضًا تلقائيًا.** بعد قراءة الجرد
المخول الحديث وعرض قائمة الموجود، أول حزمة مقترحة هي **تفعيل الناقص فقط** في
`velnix-6c1a2` من:

`cloudfunctions.googleapis.com`, `cloudbuild.googleapis.com`,
`artifactregistry.googleapis.com`, `run.googleapis.com`, `eventarc.googleapis.com`,
`pubsub.googleapis.com`, `storage.googleapis.com`, `firestore.googleapis.com`,
`firebaserules.googleapis.com`, `identitytoolkit.googleapis.com`,
`firebaseappcheck.googleapis.com`.

الأثر: إتاحة مسار v2/Auth/rules/App Check، وقد ينتج عنها service identities/منح
مدارة وفق المنتج. لا نشر، لا حساب runtime جديد أو IAM يدوي، لا تغيير القواعد
والفهارس أو providers أو OAuth أو بيانات المدير، لا FCM/Scheduler/KMS في الحزمة.
التكلفة: لا compute أو scheduler ننشئه بهذه الحزمة؛ الاستخدام اللاحق قد يكلف على
Blaze ولا نعِد بصفر. لا تعطيل API كخطة تراجع عمياء. قائمة الناقص الفعلية لا يمكن
حسمها قبل الجرد، لذلك **لا يجوز تنفيذ كل القائمة بلا قراءة أو تفويض محدد**.

بعدها يعرض طلب نشر مستقل الـcommit والدوال23 وهوية التشغيل/build والمنح المحددة
والفهارس الناقصة وrules diff وإعداد Web النهائي وميزانية/حدود ومراقبة وخطة قبول
وrollback. لا يجوز توسيع موافقة APIs إلى Deploy أو IAM أو App Check تلقائيًا.

## مصادر رسمية ومراجع الكود

رُوجعت الوثائق العامة في15 أكتوبر2026؛ ليست قراءة لحساب المالك أو إعداداته:

- [بداية Functions ومتطلب Blaze](https://firebase.google.com/docs/functions/get-started)
- [Node22 وإدارة runtime والسعة](https://firebase.google.com/docs/functions/manage-functions)
- [مناطق Functions](https://firebase.google.com/docs/functions/locations)
- [Firestore triggers](https://firebase.google.com/docs/functions/firestore-events)
- [IAM وservice identities](https://cloud.google.com/functions/docs/concepts/iam)
- [مصدر CLI15.33.0 للنشر/APIs](https://github.com/firebase/firebase-tools/blob/v15.33.0/src/deploy/functions/prepare.ts)
- [مصدر CLI لقائمة الفهارس](https://github.com/firebase/firebase-tools/blob/v15.33.0/src/firestore/api.ts)
- [REST discovery للفهارس](https://firestore.googleapis.com/$discovery/rest?version=v1)
- [App Check Flutter](https://firebase.google.com/docs/app-check/flutter/default-providers)
- [Web reCAPTCHA](https://firebase.google.com/docs/app-check/web/recaptcha-provider)
- [Android Play Integrity](https://firebase.google.com/docs/app-check/android/play-integrity-provider)
- [Apple DeviceCheck](https://firebase.google.com/docs/app-check/ios/devicecheck-provider)
- [FCM Flutter وAPNs/VAPID](https://firebase.google.com/docs/cloud-messaging/flutter/client)
- [تسعير Firebase](https://firebase.google.com/pricing)، [Run](https://cloud.google.com/run/pricing)،
  [Scheduler](https://firebase.google.com/docs/functions/schedule-functions)،
  [KMS](https://cloud.google.com/kms/pricing).

الكود: `functions/src/index.js`, `join_requests.js`, `runtime_config.js`,
`providers.js`, `push.js`؛ `firestore.rules`, `firestore.indexes.json`؛
`lib/main.dart`, `live/live_app.dart`, `live/notifications_service.dart`؛
`scripts/check_runtime_config.py`, `configure_web_push.py` وملفات المنصات.

تنبيه نطاق أداة الجرد: blockers تقارن جميع35 دالة ومجموعة خدمات النشر الكامل؛
غياب Scheduler أوFCM المؤجلين لا يعني ضرورة تفعيلهما للدفعة الداخلية23. قرار
القبول الجزئي يُراجع مقابل الدفعة المصرح بها صراحة، ولا يحول أي blocker مجهول
أو خاص بالدفعة إلى نجاح ولا يغيّر phaseComplete إلى true.

## نتائج الفحوص لهذه المرحلة

`bash scripts/validate.sh` اكتمل بنجاح على Node22.23.3: Flutter325، Node123
(أربعة اختبارات انحدار جديدة)، Emulator68، Python12، وفحوص PDF/باركود36.
التنسيق والتحليل وsyntax وفحص الأسرار وnpm audit نجحت، وaudit سجل صفر ثغرات.
لم يُبنَ iOS أو يختبر جهاز/Google/App Check/FCM حقيقي، ولم ينفذ deploy.
فشل Web preflight المذكور **مانع حقيقي محفوظ**، وليس اختبارًا جرى تجاوزه؛
نجاح CI لبناء Live العام لا يثبت اكتمال إعداد Web القابل للتسجيل الحقيقي.

لم نكرر رحلة Chromium محليًا لأن تطبيق الأعمال والقواعد لم يتغيرا؛ وظيفة
`emulator-ui` القائمة تعيد21 سيناريو على commit المرحلة في Push وPR، وتُراجع
نتائجها الفعلية بعد الرفع. الأدلة الآلية المحلية في
`docs/evidence/stage3-deployment-preparation.json`، وروابط CI/الـcommit النهائي
في تقرير التسليم المرافق. لا نجاح سحابي مستنتج من أي محاكٍ.
