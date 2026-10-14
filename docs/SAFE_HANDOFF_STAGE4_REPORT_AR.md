# المرحلة الرابعة — جاهزية التسليم الآمن

> تحديث ثبات CI بعد8fa8d99: [تقرير المعالجة وبوابة إغلاق المرحلة الرابعة](STAGE4_CI_STABILITY_CLOSURE_AR.md). الأصل: Push ناجح وPR فاشل بحسب المالك. الإصلاح اجتاز3تكرارات و318Flutter/58Node/48محاكي/12Python/36PDF محلياً، لكن الإغلاق معلق حتى تأكيد Push وPR على SHA الإصلاح نفسه؛ الوصول إلى GitHub CI محجوب حالياً. لا اعتماد مرحلةخامسة أو إنتاج من النجاح المحلي وحده.

بدأت المراجعة من e005c66 على audit/production-readiness بعد قراءة تقارير المراجعة الهندسية والواجهات وClick وتسليم العميل والأمان وخطة Staging. لم تكرر الإصلاحات المثبتة ولم تضف وظائف أعمال. لا Merge/Deploy أو خدمات مدفوعة أو بيانات عملاء أو اتصال فعلي بـClick أو طابعة.

## المراجعة والإصلاحات المثبتة

| النتيجة | الخطورة/الإجراء | الدليل والحدود |
|---|---|---|
| تعطل unregisterDevice كان يمنع deleteToken عند الخروج | متوسطة، finally يحاول إبطال token حتى عند فشل lookup/backend | 3 اختبارات انحدار؛ إذا فشل المساران معاً يبقى سحب الإشعارات شرط جهاز/Staging، ولا ندعي ضمان offline |
| bootstrap Firebase/App Check كان يعرض نص exception الخام | متوسطة، رسالة عربية ثابتة بدلاً من diagnostic SDK | widget test؛ لا raw secrets أو SDK error في الشاشة |
| نية البيئة لم تكن منفصلة صراحة عن build QA | تعزيز إعداد، environment صريح ومنع Demo/debug App Check ومشروع demo- عند production | اختبارات RuntimeConfig وpreflight؛ QA release Demo development محفوظ ولا يوزع إنتاجاً |
| لا اختيار موثق لهوية runtime المحدودة | تهيئة آمنة اختيارية، setGlobalOptions serviceAccount مع تحقق الصيغة/المشروع | 3 Node tests؛ لا IAM grant ولا إثبات أقل صلاحيات/default identity |
| خطة Staging القديمة تفترض عقد generic | وثائق مصححة لـClick المحجوب والاستجابات غير المعروفة | لا webhook أو endpoints أو مبالغ مخترعة ولا تفعيل للمحول |

## نتيجة المراجعة الأمنية

| المجال | ما تحقق محلياً | ما يبقى خارجياً |
|---|---|---|
| Firestore/Auth/الأدوار | deny client CRUD/list؛ self-profile فقط؛ active membership والصلاحيات ونطاق الفرق يعاد تحققها backend وفي المعاملات؛ جميع الأدوار تنشئ؛ لا callable حذف نهائي | Auth providers/session/disable وIAM الحقيقي؛ Admin SDK يتجاوز القواعد |
| المعاملات والأحداث | revisions/idempotency/terminal/authorizationVersion وأقفال الشحن ومنع تحديث متأخر/مكرر؛ audit محفوظ | ضغط وfailure injection على المشروع الحقيقي دون بيانات إنتاج |
| الخصوصية | المبالغ مقيدة؛ مفاتيح الشركات backend/KMS فقط؛ سجلات codes آمنة؛ لا raw SDK diagnostic في startup | مراقبة Cloud Logging وretention ووصول operators والتنبيهات |
| الاتصالات والتشفير | HTTPS/host allowlist/منع redirect وحد حجم ومهل؛ Click محجوب قبل استدعاء الشبكة | actual KMS/API permissions والمشروع الحقيقي؛ لا فحص اختراق شامل |
| Firebase/App Check/FCM | guards وflags وتهيئة public placeholders؛ release debug ممنوع | registered apps/App Check enforcement/FCM consent/background/logout على الأجهزة |
| retry والتعطل | push4/lease2min وفencing وacks واستعادة15min/25jobs/45sec؛ dispatch ملتبس يحتاج مراجعة؛ لا تغيير غير ضروري | backlog/cost وrare duplicate عبر نجاح FCM قبل الحفظ؛ Cloud scheduler actual |
| المصدر والتبعيات | lockfiles وpinned actions وcontents:read؛ scanner بلا findings وnpm audit إنتاج صفر advisories | تدقيق supply-chain شامل/تبعيات dev وسياسة وصول repository |

لا bootstrap أو backfill أو migrations أو cloud commands نفذت. configs الفعلية والـADC/KMS/runtime binding غائبة في البيئة؛ لا تدّعي جاهزية cloud من المثال الفارغ. region europe-west1 ومعرف com.mode2094.velnix محفوظان. iOS لا يبنى على Linux؛ Android release signing غير مجهز. أبنية Live بدون configs تثبت compile فقط.

## الملفات وأسباب التغيير

- lib/main.dart وlib/core/runtime_config.dart: تحقق نية البيئة وإخفاء خطأ التهيئة الخام في الشاشة القائمة.
- lib/live/notifications_service.dart وdevice_revocation.dart: عدم تخطي محاولة deleteToken عند تعطل unregister؛ لا queue أو سلوك أعمال جديد.
- functions/src/index.js وruntime_config.js: اختيار هوية runtime metadata محدودة مستقبلية، دون إضافة handler.
- test/safe_handoff_test.dart وfunctions/test/runtime_config.test.js: 6 Flutter و3 Node للإصلاحات والإعداد الجديد.
- scripts/check_runtime_config.py وtest_runtime_config.py وvalidate.sh وCI: preflight offline و5 اختبارات حدود؛ كل الفحوص السابقة محفوظة بلا skip أو continue-on-error.
- config/firebase.*.example.json وconfig/iam.staging.example.json وfunctions/.env.example و.gitignore: templates عامة فارغة ومنع حفظ نسخ التشغيل؛ IAM قائمة مراجعة إضافية وليست policy replacement.
- android/app/build.gradle.kts: حذف تعليق يوهم بوجود signing؛ إعداد التوقيع لم يتغير.
- SAFE_CONFIGURATION_HANDOFF_AR وBACKUP_RESTORE_ROLLBACK_AR وSTAGING_ACCEPTANCE_PLAN وREMAINING_EXTERNAL_REQUIREMENTS: owner inputs وIAM/FCM/platforms وخطة الاستعادة وبوابات Click والأجهزة والقبول.
- README وCLIENT_HANDOFF_REPORT وTEST_RESULTS وSECURITY_AUDIT وevidence/safe-handoff-stage4-validation.json: مراجع ونتائج وحدود النسخة الحالية مع حفظ السجل التاريخي.

## الفحوص المحلية النهائية

312 Flutter و54 Node و48 Auth/Firestore Emulator و5 Python preflight و36 قراءة PDF/barcode رقمية: جميعها ناجحة دون skipped أو failed cases. format/analyze/syntax ناجحة؛ npm audit --omit=dev صفر vulnerabilities. من اختبارات Node فحوص نصية/static أيضاً؛ المحاكيات ليست callable/App Check/IAM منشورة. قراءة barcode تتضمن preprocessing المعلن سابقاً ولا تعادل طابعة.

Web Demo/Live وAndroid Debug Demo/Live: أربعة أبنية ناجحة. تحذيرات Cupertino font/Kotlin-plugin compatibility المعروفة لم تتحول إلى أخطاء؛ لا تغيير deps دون عيب مثبت. iOS/build signing/actual Firebase/Click/devices/printing/backup/restore غير منفذة، لا فشل متجاوز.

[دليل النتائج وhashes](evidence/safe-handoff-stage4-validation.json) يخص المحتوى المحلي قبل commit. رقم commit الفعلي وروابط CI النهائية تقدم بعد push في تقرير التسليم؛ لا يمكن أن يضم commit رقم نفسه. CI الجديد لا يستنتج من نجاح e005c66 السابق. [PR#1](https://github.com/Mode2094/velnix/pull/1) يبقى على فرع التطوير إلى main دون دمج.

## قرار الانتقال

المصدر والتحضير المحلي صالحان للانتقال المشروط إلى المرحلة الخامسة بعد نجاح CI النهائي وحفظ SHA البعيد. يبدأ اختبار Firebase الداخلي فقط بعد توفير مشروع Staging المستقل والإعدادات وIAM والميزانية والتفويض؛ لا تشغيل موارد الآن. اختبار Click ممنوع حتى الاستجابات والأكواد الرسمية ومعاني المبالغ والمعرفات وإكمال المحول بمهمة مفوضة؛ لا generic بديل ولا Mock كدليل نجاح حقيقي.

لا تعتبر المرحلة الخامسة أو التكامل أو الأجهزة مكتملة. [قائمة القبول النهائية](STAGING_ACCEPTANCE_PLAN.md) تشمل Firebase وClick وFCM والأجهزة والطباعة والاستعادة ومراجعة المالك لاحقاً. لا يوجد اعتماد إنتاج أو تصريح Merge/Deploy من هذا التقرير.
