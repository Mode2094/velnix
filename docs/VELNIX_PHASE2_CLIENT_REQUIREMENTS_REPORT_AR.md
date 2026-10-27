# VELNIX — المرحلة الثانية: البحث المتقدم + الفلاتر الذكية + ماسح الباركود + التحديد المتعدد + العمليات الجماعية

- الفرع: `main`
- آخر Commit معتمد للبداية: `a635f07`
- Commit التسليم: `9e21fe5`
- CI: `40599923357` — 4/4 jobs خضراء
- المشروع: `velnix-6c1a2` · الويب: https://velnix-6c1a2.web.app

> كل نتيجة PASS قابلة للإثبات من الكود والاختبارات والنشر. لم تُبدأ المرحلة الثالثة ولم تُضف إدخال صوتي، ولم يتغيّر تبويب «المتاجر».

---

## 1. جدول التنفيذ

| المطلب | النتيجة | دليل التنفيذ |
|---|---|---|
| البحث الشامل | PASS | `functions/src/search.js` + `searchOrders` (searchText/searchTokens + exact lookups)؛ 20 سيناريو في `phase2_search_bulk.test.js` |
| البحث الجزئي | PASS | prefix على `searchText`/`customerKey`/`phoneDigits`؛ اختبار «partial name/phone» |
| البحث برقم الطلب | PASS | `orderNumber ==` |
| البحث بباركود Velnix | PASS | `barcodeValue ==` + بحث `VNX-<id>` |
| البحث برقم بوليصة Click | PASS | `clickOrderRef ==` / `trackingNumber ==` |
| الفلاتر المتقدمة | PASS | `order_filters.dart`: صفحة/نوع/محافظة/منطقة/إرسال/مبلغ |
| الفلاتر المركبة | PASS | اختبار «advanced filters combine» |
| فلتر صفحة Facebook | PASS | `pageId` في `parseFilters`/`matchingFilters` + عمود فهرس |
| صلاحيات البحث | PASS | `canSeeOrder` + `matchingFilters` + post-filter صارم؛ اختبار «never leaks another user orders» |
| Pagination | PASS | `listOrders` نافذة over-fetch + `nextAfterId`؛ اختبار «paginates» |
| الضغط المطوّل | PASS | `onLongPress` يدخل وضع التحديد |
| التحديد المتعدد | PASS | `Set<String> selected` + Checkbox على الويب؛ اختبار widget |
| تحديد الكل | PASS | «تحديد الظاهر» ≠ «تحديد كل النتائج» (bounded ≤500) |
| إلغاء التحديد | PASS | زر + زر الرجوع يخرج من الوضع |
| تغيير الحالات جماعيًا | PASS | `bulkChangeStatus` عبر `applyStatusChange` نفسه؛ نتيجة لكل طلب |
| إسناد شركة جماعيًا | PASS | `bulkAssignCompany`؛ لا إرسال تلقائي |
| إرسال جماعي آمن | PASS | `bulkDispatch` يستدعي `dispatchOrder` نفسه (قفل/needs_review/بلا إرسال مكرر) |
| الطباعة الجماعية | PASS | `OrderInvoicePdf.generateMany` + `BulkPrintScreen`؛ اختبار PDF |
| ماسح الباركود | PASS | `mobile_scanner` (Code128/QR، كاميرا خلفية، إدخال يدوي) |
| قائمة 20 باركود | PASS | maxCodes=20 + de-dup؛ اختبار «rejects >20» |
| منع الباركود المكرر | PASS | de-dup محلي + `duplicate` خادمي |
| عرض نتائج المسح | PASS | `BarcodeResultsScreen` (مطابقة/غير موجودة/مكررة) |
| تحسين بطاقة الطلب | PASS | نوع/صفحة/هاتف/مؤشر مراجعة/نسخ؛ goldens محدثة |
| زر رجوع Android | PASS | `PopScope` يخرج من التحديد أولًا |
| Pull-to-Refresh | PASS | `RefreshIndicator` يُبقي البحث والفلاتر ويُسقط التحديد غير المرئي |
| حماية Click | PASS | `bulkDispatch`/`dispatchOrder`؛ 192 اختبار emulator |
| حماية صفحات Facebook | PASS | لا تغيير على منطق Phase 1 |
| Firestore Indexes | PASS | 11 فهرس جديد (109→120) منشورة |
| Backfill إن لزم | PASS | `backfill_search_keys.js` (dry-run/apply/idempotent مُثبت) |
| Flutter Tests | PASS | 461 |
| Firebase Tests | PASS | 194 unit + 192 emulator |
| Chrome E2E | PASS | 21/21 Playwright |
| Android Tests | BLOCKED | لا جهاز فعلي (كاميرا/مسح) |
| CI | PASS | `40599923357` |
| Production Deploy | PASS | Functions + Indexes + Hosting + APK |

---

## 2. البحث الشامل (الجزء الأول)

- **حقول مشتقة**: `searchText` (نص مُطبّع) و`searchTokens` (رموز + أرقام + مراجع) تُبنى في `functions/src/search.js` وتُكتب عند الإنشاء/التعديل.
- **تطبيع عربي**: توحيد أ/إ/آ/ٱ→ا، ى→ي، ة→ه، إزالة التشكيل، توحيد الأرقام العربية/الإنجليزية، تجاهل الشرطات والمسافات في الهاتف، lowercase للمراجع اللاتينية.
- **مسارات الاستعلام**: `orderNumber==` / `barcodeValue==` / `clickOrderRef==` / `trackingNumber==` / `phoneDigits` (exact + prefix) / `customerKey` prefix / `searchText` prefix / `searchTokens array-contains`.
- **post-filter صارم**: يجب أن يطابق **كل** رمز في الاستعلام ترتيبًا منطقيًا (prefix لكل رمز أو prefix للنص المُطبّع)، فلا تُعاد طلبات غير متعلقة.
- **العزل**: كل نتيجة تمر بـ`canSeeOrder` + `matchingFilters`؛ لا تسريب.

## 3. الفلاتر المتقدمة (الجزء الثاني)

- `OrderFilters` يضيف: الصفحة الإلكترونية، نوع الطلب، المحافظة، المنطقة (جزئي)، حالة الإرسال (غير مرسل/جاري/تم/يحتاج مراجعة)، والمبلغ من/إلى (بصلاحية `viewAmounts` فقط).
- Dashboard يستخدم `basicOnly: true` (فلتر الفترة فقط) لعدم تكرار الحمل.
- 11 فهرس مركّب جديد (`pageId`/`orderType`/`searchText`/`searchTokens` مع `createdAt`).

## 4. التحديد المتعدد والعمليات الجماعية (الأجزاء 3–4)

- **البدء**: ضغط مطوّل على البطاقة، أو Checkbox على الويب.
- **تحديد الكل**: «تحديد الظاهر» مقابل «تحديد كل النتائج» (خادمي محدود ≤500 مع تأكيد صريح).
- **الحماية**: المعرّفات الثابتة، منع التكرار، إسقاط ما لم يعد مرئيًا بعد الفلترة، والتحقق الخادمي مجددًا.
- **Callables**: `bulkChangeStatus`, `bulkAssignCompany`, `bulkDispatch` — كل واحدة تكرر نفس سياسة الطلب الواحد (`applyStatusChange`/`applyCompanyAssignment`/`dispatchOrder`) وتُرجع نتيجة لكل طلب (نجاح/فشل مستقل). `bulkDispatch` تصنّف النتيجة غير المؤكدة (`uncertain`) ولا تعيد `setorder`.

## 5. ماسح الباركود (الجزء الخامس)

- `BarcodeScannerScreen`: `mobile_scanner` (Code128 + QR)، كاميرا خلفية، إدخال يدوي، debounce 900ms، حد 20 فريد، منع التكرار، حذف/مسح القائمة.
- `resolveBarcodes` خادمي: يربط الكود بالطلب الحقيقي (لا تخمين)، ويُظهر `not_found` للطلبات غير المصرّح بها أو غير الموجودة (لا كشف وجود).
- نتائج المسح قابلة للفتح والتحديد.

## 6. الطباعة الجماعية (الجزء السادس)

- `OrderInvoicePdf.generateMany` + `BulkPrintScreen` (معاينة/طباعة/مشاركة)، كل طلب ببوليصته المستقلة وباركوده الصحيح، وحد {ـ100} طلب، ولا تسريب مبالغ.

## 7. تحسين القائمة والتنقل (الأجزاء 7–8)

- البطاقة تعرض: رقم الطلب، العميل، الهاتف، المحافظة/المنطقة، الوصف، المبلغ (حسب الصلاحية)، الحالة، النوع، الصفحة، الشركة، الوقت، ومؤشر «يحتاج مراجعة»، وزر نسخ الرقم.
- الرجوع يخرج من التحديد أولًا؛ Pull-to-Refresh يحافظ على البحث/الفلاتر.

## 8. الاختبارات والنشر

| الحزمة | النتيجة |
|---|---|
| `flutter analyze` | No issues |
| `flutter test` (Linux) | **461** |
| functions unit | **194** |
| functions emulator + rules | **192** (11 جديدة Phase 2 + 12 بحث/فلترة/جماعي) |
| Playwright E2E | **21/21** |
| CI `40599923357` | 4/4 |

- **Functions**: منشورة (56 دالة، منها `bulkChangeStatus`, `bulkAssignCompany`, `bulkDispatch`, `resolveBarcodes`).
- **Indexes**: 120 منشورة.
- **Hosting**: منشور (bundle نظيف بلا علامات emulator).
- **APK**: `delivery/apk/Velnix-release.apk` موقّع `CN=Velnix` (SHA-256 `32a2e2b4…`)، App Check = Play Integrity.
- **Backfill**: مُثبت على emulator (dry-run=5، apply=5، إعادة التشغيل=0؛ آمن وقابل للاستئناف).

## 9. قيود غير محسومة

- **Android على جهاز حقيقي**: BLOCKED — لا جهاز في هذه الجولة؛ APK مبني وموقّع، لكن تجربة الكاميرا/مسح الباركود تحتاج جهازًا فعليًا (لم تُعلن PASS).
- **الإرسال الجماعي إلى Click**: اختُبر بـ Mock/Emulator فقط؛ لم تُرسَل شحنات حقيقية.
