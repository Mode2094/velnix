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
- `flutter test` في CI: أخفق في الدفعة الأولى **بسبب خطأ حقيقي** أُصلح لاحقًا (انظر أدناه).
- `_WebOrdersView` لا يُبنى أصلًا عندما `!kIsWeb` (البوابة في `live_orders.dart`:
  `if (kIsWeb) return buildWebOrders(context);`)، فإعادة تصميم الويب لا تظهر في أي golden.

### فخّ `DropdownButtonFormField.isDense` (إصلاح لاحق)
أضفنا في البداية `isDense: widget.dense` إلى `DropdownButtonFormField` داخل
`VDateRangeField`. لكن `DropdownButtonFormField` يملك قيمة افتراضية **محلية** هي
`isDense = true` ويفرضها على الـ`decoration`، فكل مواضع الاستدعاء القديمة كانت مضغوطة
أصلًا. تمرير `false` لها (عند `dense = false`) ألغى الضغط بصمت في شريط فلاتر Android
المشترك (`order_filters.dart`) ولوحة المعلومات (`live_dashboard.dart`) وشاشة العمليات،
وأزاح **20 golden** بنسبة 9–42%.

الإصلاح: عدم تمرير `isDense` إطلاقًا، وإبقاء `labelStyle`/`contentPadding` المضغوطة فقط
عند `dense == true`. تحقق بالإصلاح: ملفات golden التالية **مطابقة بايت ببايت** لخط
الأساس `6beadd4` عندما تكون القيمة `false`:
`delivery_quality/*-dashboard-*`, `final_audit/filter_chips_*`,
`final_audit/orders_multi_select_900`, `live_dashboard_390`.
- المعاينة المعزولة (emulator + synthetic roles): `browser.cjs` ✅، `join-approval.cjs` ✅،
  `readback.cjs` ✅، `realtime-sync.cjs` ✅ (فلترة «الحالة الداخلية» تقوم بـ dropdown compact).
- سكربت القياس: `scripts/emulator-preview/orders-layout.cjs`.

## النشر
`flutter build web --release --no-web-resources-cdn --no-wasm-dry-run
--dart-define-from-file=config/firebase.stage3.production.public.json`
ثم `scripts/maintenance.sh off` (ينشر `build/web` كما هو مع `.well-known/assetlinks.json`
وبالإعداد `firebase.hosting.json`، `--only hosting`).

المنشور الحيّ بعد الإصلاح: `main.dart.js` = 5,112,160 بايت،
SHA-256 `1581c712ddaef3158ab528b7220bbe441e09c4c05874efe351cb0308a0656ad4`
(تحقّق عبر طلب متجاوز للكاش؛ الطلب العادي قد يرجع نسخة CDN قديمة حتى `max-age=3600`).
