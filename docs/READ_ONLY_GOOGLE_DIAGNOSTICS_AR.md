# تشخيص Google للقراءة فقط

الأساس: da626b3584ea54510ec49f32de3125ff36639049، على audit/production-readiness.

لا تشغيل bootstrap ولا تغيير Firebase أو IAM أو App Check أو الفوترة ولا نشر. أداة الجرد تستخدم GET فقط لواجهات Google، وقراءة Admin Auth للعضو الموجود وget-iam-policy. تختبر المحاكيات البيانات الاصطناعية محلياً فقط.

## تفسير الأخطاء

يعرض التقرير httpStatus وapiCode وapiStatus عند وجود قيم معروفة، وتصنيفاً تقنياً ثابتاً. تؤخذ أسباب ErrorInfo المعروفة من قائمة نطاقات Google رسمية ثابتة فقط (googleapis.com وواجهات IAM وFirestore وFunctions وService Usage وBilling). لا تُعرض message أو تفاصيل الاستجابة الخام أو metadata أو وصف الحقول أو الروابط أو الرموز. أسماء حقول الطلب لا تعرض إلا من قائمة ثابتة معروفة مثل pageSize وparent، دون قيمها. الأخطاء غير المعروفة تبقى undetermined، ولا تتحول إلى دليل غياب خدمة.

| دليل الاستجابة | النتيجة المسموح بها |
|---|---|
| SERVICE_DISABLED | API معطّل لمستهلك الطلب وفق الاستجابة؛ لا يجري تفعيله |
| IAM_PERMISSION_DENIED | نقص صلاحية IAM وفق الاستجابة |
| ACCESS_TOKEN_SCOPE_INSUFFICIENT | نطاق جلسة OAuth غير كافٍ؛ ليس إثبات نقص IAM |
| INVALID_ARGUMENT، مع BadRequest إن وجد | رفض معامل في الطلب؛ لا اختراع اسم حقل أو قيمة بديلة |
| HTTP 400 أو 403 وحده | السبب الدقيق غير مؤكد |
| BILLING_DISABLED | متطلب فوترة لهذه العملية؛ ليس بديلاً عن قراءة billingInfo |

لم يثبت سبب خطأ الفهارس 400 أو Functions 403 الحي من داخل Codex: لا توجد هنا جلسة Google مخولة. لم يُغيّر مسار أي API بلا دليل. التقرير الجديد يحدد خدمة GET والمسار الثابت وحجم الصفحة للقراءتين، دون pageToken أو URL كامل. يلزم تشغيل أداة الجرد من جلسة Cloud Shell القائمة لاستلام الدليل المنقح. إذا تعذرت billingInfo، تغيب billingEnabled وتبقى الحالة unverified؛ لا يُستنتج Spark أو Blaze أو تفعيل الفوترة.

## القواعد المنشورة

يعرض publishedFileCount وpublishedSha256 للملف الواحد، وتجزئة المصدر المحلي. عند الاختلاف يعرض اسم كل ملف وفهرسه وتجزئة SHA-256 لمحتواه الأصلي ومحتواه اللازم للمقارنة. للملفات المتعددة لا تُخترع تجزئة مكافئة لملف محلي واحد. السطور الشبيهة بالاعتمادات تحجب، ويشار إلى redacted؛ الحجم المعروض محدود إجمالاً بـ256 ألف محرف ويشار إلى truncated. لا تعتبر النسخة المنقحة أو المبتورة مقارنة نصية كاملة. التجزئات دائماً للمحتوى الأصلي قبل التنقيح. لا تعديل للقواعد المنشورة.

## التشغيل

يتطلب Node.js 22 كما في المشروع؛ تتوقف الأداة قبل npm أو استدعاءات Firebase إذا كان Node 24 مستخدماً. لا تغيير لـengines أو إصدار Runtime السحابي.

من نسخة المشروع النظيفة على Cloud Shell وبجلسة gcloud البشرية القائمة وNode 22:

```bash
test "$(git branch --show-current)" = audit/production-readiness && git pull --ff-only origin audit/production-readiness && bash scripts/phase1-readiness/start.sh
```

لا ADC ولا مفاتيح حساب خدمة ولا إعادة تأسيس المدير. رمز خروج 2 يعني وجود عوائق موضحة بالتقرير، ولا يعني فشل كل القراءات. يرجى عدم إرسال أجسام الأخطاء أو بيانات اعتماد؛ التقرير المنقح يكفي للتحليل التالي.

## دليل مخطط الطلب

قُرئت وثيقتا Discovery العامتان الرسميتان لـFirestore v1 وCloud Functions v2، دون هوية أو بيانات المشروع. تؤكدان GET وparent ومسار indexes/functions ومعامل pageSize؛ حد Functions الأقصى الموثق 1000، والأداة تستخدم 100. هذه مراجعة لعقد API العام وليست قراءة موارد velnix-6c1a2 ولا إثبات السبب الحي لـ400/403.

- https://firestore.googleapis.com/$discovery/rest?version=v1
- https://cloudfunctions.googleapis.com/$discovery/rest?version=v2

## التحقق المحلي

نجح scripts/validate.sh على Node 22.23.3: Flutter 323 اختباراً والتحليل والتنسيق، Python 12، PDF/باركود 36 حالة، Node 116، ومحاكيا Auth وFirestore 68 اختباراً على demo-velnix فقط. نجح فحص التراكيب وnpm audit دون ثغرات، وفحص الأسرار بعد إضافة الملفات الجديدة: 384 ملفاً دون نتائج. أعيدت الاختبارات الوحدوية بعد آخر تحسين للتنقيح بنجاح. هذه الأدلة لا تثبت حالة الخدمات الحية. نتائج Push وPR النهائية تُقرأ من GitHub Actions لنفس Commit ولا تستبدل باختبارات Mock.
