# أول نشر داخلي — مقترح للمراجعة فقط

**No-Go للتنفيذ الآن.** المصدر الأساسي f7ff33b، والفرع audit/production-readiness.
الأوامر أدناه **لم تُشغّل**؛ ليست script تطبيقيًا ولا تفويضًا. لا Deploy أو IAM
أو فهارس أو قواعد أو APIs أو enforcement من هذه الجلسة.

## الحالة والأسباب الباقية

آخر جرد **بإفادة المالك**: Functions/Run/Eventarc/Build/Registry مفعلة، لا Functions
منشورة، Scheduler غير مفعل ومؤجل، القواعد deny-all، والفهارس400 INVALID_ARGUMENT،
وBlaze مفعلة. لا نعيد استنتاج الفوترة أو إنشاء المدير. Pub/Sub وStorage وRules
API وحالة service agents وموضع قاعدة البيانات وIAM والبناء وApp Check تحتاج
قراءة مخولة حديثة قبل التنفيذ؛ تفعيل المنتجات الخمسة وحده لا يثبت جاهزيتها.
بيئة Codex لا تملك جلسة Google؛ لم تتصل بموارد المشروع أثناء التحضير.

**مانع مثبت في الأداة:** CLI15.33.0 ينفذ ensureAllRequiredAPIsEnabled قبل
matchingBackend/--only؛ الـmanifest الكامل يطلب Cloud Scheduler بسبب export
reconcileDeliveryStatuses. لذلك أمر --only23 من المصدر الكامل غير آمن لهذا
النطاق. جهزنا حزمة محلية منفصلة بمدخل يصدر23 handler فقط، دون تعديل سلوكها.
أداة اكتشاف Firebase SDK الفعلية أثبتت23 endpoint وrequiredAPIs خالية من Scheduler.
تبقى وحدات المصدر المشتركة في الحزمة، لكن لا endpoints للشحن أوPush ولا استدعاء
لها أثناء الاكتشاف؛ لا إعادة كتابة للمكونات العاملة.

## 1. قائمة النشر الدقيقة — 23 فقط

1. joinSession
2. listJoinRequests
3. decideJoinRequest
4. me
5. listOrders
6. searchOrders
7. dashboardStats
8. companyStats
9. getOrder
10. createOrder
11. updateOrder
12. changeOrderStatus
13. listCompanies
14. listMembers
15. saveMember
16. listNotices
17. markNoticeRead
18. listSyncEvents
19. listAudit
20. listOrderCreators
21. getSettings
22. saveSettings
23. orderEventNotice — محفز إنشاء orders/{orderId}/events/{eventId}؛ ليس Push.

القائمة المقروءة آليًا: config/first-internal-deploy.json. لا deliveryWebhook،
reconcileDeliveryStatuses، pushNotice، registerDevice، unregisterDevice، ولا
assignCompany/saveCompany/archiveCompany/restoreCompany/testCompanyConnection/
sendOrderToDelivery/resolveDispatchException. لا Scheduler أوFCM أوKMS في هذه الدفعة.
listCompanies/companyStats/listSyncEvents قراءات داخلية لا تنشئ شحنة أو اتصالًا.
عدم نشر وظائف الشركات المؤجلة يعني أن كل واجهات الشركات ليست ضمن القبول الأول.

## 2. الهويات والصلاحيات

| الهوية | التحديد | الحد الوظيفي المقترح والنطاق |
| --- | --- | --- |
| runtime + هوية محفز Firestore | **مقترحة:** velnix-runtime-internal@velnix-6c1a2.iam.gserviceaccount.com؛ لم ننشئها أو نثبت وجودها | role مخصص projects/velnix-6c1a2/roles/velnixInternalRuntime على المشروع، وRun Invoker على خدمة orderEventNotice وحدها عند معرفة اسمها الفعلي |
| build | **غير محسومة حتى قراءة Cloud Build**، وليس حساب runtime | Logging Writer على المشروع، Artifact Registry Writer مقيد بمستودع gcf-artifacts في europe-west1، Storage Object Viewer مقيد بملفات source/upload الخاصة بالبناء. لا Auth/Firestore/KMS/FCM/Editor |
| deployer البشري | moderohe8@gmail.com بجلسة Google Cloud وFirebase CLI رسميتين | إدارة الدوال المستهدفة وinvoke policy، وactAs على runtime وbuild المحددين فقط؛ فهرسة وقواعد في خطواتهما المصرح بها، لا إنشاء مفاتيح ولا Owner جديد |
| مسؤول تطبيق IAM | هوية حالية مخولة يثبتها المالك؛ لا ننشئ بديلًا أو نفترض role الحساب | إنشاء حساب runtime/role والمنح الإضافية المحددة وحفظ diff؛ لا يعطى runtime أوbuild أوdeployer إدارة IAM عامة تلقائيًا |

Role runtime المقترح في config/iam.first-internal-runtime.role.yaml يتضمن فقط:

- datastore.databases.get وgetMetadata، وdatastore.entities.get/list/create/update.
- firebaseauth.users.get/update؛ update يغطي disable/displayName/revokeRefreshTokens.
  إنشاء مستخدم Google يتم بتسجيله الشخصي، لا بصلاحية users.create للـruntime.
- eventarc.events.receiveEvent للأحداث المباشرة؛ لا receiveAuditLogWritten مطلوب هنا.

لا datastore.entities.delete؛ لا حذف نهائي للمستندات، ولا Auth create/delete/hash
export، ولا storage أوFCM أوKMS أوIAM administration. IAM الخاص بـFirestore لا
يعزل collections داخل القاعدة؛ هذه هوية Backend موثوقة، وصلاحيات الأدوار تبقى في
handlers. يجب التحقق من قبول permissions في custom role ومن عدم وجود منح أوسع
موروثة قبل اعتماد أنها أقل صلاحية فعليًا. YAML مقترح لم يُطبق أو يختبر سحابيًا.

لا يجوز اختيار build identity بالتخمين. الأمر الرسمي يعيد
projects/.../serviceAccounts/EMAIL في serviceAccountEmail. المتوقع أحد الحسابين
التاليين، لكن **لا نمنح أيًا منهما قبل النتيجة الفعلية**:

- 948196868655-compute@developer.gserviceaccount.com (Compute default).
- 948196868655@cloudbuild.gserviceaccount.com (legacy Cloud Build).

هما ليسا service agent service-948196868655@gcp-sa-cloudbuild.iam.gserviceaccount.com.
CLI المثبت لا يمرر buildConfig.serviceAccount اختياريًا من إعداد runtime؛ ضبط
VELNIX_RUNTIME_SERVICE_ACCOUNT لا يختار build account. لا نخترع flag أو حقل SDK
لهذا الغرض. إذا المطلوب build account مخصص مستقل، يلزم اعتماد مسار نشر آخر يدعم
ذلك والتحقق منه، وليس تعيينه وهميًا في هذه الوصفة.

حدود deployer المعروفة: cloudfunctions.functions.create/get/list/update/
sourceCodeSet/getIamPolicy/setIamPolicy، وعمليات/مواقع القراءة، وrun.services.get/
getIamPolicy/setIamPolicy لسياسة الاستدعاء، وقراءات المشروع والخدمات والفهارس
وموقع القاعدة والبناء، وiam.serviceAccounts.actAs على الهويتين المعتمدتين.
لا نعتبر هذه قائمة custom-role مُثبتة بكل مشروع دون testIamPermissions ومراجعة
service-agent policies. البديل الجاهز cloudfunctions.admin أوسع من الحد الدقيق؛
لا نسميه أقل صلاحية أو نمنحه تلقائيًا. deployer لا يحتاج الوصول إلى بيانات Auth
أوطلبات العملاء لأجل نشر الكود. Datastore Index Admin وFirebase Rules Admin
يخصان خطوتي الفهرسة والقواعد فقط، ويمكن فصلهما عن ناشر الدوال.

### service agents وتوسع IAM الذي لا يجوز إخفاؤه

الهويات المتوقعة، مع ضرورة قراءة وجودها ومنحها الحالية:

- service-948196868655@gcf-admin-robot.iam.gserviceaccount.com — Cloud Functions service agent.
- service-948196868655@gcp-sa-cloudbuild.iam.gserviceaccount.com — Cloud Build service agent.
- service-948196868655@serverless-robot-prod.iam.gserviceaccount.com — Cloud Run service agent.
- service-948196868655@gcp-sa-eventarc.iam.gserviceaccount.com — Eventarc service agent.
- service-948196868655@gcp-sa-pubsub.iam.gserviceaccount.com — Pub/Sub service agent.

الأدوار المدارة المقابلة تخص service agents فقط، لا runtime؛ لا تمنح serviceAgent
role لحساب بشري. راجع actAs/token minting الفعلي بين هؤلاء وruntime/build، ولا
توسع Token Creator إلى المشروع إن كفت منحة على حساب الهدف.

**قيد إضافي مثبت في CLI15.33.0:** عند أول تكامل event service، checkIam.js قد
يحاول إضافة roles/run.invoker وroles/eventarc.eventReceiver لحساب Compute default
على مستوى المشروع، وroles/iam.serviceAccountTokenCreator لهوية Pub/Sub على مستوى
المشروع، حتى مع runtime مخصص. هذه إضافات أوسع من الحد الوظيفي الأدنى، وليست
تفويضًا ضمنيًا. لا نقترح تمكين resourcemanager.projects.setIamPolicy للـdeployer
لتجاوز الفشل أو تعديل CLI لإخفاء الفحص. قبل التنفيذ يجب إما اعتماد هذه الإضافات
بأسمائها ونطاقها بعد مراجعة السياسة الحالية، أو اختيار مسار نشر أضيق والتحقق منه.
**الوصفة تظل No-Go ما دام هذا القرار أو build identity غير محسومين.**

Run Invoker على خدمة orderEventNotice لا يمكن تثبيت اسم مورده قبل وجود الدالة.
يحتاج ترتيب IAM الأولي ثم binding ضيق بعد إنشاء المورد وقبل نشر القواعد/اختبار
الأحداث. لا نستبدله بمنحة runtime على جميع Cloud Run services لمجرد الحفاظ على
ترتيب شكلي. إذا منع control plane إنشاء trigger قبل هذا الربط، توقف وراجع
الخطة؛ لا تجعل خدمة الحدث public ولا تفتح policy لتجاوز الفشل.

## 3. الفهارس اللازمة لأول قبول فقط

config/firestore.first-acceptance.indexes.json يضم فهرسين من المصدر الأصلي:

1. orders: status ASC, hasDelivery ASC, amountMinor ASC — عدادات/مبالغ لوحة المدير
   الافتراضية دون تاريخ أو شركة أو filter creator.
2. notices: recipientId ASC, createdAt DESC — الإشعارات الداخلية للمدير.

بقية الاستعلامات في هذا القبول تستعمل single-field indexes الافتراضية: قائمة
الطلبات بcreatedAt، بحث الاسم customerKey والهاتف phoneDigits دون فلاتر، أعضاء
بname، طلبات انضمام status، Audit بcreatedAt، والأحداث بوقتها. **يلزم قراءة field
index configuration وعدم وجود exemptions مخالفة**؛ ملف composite لا يثبتها.

القبول الأول: مدير حالي واحد، صفحة افتراضية دون date/company/creator/status/bucket
filters إضافية، طلب داخلي اصطناعي واحد بلا شركة، تعديل وحالات داخلية وبحث بلا
فلاتر وAudit وإشعارات داخلية. لا قبول فرق/أدوار جديدة أوcompanies أوكل23 callable
بكل الخيارات بهذا الفهرسين. الفلاتر المتقدمة أوشركة موجودة أوتوسيع الأدوار تستلزم
جرد استعلاماتها وفهارسها قبل تجربتها. لا ننشر109 فهارس استباقيًا.

### تشخيص400 دون تغيير سحابي

المسار wildcard الحالي مدعوم في CLI؛ لا دليل يكفي لتغيير parent أوpageSize كإصلاح
مؤكد. الأداة الجديدة probe_first_deploy_indexes.js تقارن GET wildcard دونpageSize
مع GET للمجموعات orders/notices/members بحجم100، وتتابع الصفحات وتتحقق من أسمائها
وحالاتها. تطبع أسباب Google المنقحة فقط، لا raw body أوtoken أوpageToken.

إذا نجحت المجموعات وفشل wildcard فالنتيجة تغطي تلك المجموعات فقط، ولا تدعي جرد
المشروع كله أو إثبات سبب400. توفر فهرسي القبول READY يمكن إثباته من orders/notices
المكتملتين دون ادعاء نجاح wildcard. النتائج المتكررة/المشوهة/خارج المشروع تفشل
بأمان، والنقص لا يُعتبر empty cloud state. لم نشغل هذه القراءات من Codex غير
المصادق عليه؛ الحل البديل مهيأ واختباراته Mock فقط حتى يعاد من Cloud Shell.

## 4. الأوامر المقترحة — اقرأ ثم وافق، لا تنفذ الملف كاملًا

### أ. قراءة وحفظ الأدلة قبل الموافقة

```bash
gcloud auth list --filter=status:ACTIVE --format='value(account)'
gcloud projects describe velnix-6c1a2 --format='value(projectNumber)'
gcloud builds get-default-service-account --project=velnix-6c1a2 --region=europe-west1 --format='value(serviceAccountEmail)'
node functions/scripts/probe_first_deploy_indexes.js
```

توقّف إن اختلف الحساب أوالرقم948196868655 أوكان build account فارغًا/غير متوقع.
احفظ IAM bindings/conditions وruleset/release ومحتوى القواعد الحالية، قائمة
الفهارس وحالاتها وfield configurations، حالة APIs وservice agents، وموقع قاعدة
(default) وقائمة الدوال الخالية وتوقيت الجرد. الأدلة الحساسة محليًا خارج Git.
لا ADC login أومفتاح إدارة. لا طباعة gcloud access token. لا تضف --json إلى
firebase login:list: إرجاع الأمر البرمجي قد يشمل حسابات وتوكنات؛ استخدم العرض
النصي غير debug إذا احتجت التحقق من Firebase CLI login.

### ب. IAM — بعد تفويض الهوية والمنح ومراجعة الموجود

الحساب والـrole أدناه **جديدان مقترحان فقط**. إذا وجدا، اقرأ السياسة ولا تستبدلهما
أو تعدلهما تلقائيًا. منفذ IAM يجب أن يملك تفويض التغيير، وليس مجرد Firebase login.

```bash
gcloud iam service-accounts create velnix-runtime-internal --project=velnix-6c1a2 --display-name='Velnix Internal Runtime'
gcloud iam roles create velnixInternalRuntime --project=velnix-6c1a2 --file=config/iam.first-internal-runtime.role.yaml
gcloud projects add-iam-policy-binding velnix-6c1a2 --member='serviceAccount:velnix-runtime-internal@velnix-6c1a2.iam.gserviceaccount.com' --role='projects/velnix-6c1a2/roles/velnixInternalRuntime'
gcloud iam service-accounts add-iam-policy-binding velnix-runtime-internal@velnix-6c1a2.iam.gserviceaccount.com --project=velnix-6c1a2 --member='user:moderohe8@gmail.com' --role=roles/iam.serviceAccountUser
```

بعد استخراج واعتماد EMAIL الفعلي للبناء فقط، وليس service agent، منح actAs
للبشري على build SA ومراجعة دوره الحالي. لا تنسخ قيمة EMAIL من التخمين:

```bash
# قراءة فقط: التحويل من اسم resource إلى البريد؛ بعدها يُراجع البريد ويُعتمد قبل أي grant.
VELNIX_BUILD_RESOURCE="$(gcloud builds get-default-service-account --project=velnix-6c1a2 --region=europe-west1 --format='value(serviceAccountEmail)')"
VELNIX_BUILD_SA="${VELNIX_BUILD_RESOURCE##*/}"
case "$VELNIX_BUILD_SA" in
  948196868655-compute@developer.gserviceaccount.com|948196868655@cloudbuild.gserviceaccount.com) ;;
  *) echo 'Build identity not verified; stop'; exit 1 ;;
esac
# توقف هنا للمراجعة/التفويض؛ أوامر grant التالية ليست مفوضة حاليًا.
test -n "$VELNIX_BUILD_SA"
gcloud iam service-accounts add-iam-policy-binding "$VELNIX_BUILD_SA" --project=velnix-6c1a2 --member='user:moderohe8@gmail.com' --role=roles/iam.serviceAccountUser
gcloud projects add-iam-policy-binding velnix-6c1a2 --member="serviceAccount:$VELNIX_BUILD_SA" --role=roles/logging.logWriter
# VELNIX_BUILD_AR_CONDITION وVELNIX_BUILD_STORAGE_CONDITION شروط CEL معتمدة، لا تتركهما فارغين.
test -n "$VELNIX_BUILD_AR_CONDITION" && test -n "$VELNIX_BUILD_STORAGE_CONDITION" || { echo 'Missing approved conditions; stop'; exit 1; }
gcloud projects add-iam-policy-binding velnix-6c1a2 --member="serviceAccount:$VELNIX_BUILD_SA" --role=roles/artifactregistry.writer --condition="$VELNIX_BUILD_AR_CONDITION"
gcloud projects add-iam-policy-binding velnix-6c1a2 --member="serviceAccount:$VELNIX_BUILD_SA" --role=roles/storage.objectViewer --condition="$VELNIX_BUILD_STORAGE_CONDITION"
```

AR condition يجب أن يطابق فقط مسار gcf-artifacts في europe-west1 (المستودع نفسه
وأطفاله، بصيغة resource.name الفعلية)، وStorage condition فقط Objects لمصادر
البناء/upload داخل المشروع. لا Firebase Storage بيانات التطبيق ولاالمشروع كله.
إذا المورد لم ينشأ بعد، تُراجع condition على اسم المورد المتوقع والصيغة المدعومة
قبل التفويض، أوتُفصل تهيئة المورد المصرح بها وربط IAM؛ لا نخترع أسماء buckets أو
نعوّضها بمنحة project-wide. لهذه الشروط واعتماد build account وCLI extras بوابة
موافقة باقية؛ هذه الأسطر ليست أوامر IAM نهائية صالحة للنسخ دونها.

### ج. إنشاء فهرسي القبول الناقصين فقط

**لا تشغل الإنشاء حتى معرفة الموجود والمطابقة وREADY.** إن كان الفهرس موجودًا
فلا تعِد إنشاءه. لا تستخدم firebase deploy:firestore:indexes بملف subset؛ قد يطلب
حذف فهارس أخرى. الأوامر create-only المقترحة:

```bash
gcloud firestore indexes composite create --project=velnix-6c1a2 --database='(default)' --collection-group=orders --query-scope=collection --field-config=field-path=status,order=ascending --field-config=field-path=hasDelivery,order=ascending --field-config=field-path=amountMinor,order=ascending
gcloud firestore indexes composite create --project=velnix-6c1a2 --database='(default)' --collection-group=notices --query-scope=collection --field-config=field-path=recipientId,order=ascending --field-config=field-path=createdAt,order=descending
```

سجل كل operation/index ID جديد وانتظر READY بقراءة موثقة. ALREADY_EXISTS ليس
إثبات READY؛ لا تخفِه أو تمسح فهرسًا لاستبداله. لا تغيّر fieldOverrides الآن.

### د. تجهيز المصدر محليًا ثم نشر الدوال وحدها بعد الموافقة المنفصلة

```bash
node functions/scripts/prepare_first_internal.js
npm --prefix build/first-internal/functions ci --omit=dev --ignore-scripts
```

هذه أوامر ملفات محلية؛ رُوجعت واختُبرت. لا يعيد المجهز الكتابة فوق مجلد موجود.
الحزمة المولدة وreview.json وSHA يجب أن يخصوا commit الموافقة، وليس حزمة قديمة.
لا تحذف مجلدًا موجودًا خفية؛ احفظه للمقارنة ثم جهز نسخة جديدة بعد مراجعة المصدر.
لا تغير lockfiles أوNode22. يلزم root functions/node_modules المثبت للقفل لاستخدام
CLI؛ bundle نفسه يحتوي dependencies الإنتاج المثبتة فقط.

Firebase CLI يحتاج تسجيله الرسمي بنفس الحساب، وليس مجرد نجاح gcloud auth.
إن كان غير مسجل، تكون firebase login --no-localhost --no-collect-usage خطوة
تفاعلية رسمية للمالك، دون مشاركة code/token في المحادثة. ليست إنشاء مستخدم Velnix.
إلى أن تستوفى بوابات IAM/بناء/APIs/App Check ويصدر تفويض نشر محدد، **لا تشغل**:

```bash
functions/node_modules/.bin/firebase deploy --project velnix-6c1a2 --account moderohe8@gmail.com --config build/first-internal/firebase.json --only functions:joinSession,functions:listJoinRequests,functions:decideJoinRequest,functions:me,functions:listOrders,functions:searchOrders,functions:dashboardStats,functions:companyStats,functions:getOrder,functions:createOrder,functions:updateOrder,functions:changeOrderStatus,functions:listCompanies,functions:listMembers,functions:saveMember,functions:listNotices,functions:markNoticeRead,functions:listSyncEvents,functions:listAudit,functions:listOrderCreators,functions:getSettings,functions:saveSettings,functions:orderEventNotice --non-interactive
```

لا تستخدم root firebase.json لنشر الدوال، ولا functions عامة، ولا --force.
حتى هذا الأمر قد يولد service identities ويعدل IAM القياسي؛ الحزمة تمنع Scheduler
من manifest، ولا تحول deploy إلى عملية بلا آثار. يجب أن تكون APIs الأساسية
مفعلة مسبقًا والمنح المحتملة مُراجعة ومصرحًا بها؛ لا توجد موافقة تلقائية لتجاوز نقص.

تحقق من اسم Cloud Run الفعلي للمحفز، ثم binding الضيق المصرح به، **قبل أي حدث قبول**:

```bash
gcloud functions describe orderEventNotice --gen2 --project=velnix-6c1a2 --region=europe-west1 --format='value(serviceConfig.service)'
# VELNIX_NOTICE_SERVICE هو آخر جزء من المسار الفعلي أعلاه بعد التحقق، لا اسم مخمّن.
test -n "$VELNIX_NOTICE_SERVICE" || { echo 'Missing verified service name; stop'; exit 1; }
gcloud run services add-iam-policy-binding "$VELNIX_NOTICE_SERVICE" --project=velnix-6c1a2 --region=europe-west1 --member='serviceAccount:velnix-runtime-internal@velnix-6c1a2.iam.gserviceaccount.com' --role=roles/run.invoker
```

تحقق أن23 دالة فقط ACTIVE/GEN_2/nodejs22 فيeurope-west1، وbuildConfig.serviceAccount
بالحساب المعتمد، وserviceConfig.serviceAccountEmail/runtime وEventarc trigger
identity/location، وأن Scheduler ما زال غير مفعل ولا job/Push/webhook جديد.
لا تقبل أسماء الدوال دليلًا على commit المصدر؛ احتفظ بـbuild/revision/source digest.

### هـ. القواعد المحدودة بعد جاهزية Backend فقط

الأمر المقترح لا يشمل indexes أو functions:

```bash
functions/node_modules/.bin/firebase deploy --project velnix-6c1a2 --account moderohe8@gmail.com --config build/first-internal/firebase.json --only firestore:rules --non-interactive
```

التغيير فقط get للـmembers/{uid} وjoinRequests/{uid} لصاحبهما. كل client writes
وlist والطلبات والإعدادات تبقى ممنوعة؛ Admin SDK لا تحكمه هذه القواعد. احفظ نسخة
deny-all الفعلية وrelease ID أولًا. لا App Check enforcement Console change؛
callables أصلًا تفرضه من الكود، فتحتاج provider/token حقيقيين للقبول.

### و. المدير الحالي — لا bootstrap ولا تغيير الحساب

قبل قبول الواجهة: إعداد Web public site key والنطاق HTTPS/OAuth المعتمد، نسخة
Live مستقلة: VELNIX_GOOGLE_ENABLED=true، VELNIX_PUSH_ENABLED=false،
VELNIX_DEBUG_APPCHECK=false، والمشروع/التسجيل الحاليان. ما زال site key المحلي
فارغًا؛ لا نختلق قيمة أو ننشر Hosting أو domain أوprovider إعدادًا ضمن هذا الطلب.

تحقق من lock UID ثم Auth Google/emailVerified ومن العضوية active/approved/generalManager
دون تعديلها. بعد موافقة كتابات الاختبار فقط يسجل المالك الدخول بGoogle من الواجهة،
ويختبر رحلة المدير المقيدة في بند الفهارس. اختبر رفض token بلا App Check/بلا عضوية،
ومنع قراءة/حذف orders مباشرة، وAudit وعدم التكرار. لا حجز شحنة أوPush أوإضافة حساب
اختبار Google مصطنع. الدخول الحقيقي والتجربة السحابية لم ينفذا في هذه المرحلة.

## 5. Rollback لكل خطوة

| الخطوة | التراجع/الاحتواء المقترح — يحتاج تفويضه |
| --- | --- |
| IAM | احفظ bindings/conditions/etag قبل وبعد، وأزل فقط كل binding أضيف لهذا الإصدار بنفس condition. لا replace-policy أوحذف منح سابقة. احذف/عطل role وSA الجديدين فقط بعد إزالة dependencies وإذا ثبت أنهما أُنشئا لهذه الدفعة؛ لا تمس حساب المدير |
| build/storage IAM | أزل grants المضافة على الهوية الفعلية فقط؛ لا تسحب دورًا كان يخدم بناء آخر، ولا تمس خدمة Cloud Build أو Compute الافتراضية أو service agents |
| الفهرسان | الأفضل إبقاؤهما عند التراجع لأنهما إضافة غير مدمرة. أي حذف لاحق يقتصر على IDs التي ثبت إنشاؤها بهذه الدفعة وبعد فحص المستخدمين؛ لا حذف بقية109 أو fieldOverrides |
| أول23 دالة | لا إصدار سابق للرجوع إليه حسب الجرد. احفظ سجل الموارد التي نجح إنشاؤها وrevision/build أولًا؛ containment/حذف هذه الدوال الجديدة فقط بقرار منفصل، دون بيانات Auth/Firestore. لا تدعي rollback لحاوية قديمة غير موجودة. gcloud functions delete NAME --gen2 --region=europe-west1 --project=velnix-6c1a2 أمر مراجعة فقط لكل NAME مثبت |
| القواعد | أعد نشر ملف/إصدار deny-all المحفوظ إذا فشل القبول؛ يغلق streams الخاصة بالواجهة. **لا يوقف Admin SDK أو HTTPS Backend وحده**؛ احتواء الدوال خطوة مستقلة إذا كان الخطر منها |
| اختبار القبول | إرجاع الكود/القواعد لا يمحو طلبًا أوAudit أوتحديث Auth. لا مسح بيانات ولا إعادة bootstrap؛ احتفظ بوسم الاختبار واطلب معالجة منفصلة إذا لزم |

لا تعطّل APIs أو App Check لإخفاء فشل، ولا تفتح القواعد، ولا تستخدم generic_v1 بدل
Click. حذف دوال أول نشر لا يلغي كلفة artifacts/logs/index storage؛ راجع retention
بقرار منفصل دون حذف عشوائي. لا Scheduler أُنشئ في الخطة كي يحتاج rollback.

## 6. قرار الموافقة التالي

**Go للحزمة المحلية والاختبارات؛ No-Go لأول Deploy الآن.** الباقي المحدد:
نتيجة probe الفهارس وsingle-field exemptions، build identity الفعلية ومنحها،
حساب runtime/role المقترحان والمنح الضيقة، قرار إضافات IAM التي يطلبها CLI، موقع
Firestore/Eventarc، وApp Check/OAuth/بناء Web الحقيقي. لا CI أوemulator يثبت هذه.

قائمة الموافقة المطلوبة بعد استكمال القراءة: إنشاء/اعتماد runtime وrole المحددين
ومنح actAs/البناء/service agents المحددة **بقيم حقيقية لا placeholders**، إضافة
الناقص من الفهرسين فقط، نشر الحزمة23 بالـcommit المعتمد وآثار IAM المتفق عليها،
ربط Invoker الضيق للمحفز ثم استثناءَي القواعد، وأخيرًا كتابات قبول مدير اصطناعية
محددة على المشروع المشترك. لا تسع موافقة IAM وحدها Deploy أوتغيير Console؛ يمكن
اعتماد الحزمة التنفيذية المحددة مجتمعة بعد غلق الموانع. لا موافقة مالية مفتوحة:
Build/Run/Registry/Storage/Firestore/Eventarc قابلة للفوترة علىBlaze، ولا سعر كلي
موثوق دون حمل/retention وحدود instances للمحفز. Scheduler/FCM/KMS/Click خارجها.

المراجع: [مراجعة المرحلة الثالثة](STAGE3_REAL_DEPLOYMENT_REVIEW_AR.md)،
[هوية البناء وصلاحياتها](https://cloud.google.com/functions/docs/building)،
[استخراج build SA](https://cloud.google.com/sdk/gcloud/reference/builds/get-default-service-account)،
[تغير حساب البناء الافتراضي](https://cloud.google.com/build/docs/cloud-build-service-account-updates)،
[مصدر CLI prepare](https://github.com/firebase/firebase-tools/blob/v15.33.0/src/deploy/functions/prepare.ts)،
[فحص IAM فيCLI](https://github.com/firebase/firebase-tools/blob/v15.33.0/src/deploy/functions/checkIam.ts).

## نتائج التحضير المحلية

نجح validate.sh: Flutter325، Node127، Emulator68، Python12، PDF/باركود36،
والتنسيق والتحليل وsyntax وتدقيق التبعيات (صفر ثغرات). أربعة اختبارات جديدة
تثبت SDK manifest المعزول23 مقابل35 وScheduler في الكامل، هوية runtime والمنطقة،
الفهرسين كsubset، وscope/pagination/errors في probe. أُعيد Node127 بعد تقوية
assertions النهائية؛ ونجح npm ci الإنتاجي للحزمة بالقفل نفسه دون تغيير dependencies.
هذه ليست Cloud Build ولا نشرًا أوتجربة المدير الحقيقي أوتشخيص400 فعليًا.
تفاصيل قابلة للمراجعة: docs/evidence/first-internal-deploy-preparation.json.
نتائج CI للـcommit النهائي تُراجع بعد الرفع، ولا تستنتج من هذه النتائج المحلية.
