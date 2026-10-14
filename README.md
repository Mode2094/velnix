# Velnix

تهيئة المشروع الحالي على Android/iOS/Web: [FIREBASE_CURRENT_PROJECT_SETUP_AR](docs/FIREBASE_CURRENT_PROJECT_SETUP_AR.md). ملفات SDK وdart-defines محلية مستثناة؛ لا ينشئ التجهيز تسجيلات أو ينشر خدمات. المشروع الواحد الحالي للتجربة والتسليم لا يوفّر عزلاً للبيانات.

Flutter + Firebase لإدارة الطلبات باللغة العربية. تغييرات التدقيق على `audit/production-readiness`؛ التطبيق غير معتمد للإنتاج، ولم ينشر على أي مشروع حقيقي.

المرجع الحالي: [التسليم الآمن — المرحلة الرابعة](docs/SAFE_HANDOFF_STAGE4_REPORT_AR.md)، [الإعدادات وتسليم المصدر](docs/SAFE_CONFIGURATION_HANDOFF_AR.md)، [الاستعادة والتراجع](docs/BACKUP_RESTORE_ROLLBACK_AR.md)، [قبول المرحلة الخامسة](docs/STAGING_ACCEPTANCE_PLAN.md). إعداد Live يستعمل VELNIX_ENVIRONMENT صراحة وملفاً عاماً لكل منصة مع preflight offline؛ Demo release development للـQA فقط. Click محجوب حتى اكتمال عقد الاستجابة، وgeneric_v1 ليس توافقاً مع الشركة. لا موارد أو Merge/Deploy.

تم إصلاح نطاق الفرق بعد نقل الأعضاء، معاملات الطلب ومراجعاته، العدادات والبحث والفلاتر، الأدوار والإشعارات الدائمة، واجهات RTL وطباعة PDF بخط محلي. أضيفت إعدادات مؤسسة محفوظة وملفات Android/iOS/Web وCI.

استخدم Flutter 3.47.7 وNode 22.23.3 وJava 21. في البيئة الحالية:

```bash
source scripts/cloud-env.sh
scripts/validate.sh
flutter build web --no-web-resources-cdn --no-wasm-dry-run --dart-define=VELNIX_MODE=demo
flutter build apk --debug --dart-define=VELNIX_MODE=demo
```

المحاكيات `demo-velnix` محلية؛ الاختبارات تمسح بياناتها. لا تشغلها على خدمات فعلية. الوضع الافتراضي live يتطلب إعداد Firebase؛ demo صريح لا يمثل تشغيل الإنتاج. لا تستخدم flutter create فوق تخصيصات المنصات.

راجع [نتائج الاختبارات](docs/TEST_RESULTS.md)، [تقرير التدقيق](docs/AUDIT_REPORT.md)، [المعمارية](docs/ARCHITECTURE.md)، [الصلاحيات](docs/ROLE_PERMISSION_MATRIX.md)، [إعداد Firebase](docs/FIREBASE_SETUP.md)، [جاهزية الإنتاج](docs/PRODUCTION_READINESS.md) و[المتطلبات الخارجية](docs/REMAINING_EXTERNAL_REQUIREMENTS.md). التقارير المرقمة القديمة تاريخية وتسبق التحقق الحالي.

المراجعة النهائية أضافت إكمالاً داخلياً موثقاً، retry محدوداً للدفع على الجدول الحالي، وصفحات بحث للإدارة، وباركود منفصل النص مع قراءة صور متعددة الدقات، وإصلاح خط جميع عناصر التحكم. QA Python يحتاج Poppler والمكتبات المثبتة في scripts/qa-requirements.txt. الصور والأدلة النهائية في docs/evidence، ونموذج الأداء والتكلفة في docs/PERFORMANCE_AND_COST.md. بناء Live المحلي يفحص compile فقط.
