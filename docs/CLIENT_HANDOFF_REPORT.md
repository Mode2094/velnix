# تحقق التسليم — 14 أكتوبر 2026

بدأ الفحص من audit/production-readiness عند 024c1a7، والعمل المحلي مطابق للفرع البعيد وحالة Git نظيفة قبل التوثيق. لم تُضف وظائف ولم يتغير التطبيق أو workflow، ولم يحدث Merge أو Deploy.

## PR و CI فعليان

[PR #1](https://github.com/Mode2094/velnix/pull/1) مسودة إلى main من audit/production-readiness. صفحة PR تعرض 12commit: الخمسة السابقة والسبعة 533b114،18954a7،e797b8c،cf6a3c2،bd0b0ca،382ad34،024c1a7.

| التشغيل على 024c1a7 | الحدث | حالة GitHub | flutter | firebase | android |
|---|---|---|---|---|---|
| [38552423961](https://github.com/Mode2094/velnix/actions/runs/38552423961) | push | Success،6m2s | ناجح | ناجح | ناجح |
| [38552429622](https://github.com/Mode2094/velnix/actions/runs/38552429622) | PR | Success،5m32s | ناجح | ناجح | ناجح |

artifact باسم flutter-qa-artifacts بحجم 8.98MB متاح بصفحة التشغيل. حالة التشغيل/الوظائف والـ artifact تأكدت عبر HTML على GitHub، وليست استنتاجاً من الفحص المحلي. Raw step logs المصادقة لم تُنزّل. workflow نفسه يشغل التنسيق/analyze/Flutter tests/فحص الأسرار/قراءة barcode/صور browser/WebDemo+Live، و Node syntax+audit+tests+Emulator، و AndroidDebugDemo+Live. لا continue-on-error أو skip لتمرير اختبارات حقيقية؛ if:always خاص برفع الأدلة.

أعداد الحالات 271Flutter/45Node/36Emulator/36 قراءة barcode موثقة من تشغيل محلي نظيف سابق على المصدر نفسه. يوجد 11 فحصاً نصياً ضمن Node، وأربع قراءات barcode احتاجت معالجة صورة؛ لا تُقدّم كدليل جهاز/تكامل منشور.

فحوص التسليم الإضافية محلياً: secret scanner267 ملفاً بلا findings، syntax ناجح،45Node بلا فشل،npm audit للإنتاج صفر vulnerabilities،format/analyze بلا مشاكل. لم نكرر كل build لأن المصدر والـ workflow لم يتغيرا و CI على SHA المحدد ناجح. لا خلل برمجي مثبت يستدعي تعديل كود.

## السبب الدقيق لـ Forbidden وما يفعله المالك

الطلب المجهول إلى api.github.com و repos/... يفشل بـ`Tunnel connection failed: 403 Forbidden`. الفشل أثناء CONNECT في proxy قبل وصول HTTP إلى GitHub؛ في المقابل github.com/PR يعيد 200، و Gitread/push سبق نجاحهما. قائمةشبكةالبيئة restricted وفيها github.com عبر preset لكنها لا تشمل api.github.com.

هذا **خلل إعداد وصول الشبكة وليس خللاً في Velnix**. لا دليل حالياً على نقص صلاحية GitHub أو invalid token؛ gh auth status السابق لا يصلح للحكم حين يُحجب الاتصال. GH_TOKEN موجود، وقد يكون binding/proxy placeholder، ولم تقرأ أو تعرض قيمته.

حفظت api.github.com إضافةً إلى allowlist الموجودة دون حذف النطاقات أو توسيعها بـ wildcard. الحفظ مسودة فقط: راجع إعدادات البيئة، احفظ إضافةالنطاق ثم Publish بيئةالتطوير لتفعيلها، وبعدها يعاد فحص gh/API. لا علاقة لهذا بنشر التطبيق أو الإنتاج.

بعد إزالةحجب CONNECT فقط: إذا رد GitHub بـ 401 يلزم تجديد/إعادةربط اعتماد GitHub عبر إعدادات المنصة؛ إذا رد 403 من GitHub نفسه فتراجع صلاحياتالمستودع و SSO/GitHubApp. للقراءة يلزم Contents:read و PullRequests:read و Actions:read، ولتحديث وصف PR يلزم PullRequests:write. لا نطلب PAT أو أسراراً فيالمحادثة قبل هذا التشخيص الثاني.

## تصحيحات التسليم

صححت وصف CI غيرالمتحقق في TEST_RESULTS وأضفت دليل JSON وحالةالتسليم الحالية وخطة Staging. صححت وصف polling إلى 100 شحنة، لا 100 شركة. العملمحفوظ على GitHub؛ عبارة local-only فيالمتطلبات القديمة حُدّثت. لم يتغير الكود أو يتجاوز أي check.

وصف PR الحالي ما زال يذكرأعدادالمراجعةالقديمة 264/44/27؛ تحديثه عبر API محجوب. يوجد نصمراجَع أدناه يستطيع المالك نسخه أو يمكننا تطبيقه بعد تفعيلالوصول، دون تغييرحالة PR أودمجه.

## نص موجز محدث لوصف PR

يحسن هذا PR صحةالطلب والصلاحيات ونطاقالفرق والعدادات، وإكمالالطلبالداخلي، واستعادة push المحدودة، وصفحاتالإدارة، وواجهة RTL وخط Cairo والطباعة وقراءة Code128. يحتفظ بالوثائق والأدلة و CI دوننشر.

التحقق المحلي النظيف:271Flutter و 45Node و 36Auth/FirestoreEmulator بلافشل، و 36 حالةقراءة PDF/Barcode (4 بمعالجةصورة)، و 30 لقطة demo. CI على 024c1a7 نجح في push و PR، ووظائف flutter/firebase/android و buildsDemo/Live ناجحة. بناء Live ليسدخول Firebase فعلياً. اختبار FCM/OAuth/AppCheck/KMS/carrier والأجهزةوالطابعة/الماسحوالأداءوالاستعادةعلى Staging باقٍ. غيرمعتمدللإنتاج؛لا Merge ولا Deploy فيهذاالعمل.

## قبل الربط الحقيقي

اتبع[STAGING_ACCEPTANCE_PLAN](STAGING_ACCEPTANCE_PLAN.md): مشروع وتجهيزمنصاتتجريبي،ميزانية/IAM/KMS،host/docs وعقدشركةواحدة وحساب sandbox،أسرارآمنة،فهارسجاهزة،Auth/AppCheck/FCM،حساباتكلالأدوار وأجهزةوطابعة. generic_v1 مرجعفقط؛توافقعقدالشركةيجبإثباته أولاً. لا اتصال Staging أوشركةفعلياًفيجلسةالتسليم الحالية، ولا مفاتيح إنتاج.
