# Velnix

Flutter + Firebase لإدارة الطلبات باللغة العربية. تغييرات التدقيق على `audit/production-readiness`؛ التطبيق غير معتمد للإنتاج، ولم ينشر على أي مشروع حقيقي.

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
