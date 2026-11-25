# إعادة تصميم شريط الفلاتر في صفحة الطلبات (Compact ERP) — ويب فقط

**النطاق:** واجهة الويب فقط (`lib/live/live_orders_web.dart` مع خيار `dense` إضافي في
`lib/live/date_range_field.dart`). لم يُلمس Android ولا Firebase Backend ولا أي منطق
بحث أو فلترة أو صلاحيات.

## المشكلة
كانت الفلاتر موزّعة على أربعة صفوف مرتفعة (حقول 48px، والحقل بعرض 158px، وبحث في صف
كامل، والتاريخان في صف مستقل، وزر «مسح الفلاتر» داخل الشبكة)، فكان أول صف في الجدول
يبدأ عند ~617px على شاشة 1600px.

## الحل
- شريط علوي (Top bar) بصف واحد مدمج بدل صفّين.
- صف أدوات واحد: **البحث الشامل** + **مسح الفلاتر** + **تحديث**.
- شبكة فلاتر مُحكمة (Wrap + LayoutBuilder): تختار أكبر عدد أعمدة تبقى خلاياه ≥ `_minCellW`
  ثم تمدّ الخلايا لتملأ الصف، فتصبح الصفوف **2–3 مضغوطة** حسب العرض دون فراغات متبقية، وبدون
  زر «المزيد من الفلاتر» ودون إخفاء أي فلتر.
- حقول كثيفة: ارتفاع 40px، خط تسمية 12.5px، حشوة داخلية مضغوطة.
- فلاتر التاريخ «الفترة الزمنية» و«تاريخ الإرسال» متجاورتان كمجموعة خليّتين، والتقويم يفتح
  عند الضغط كما في Android (`VDateRangeField(dense: true)`؛ القيمة الافتراضية `false` تبقي
  Android كما هو).
- شريط العمليات الجماعية مضغوط (كثافة `VisualDensity.compact`) وثابت أسفل الفلاتر.
- حافظنا على رأس الجدول وشريط العمليات ثابتين، وعلى ترتيب الأعمدة وبيانات الطلبات، وعلى
  القيم المحددة أثناء التحديث.

## قياس قبل/بعد (أول صف بيانات — vertical offset)
| العرض | قبل | بعد | التوفير |
|---|---|---|---|
| 1600px | 617px | 391px | 226px (37%) |
| 1440px | 617px | 437px | 180px (29%) |
| 1280px | 673px | 483px | 190px (28%) |
| 1152px | 673px | 483px | 190px (28%) |
| 1024px | 729px | 485px | 244px (33%) |
| 900px | 787px | 531px | 256px (33%) |
| 834px | 787px | 531px | 256px (33%) |

عدد الصفوف: **صفان** عند ≥1440px، **ثلاثة** عند العرض الأضيق. جميع الفلاتر (17 فلترًا +
فلترا التاريخ + البحث + مسح الفلاتر + تحديث) ظاهرة دائمًا.

لقطات القياس: `build/qa/orders-layout/{before,after}/` والمقارنات الجانبية:
`build/qa/orders-layout/compare-*.png` (غير متتبَّعة).

## التحقق
- `dart format --set-exit-if-changed lib test` ✅ — `flutter analyze` ✅.
- `flutter test`: لا انحدار؛ 25 فشلًا صوريًا (golden) موجود مسبقًا على الشجرة النظيفة أيضًا
  (فرق rasterization للخطوط على macOS) و`_WebOrdersView` لا يُبنى أصلًا عندما `!kIsWeb`.
- المعاينة المعزولة (emulator + synthetic roles): `browser.cjs` ✅، `join-approval.cjs` ✅،
  `readback.cjs` ✅، `realtime-sync.cjs` ✅ (فلترة «الحالة الداخلية» تقوم بـ dropdown compact).
- سكربت القياس: `scripts/emulator-preview/orders-layout.cjs`.

## النشر
`flutter build web --release --no-web-resources-cdn --no-wasm-dry-run
--dart-define-from-file=config/firebase.stage3.production.public.json`
ثم `scripts/maintenance.sh off` (يعيد بناء `build/web` ويستعيد `.well-known/assetlinks.json`
وينشر `--only hosting` بالإعداد `firebase.hosting.json`).
