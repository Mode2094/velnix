# Velnix — Smart Order Management v0.7

**حزمة كود ومراجعة هندسية غير معتمدة للإطلاق التجاري.** Flutter + Firebase Functions + سياسات وصول + فواتير PDF/باركود.

## ما الجديد

- شاشة طباعة فاتورة/سند طلب عربية مع Code128 ثابت وإعادة الطباعة وPDF ومقاسات ورق متعددة، في الوضعين التجريبي والحي.
- اعتماد استعلام جديد قبل طباعة بيانات حيّة، وإخفاء المبالغ حسب صلاحية المستخدم في الخادم.
- تسجيل Google Sign-In مبدئياً دون منح صلاحيات تلقائياً، وإصلاح تفعيل شركات التوصيل.
- حماية إنشاء الطلبات من إعادة الإرسال بذات requestKey في Firestore transaction.
- إصلاح البحث عبر الباركود وإدخال الأرقام العربية، واستخدام Firestore Aggregation للأعداد المالية والحالات بدل حد 1,000.
- توسعت اختبارات خادم Node.js إلى 30 حالة ناجحة (تشمل اختبارات بنية كود، وليست Firebase Emulator).

## الملفات المرجعية

- `docs/23_FINAL_QA_AND_LIMITATIONS_AR.md` — قائمة الشاشات وما ثبت وما لم يثبت، ومانعات P0.
- `docs/24_PRINTING_AND_AUTH_SETUP_AR.md` — طريقة الطباعة وإعداد Google.
- `docs/25_OPEN_CODE_EXECUTION_GATE_AR.md` — بروموت قبول هندسي عملي في Open Code.
- `docs/26_UI_ACTION_INVENTORY_AR.md` — جرد استاتيكي لمواضع الأزرار والتفاعلات.

## أوامر الفحص

```bash
flutter create --platforms=android,ios,web,windows,macos,linux .
flutter pub get
flutter analyze
flutter test
npm --prefix functions install
npm --prefix functions run syntax
npm --prefix functions test
```

لا تنفّذ إنشاء ملفات المنصات فوق أي تخصيص موجود دون نسخة احتياطية. `flutterfire configure` وإعداد Google/App Check/KMS/الشركة يجب تنفيذهما قبل التشغيل الحقيقي. Flutter SDK وFirebase Emulator **غير متوفرين في بيئة إعداد هذه الحزمة**، لذا لم يتم الاختبار الحقيقي على الأجهزة.

## النطاق

نظام الطلبات والصلاحيات الخمس وتكامل شركة توصيل واحدة (بعد اعتماد وثائق مزودها) والطباعة. متجر إلكتروني/إدارة المخزون خارج المرحلة الأولى. نشر التطبيق على Google Play / App Store ورسوم وحسابات المتاجر خارج النطاق التعاقدي.
