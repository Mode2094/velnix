# التهيئة الآمنة وتسليم المصدر

> تحديث طلب المالك الحالي: التجربة والتسليم النهائي على مشروع واحد velnix-6c1a2. [وثيقة ربط المشروع الحالي](FIREBASE_CURRENT_PROJECT_SETUP_AR.md) تحدد التسجيلات والإعدادات المحلية والقيود. افتراض مشروع Staging مستقل في الخطط السابقة أُلغي بهذا الطلب؛ قيمة staging الآن لا تثبت عزل البيانات، ولا تسمح بتشغيل اختبارات المسح أو الاستعادة على المشروع الحقيقي. لا إنشاء موارد أو فوترة أو Deploy في هذا الطلب.

## الملفات العامة والاعتمادات

أمثلة `config/firebase.staging.public.example.json` و`config/firebase.production.public.example.json` فارغة عمداً؛ انسخ المثال إلى `config/firebase.staging.public.json` أو ملف محلي منفصل لكل منصة. الأمثلة تتضمن mode/environment وflags، ولا تحمل أسراراً. `.gitignore` يستثني ملفات Firebase/IAM المحلية ويحتفظ بالأمثلة. اختيار project ID الصحيح مسؤولية المالك؛ اسم الملف وحده لا يثبت فصل البيئة.

الأمر التالي فحص offline مستقبلي بعد تعبئة **إعداد عام فقط**؛ لا ينشئ مورداً ولا يتصل بـFirebase:

```bash
python3 scripts/check_runtime_config.py config/firebase.staging.public.json   --environment staging --platform web --expected-project YOUR_STAGING_PROJECT
```

كرر لكل منصة بملف appId/sender/APIKey الصحيحين؛ platform web/android/ios. الفحص يرفض المفاتيح غير العامة وprivate-key markers وDemo وdebug App Check في release، ويرفض اختلاف المشروع والحقول الناقصة. نجاحه لا يثبت ملكية التطبيق أو تفعيل APIs أو IAM أو Authorized Domains. لا تضف كلمات مرور Click/User_Pass أو Admin SDK keys إلى dart defines؛ إعداد العميل يظهر في binary بطبيعته.

بعد تفويض إعداد Staging، يستخدم البناء `--dart-define-from-file=config/firebase.staging.public.json`. `VELNIX_ENVIRONMENT=staging` صريح. إنتاج لاحق مفوض يستلزم production preflight وLive؛ runtime يرفض Demo وdebug provider في production، وdemo- project. لكن build release Demo development مسموح للـQA القائم؛ لا يُوزع كإنتاج. لا يستطيع guard إثبات أن مشروعاً حقيقياً باسم معين هو مشروع الإنتاج؛ المراجعة ومطابقة manifest/project إلزاميتان.

احتفظ بملفات Android google-services.json وiOS GoogleService-Info.plist المحلية خارج Git. عند استخدام fallback native configuration تحقق من نفس project/app registration؛ لا تجمع ملف native لمشروع مع dart defines لمشروع آخر. معرف التطبيق الحالي com.mode2094.velnix والمنطقة europe-west1. Android يحتاج شهادة توقيع وSHA للـOAuth/Integrity؛ كود signing release لم يجهز بعد. iOS يحتاج Mac/Xcode وApple signing وURL schemes وPush capabilities/APNs والتحقق من DeviceCheck. CI Linux لا يبني iOS.

Google/Push false افتراضياً، ولا تفعلهما قبل التجهيز. Web FCM يحتاج VAPID العام وWorker محلي من scripts/configure_web_push.py مطابقاً للمشروع، ثم اختبار browser HTTPS. تمويل/تفعيل الخدمات ليس ضمن هذه المرحلة.

## Backend وIAM وKMS

`functions/.env.example` يحمل metadata placeholders فقط. نسخة `functions/.env.<PROJECT_ID>` محلية مستثناة: مرجع VELNIX_KMS_KEY، حساب VELNIX_RUNTIME_SERVICE_ACCOUNT التجريبي، وALLOWED_DELIVERY_HOSTS فارغ حتى اعتماد host محدد مستقبلاً. لا private keys ولا token شركة في هذه الملفات. ADC/هوية تشغيل مُدارة عبر بيئة المنصة أفضل من ملفات private-key JSON؛ لا تعرض الاعتمادات في التقرير.

عند تحديد runtime service account يطبق Functions v2 setGlobalOptions لجميع handlers؛ يتحقق الكود من صيغة حساب user-managed ومن المشروع عند توفر project env. تركه فارغاً يحافظ على default identity القائمة **ولا يثبت أقل صلاحيات**. يجب مراجعة هوية كل خدمة فعلياً بعد تجهيز Staging؛ إعداد global ليس تدقيق IAM ولا grant.

`config/iam.staging.example.json` قائمة منح إضافية للمراجعة فقط، ليست policy تستبدل bindings. أدوار مرشحة datastore.user وfirebaseauth.admin وfirebasecloudmessaging.admin، وصلاحية KMS encrypt/decrypt على المفتاح المحدد فقط. راجع تعريفاتها الحالية واحتياج العمليات؛ فضّل Auth custom role أضيق إذا غطى CRUD القائم. لا Owner/Editor أو KMS admin أو استخراج password hashes لهوية التشغيل. افصل deploy/backup/runtime؛ امنح المشغل actAs عند الحاجة بعد مراجعة، ولا تمنح حساب التطبيق إدارة IAM.

راجع APIs والمناطق والفوترة وApp Check enforcement وAuth providers وAuthorized Domains ومفاتيح Web restrictions والمراقبة من مشروع المالك نفسه لاحقاً. callable guards ثابتة محلياً، لكن Admin SDK يتجاوز Firestore rules، فلا تغني القواعد عن مراجعة backend IAM. لا توجد أدلة IAM/KMS/FCM فعلية في بيئة المرحلة الرابعة.

Click يبقى disabled وAdapter محجوب حتى العقد والاستجابات الرسمية والموافقة. لا use generic_v1 ولا webhook secret مختلق. الاعتمادات المستقبلية تدخل Backend المخول وتخزن مشفرة KMS، ولا تُعاد إلى Flutter أو logs.

## تسليم المصدر والأدلة

المصدر يسلم على audit/production-readiness وPR#1 دون Merge. يشمل app وfunctions والقواعد والفهارس وlockfiles وCI/tests/docs/evidence وأمثلة عامة. اربط النسخة المسلمة بـSHA وartifact checksum والمنصة والبيئة؛ تحقق من clone وlocks والفحوص وفق README وscripts/validate.sh. توثيق pins وأدوات البيئة ليس بديلاً عن اختبار checkout جديد لاحقاً.

مالك المستودع يؤكد وصول المطورين والعميل بصلاحيات مناسبة وسياسة branch protection/retention ونسخ repo الاحتياطي. CI permissions الحالية contents:read ولا تحمل مسار نشر إنتاج؛ artifacts QA اصطناعية، لا أسرار. راجع أي إضافة سرية مستقبلية في إعداد GitHub لا في ملفات عامة. حفظ source لا ينسخ إعدادات Firebase أو IAM أو مفاتيح التوقيع.

المطلوب من المالك عبر وسيلة آمنة: project IDs وpublic app configs/منصات، هوية/IAM/KMS وميزانية، ملفات signing/APNs ضمن خزنة خاصة، حسابات QA، عقد Click الرسمي وحساب sandbox لاحقاً، أجهزة/طابعة/ماسح، أهداف تشغيل وretention/RPO/RTO وقرار الاستعادة، ثم قبول التطبيق في المرحلة الخامسة. لا يُطلب تشغيل إنتاج أو مشاهدة التطبيق الآن.

راجع [خطة الاستعادة](BACKUP_RESTORE_ROLLBACK_AR.md) و[قبول Staging](STAGING_ACCEPTANCE_PLAN.md). لا تنفذ bootstrap أو نشر أو إنشاء خدمات من هذه الوثيقة دون التفويض اللاحق.
