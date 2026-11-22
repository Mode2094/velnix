# VELNIX — التقرير النهائي المُسلَّم للعميل (متطلبات 1–6)

- **المشروع:** `Mode2094/velnix` (عام) · **Firebase:** `velnix-6c1a2`
- **الإصدار النهائي:** `0.7.0+12` (versionName `0.7.0` · versionCode `12`)
- **applicationId:** `com.mode2094.velnix`
- **الفرع:** `main` · **وسم الإصدار (tag):** `v0.7.0+12`
- **commit الإصدار المُوقَّع:** `583ea9764f8d5a58fbf908b511dcda7d4b90005c` (هو الـcommit الذي بُني منه الـAPK/الـAAB والموقَّع، وCI أخضر عليه)
- **التاريخ:** 2026-11-22
- **مبدأ التقرير:** لا يُقبل «وجود الكود» ولا نجاح CI دليلًا؛ كل بند أدناه له **ملف+سطر** و**اختبار يثبت السلوك** و**دليل من واجهة التطبيق المُشغَّل فعليًا**.

---

## جدول المتطلبات (الحالة / الدليل البرمجي / الاختبار / دليل الـAPK الحقيقي / الإصلاح)

| # | المتطلب | الحالة | الدليل البرمجي (ملف:سطر) | الاختبار المُثبِت | دليل من APK مُشغَّل | الإصلاح المُطبَّق |
|---|---|---|---|---|---|---|
| 1 | الإرسال لشركة التوصيل من **كل** الحالات الداخلية الست، فرديًا **وجماعيًا** | **FAIL → أُصلح → PASS** | `functions/src/index.js:951,1036-1041` · `functions/src/order_view.js:26,31` · `lib/live/live_orders.dart` (زر الإرسال الفردي + `_dispatchOrder`) · `lib/live/live_barcode.dart:414` · `functions/src/bulk.js:181` | `test/order_details_usability_test.dart` («طلب جديد يعرض الإرسال الفردي») · `functions/test/emulator/dispatch_any_status.test.js` · `dispatch_contract.test.js` · `click_concurrent_dispatch.test.js` · `bulk_internal_status.test.js` | لقطة تفاصيل طلب داخلية تُظهر زر «إرسال إلى شركة التوصيل» من حالة غير «جاهز» (`build/qa/android-evidence/14_order_detail_send.png`) | **أُضيف إرسال فردي من أي حالة** على بطاقة الطلب؛ وصُحّح نص ماسح الباركود «للطلبات الجاهزة فقط» |
| 2 | دلالات القوائم والعدّادات: `جميع طلبات المتجر` = داخلي+توصيل، والقبول هو `deliveryAccepted` وحده | **PASS** | `functions/src/query.js:19-30,131-132` · `functions/src/index.js:497-508` · `lib/live/live_dashboard.dart:244-258` | `functions/test/emulator/counters_100_20.test.js` (جديد: 100 = 80 + 20) · `aggregations.test.js` · `test/order_filters_phase3_test.dart` | الداشبورد بالبطاقات الثلاثة (`.../11_dashboard.png`)، قائمة الطلبات (`.../12_all_orders.png`) | أُضيف اختبار انحدار 100/20 |
| 3 | تغيير الحالة (1 أو عدة طلبات) لقائمة الست حالات + خيار طباعة **غير مفعّل افتراضيًا** | **PASS** | `lib/live/live_orders.dart:846-874,1491-1600` · `lib/models/entities.dart:113-124` · `functions/src/policy.js:140-176` | `test/phase2_orders_bulk_test.dart` · `functions/test/emulator/bulk_internal_status.test.js` | نافذة تغيير الحالة الجماعي بالقائمة السداسية + مربّع الطباعة (`.../16_bulk_status_dialog.png`, `.../17_bulk_status_dropdown.png`) | لا خلل — السلوك مطابق |
| 4 | البوليصة: باركود فوق رقم الطلب بلا نص تحته، بلا QR، هوية الصفحة، صفحة واحدة لكل طلب، اتجاه | **PASS** | `lib/printing/order_printing.dart:12,28,308-335,337-400,427-432,517-560` | `test/printing/order_printing_test.dart` · `order_printing_phase3_test.dart` · `scripts/verify_barcodes.py` (**51/51** فك رموز حقيقي) | معاينة البوليصة (`.../21_print_screen.png`, `.../22_print_preview.png`) | لا خلل — السلوك مطابق |
| 5 | إثبات عمل الـAPK الموقّع (ترقية، توقيع، تشغيل، إصلاح داخلي) | **PASS** | — (تحقق تشغيلي) | ترقية 11→12 على Android 14 + `apksigner verify` + فحص محتوى `libapp.so` | `.../10_release12_launch.png` | بُني إصدار موقّع `0.7.0+12` |
| 6 | الموقع (Hosting) والـBackend | **FAIL → أُصلح** | `firebase.hosting.json` · `functions/src/index.js:484` | Hosting releases API · `curl` بصمة `main.dart.js` | (الموقع) | **نُشر البناء الحالي** (كان الموقع يخدم بناء 2026-11-02) |

> التفصيل الكامل بالأدلة في `docs/VELNIX_CLIENT_REQUIREMENTS_AUDIT_AR.md`.

---

## القائمة النهائية المطلوبة (١٢ بندًا)

1. **commit الإصدار النهائي (tag `v0.7.0+12`):** `583ea9764f8d5a58fbf908b511dcda7d4b90005c` على `main`
   («fix(dispatch): individual send from any internal status + audit release 0.7.0+12»).
   - يليه commit توثيقي على `main` يضيف هذا التقرير وتدقيق الأرقام (لا تغيير في الكود أو الملفات الموقّعة).
2. **الإصدار المُثبَّت والمُختبَر:** `0.7.0+12` (versionCode 12).
   - مُثبَّت كترقية على محاكي Android 14 **فوق** `0.7.0+11` ⇒ `Success`، والحزمة تُقرأ `versionCode=12` مع بقاء `firstInstallTime` (لا فقدان بيانات).
   - `apksigner verify -v` ⇒ **Verifies** (APK Signature Scheme v2)، الموقّع `CN=Velnix, OU=Delivery, O=Velnix, L=Amman, C=JO`، بصمة الشهادة `6e57f935…1601` (نفس مفتاح الإصدار).
   - **دليل داخلي:** `lib/arm64-v8a/libapp.so` في الـAPK المُسلَّم يحتوي `إرسال إلى شركة التوصيل` و**لا** يحتوي `للطلبات الجاهزة فقط`.
3. **نتائج CI:** تشغيل `Validate Velnix` على `main` لنفس الـcommit — راجع القسم أدناه (flutter / firebase / android / emulator-ui).
4. **نتيجة Firebase الحقيقية:** تسجيل دخول فعلي (Identity Toolkit + App Check) ثم نداء الدوال الأساسية `me`, `getSettings`, `listCompanies`, `listMembers`, `listOrders`, `listNotices`, `listAudit`, `listAllowedPages`, `dashboardStats` (كل الأنواع)، `companyStats` ⇒ كلها **200** (بعد نشر 44 فهرسًا مركّبًا أصلح خطأ 500 في الداشبورد).
5. **روابط الـAPK والـAAB:** GitHub Release `v0.7.0+12`
   - APK: `https://github.com/Mode2094/velnix/releases/download/v0.7.0%2B12/Velnix-0.7.0+12-release.apk`
   - AAB: `https://github.com/Mode2094/velnix/releases/download/v0.7.0%2B12/Velnix-0.7.0+12-release.aab`
6. **رابط حزمة التسليم:** `release/VELNIX_FINAL_CLIENT_HANDOVER.zip` + نسخة على `gs://velnix-6c1a2-handover/` (المستودع عام ⇒ الـAPK/AAB فقط في GitHub؛ الحزمة التي تحتوي المصدر تُسلَّم عبر قناة خاصة).
7. **صور/تسجيلات دليل الميزات (من APK مُشغَّل):** `build/qa/android-evidence/`:
   `10_release12_launch.png` · `11_dashboard.png` · `12_all_orders.png` · `13_new_orders.png` · `14_order_detail_send.png` (زر الإرسال الفردي) · `15_selection_mode.png` · `15b_selection_actions.png` · `16_bulk_status_dialog.png` · `17_bulk_status_dropdown.png` (القائمة السداسية) · `18_bulk_status_selected.png` · `19_after_cancel.png` · `21_print_screen.png` · `22_print_preview.png` (البوليصة).
8. **سبب شكوى العميل:** **الموقع الحيّ كان يقدّم بناءً قديمًا**. كان آخر نشر Hosting بتاريخ **2026-11-02T16:12:02Z**، أي **قبل** commits المتطلبات (2026-11-07/08). فأي استخدام للنسخة الويب أظهر سلوك ما قبل المتطلبات. **أُصلح** بإعادة نشر البناء الحالي (إصدار Hosting `2026-11-22T20:02:30Z` / `versions/359203553d62ec95`)، وبصمة `main.dart.js` الحيّة أصبحت مطابقة للبناء المحلي: `82d01bd6b3cd22f04013f85917062e7413914b812e1301347fa61fefe6df63e6`.
   - **عوامل مساهمة:** (أ) عيب واجهة في المتطلب 1 (الإرسال الفردي لم يكن ظاهرًا خارج رحلة «جاهز») — أُصلح. (ب) نص مضلّل في ماسح الباركود «للطلبات الجاهزة فقط» — أُصلح.
   - **مُستبعَد:** العيب ليس في الفوترة ولا في حساب Google ولا في الفهارس (الفهارس أُصلحت لخطأ 500 منفصل في الداشبورد الإداري).
9. **بنود لم تُختبر (قيود صريحة):**
   - **شحنة Click حقيقية:** لم تُجرَّب شحنة فعلية (ممنوع إرسال شحنات حقيقية في هذه الجولة). دورة الإرسال مغطّاة باختبارات emulator بعقد محلي فقط.
   - **طباعة ورقية فعلية:** فُكّت الرموز برمجيًا من PDF؛ لم تُطبع على طابعة ورقية.
   - **جهاز Android حقيقي:** الاستخدام على جهاز حقيقي (لا محاكي) لم يُنفَّذ.
   - **App Check على المحاكي:** نسخة الإنتاج تعتمد reCAPTCHA Enterprise ولا تُصدر attestation على المحاكي (`403 App attestation failed`)؛ لذلك التُقطت واجهة المحاكي ببناء `--profile` بمزوّد App Check التشخيصي. الإصدار المُسلَّم يبقى على مسار الإنتاج.
10. **ملفات الإصدار:** APK `Velnix-0.7.0+12-release.apk` (81,050,068 بايت، `3d1a2a1d…f6750`) · AAB `Velnix-0.7.0+12-release.aab` (73,685,466 بايت، `3e12281b…0768`).
11. **تنظيف/temp:** حساب إدارة مؤقت `web.admin@velnix.test` (دور generalManager) أُنشئ لاختبار الويب الحيّ ويجب حذفه/استبداله بعد التسليم؛ رمز App Check التشخيصي (`Debug Token`) يجب حذفه من Firebase Console بعد انتهاء الاختبار.
12. **ما لم يُغيَّر (حماية):** مشروع Firebase والفوترة والملكية، الأسرار، مفاتيح التوقيع، الطلبات الحقيقية، خطط Google Play — كلها لم تُلمَس. لا تغيير على بيانات الطلبات الحقيقية أثناء الاختبار (5 طلبات = 3 داخلية + 2 توصيل، تحقّقت مطابقتها قبل/بعد).

---

## تشغيل CI

- سير العمل: `Validate Velnix` على `main` للـcommit `583ea9764f8d5a58fbf908b511dcda7d4b90005c`.
- النتيجة: **success** — جميع المهام الأربع ناجحة:
  - `flutter`: **success** (format + analyze + `flutter test` + فك باركود + بناء web demo/live + Playwright).
  - `firebase`: **success** (`npm test` 211 + `npm run test:emulator` 307 بما فيها اختبار 100/20).
  - `android`: **success** (بناء APK demo/live).
  - `emulator-ui`: **success** (تشغيل 5 أدوار مقابل Backend محلي).
- رابط التشغيل: `https://github.com/Mode2094/velnix/actions/runs/45068452410`.

### أرقام الاختبارات محليًا (للسجل)

| البوابة | النتيجة |
|---|---|
| `dart format --set-exit-if-changed` | نظيف (0 تغيير) |
| `flutter analyze` | 0 ملاحظات |
| `flutter test` | **497 ناجح / 25 فروقات Golden** (المجموع 522) |
| اختبارات غير Golden | **466 / 466 ناجحة** |
| `verify_barcodes.py` | **51 / 51** |
| `check_secrets.py` | 0 نتائج |

> فروقات Golden الـ25 كلها في 4 ملفات مرجعية بصرية، ومصدرها أن ملفات المرجع مولّدة على
> **Linux** بينما التنفيذ المحلي على **macOS** (اختلاف تنقيط الخطوط)؛ CI على Linux يمرّ بها.

---

## بصمات مفتاحية

| العنصر | SHA-256 |
|---|---|
| `Velnix-0.7.0+12-release.apk` | `3d1a2a1de6bfe2794d670cb8a3a06003393984a14aeaa57b3f743c82a86f6750` |
| `Velnix-0.7.0+12-release.aab` | `3e12281b6ec23ac45ad230e845cefac2e55389664b9031caec9e6121329a0768` |
| `main.dart.js` (البناء الحيّ) | `82d01bd6b3cd22f04013f85917062e7413914b812e1301347fa61fefe6df63e6` |
| شهادة التوقيع | `6e57f935d4c7417029452b2d48b2d07520e8945d2ec51c54b77bb03dfde21601` |
