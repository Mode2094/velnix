# تقرير المرحلة الثالثة: التدقيق والتحضير لـ Click Delivery

Baseline: `b362bbe` على `audit/production-readiness`. لم يتغير main، ولم ينفذ Merge أو Deploy أو إنشاء موارد مدفوعة أو اتصال بشركة التوصيل أو طباعة فعلية. إنشاء الطلبات في الاختبارات على demo-velnix ومحاكيات loopback فقط.

## مصفوفة الأدوار

| الدور | إنشاء | نطاق القراءة الافتراضي | التعديل الافتراضي | الحالة الداخلية | المبالغ | إدارة/شحن |
|---|---|---|---|---|---|---|
| المدير العام | نعم | جميع الطلبات | وفق الحالة والقفل | مسموح وفق الدورة | جميعها | جميع الصلاحيات؛ حل الاستثناء له وحده |
| المدير | نعم | طلباته؛ viewAllOrders يوسع النطاق | طلباته created/review؛ editAllOrders يوسع التعديل ضمن الحالات | updateOrderStatus مطلوب | طلباته؛ viewAmounts يوسع | حسب الصلاحيات الممنوحة، دون تصعيد إدارة أعلى |
| المستودع | نعم | جميع الطلبات | طلباته created/review؛ يحتاج editAllOrders للتوسع | مسموح وفق الدورة | طلباته؛ viewAmounts يوسع | sendToDelivery/manage* بحسب المنح |
| المبيعات | نعم | طلباته وفريق dataEntry الحالي | طلباته created/review؛ editAllOrders ضمن نطاق الرؤية | يحتاج updateOrderStatus | طلباته؛ viewAmounts يوسع | حسب المنح |
| مدخل البيانات | نعم | طلباته | created/review | يحتاج updateOrderStatus | طلباته | حسب المنح |

كل دور يحتاج active وعضوية صحيحة. المنح الإضافية لا تلغي تجميد الشحنة أو الحالة النهائية. تغير الفريق/الدور والتعطيل يعاد التحقق منه على الخادم، وcurrentActor يشارك في معاملات العمل. الطباعة تستخدم DTO المسموح قراءته؛ ليست وسيلة للحصول على مبلغ محجوب. لا حذف طلب لأي دور من التطبيق.

## تغطية جميع handlers الحالية (32)

| handlers | ما راجعته/حالة التدقيق |
|---|---|
| me | عضوية فعالة ودور صحيح، لا اعتماد شركة في الاستجابة |
| listOrders, searchOrders, listOrderCreators | نطاق العضوية الحالية، creator filters، pagination، البحث العربي؛ موجود واختبارات سابقة محفوظة |
| dashboardStats, companyStats | aggregations تحت النطاق نفسه، إخفاء المبالغ بحسب الصلاحية؛ لا تغيير حسابات/فهارس/فلاتر في المرحلة الحالية |
| getOrder | نطاق الرؤية وDTO والأحداث؛ أضيف shippingStatus الداخلي المستقل وcompanyProvider دون بيانات اعتماد |
| createOrder | الأدوار الخمسة، validation وrequestKey transaction وpayload hash ومنع التكرار والأحداث؛ موجود |
| updateOrder, changeOrderStatus, assignCompany | revision، currentActor، انتقالات التجهيز، تجميد الإرسال، أهلية الشركة؛ لا إضافة انتقالات Click غير موثقة |
| sendOrderToDelivery | تم إصلاح فشل التجهيز مقابل غموض المحاولة؛ provider/URL/enabled يتحقق قبل القفل، وKMS قبل علامة بدء المحاولة؛ سجل تدقيق للحالتين |
| resolveDispatchException | المدير العام فقط، سبب ومرجع، قفل منتهٍ/needs_review، لا إعادة تلقائية؛ موجود |
| listCompanies, saveCompany, archiveCompany, restoreCompany, testCompanyConnection | إدارة مخولة، KMS المرجعي، أرشفة غير مدمرة؛ Click draft معطل فقط، provider ثابت للشركات الموجودة، no fake health |
| listMembers, saveMember | الأدوار والمنح والمشرف وحماية الإدارة وآخر مدير، DB authorization قبل Auth API؛ موجود |
| listNotices, markNoticeRead | recipient/ownership والتكرار/read state؛ موجود |
| listSyncEvents, listAudit | permission ونطاق الطلب عند العرض؛ لا حقول مالية/اعتمادات في نتائج السجل |
| deliveryWebhook | HMAC/body/timestamp للمرجع فقط؛ Click يرد 409 دون تفسير payload أو KMS decrypt أو حدث وهمي |
| reconcileDeliveryStatuses | poll budget/backoff للمرجع؛ يرفض Click قبل أي decrypt/request؛ لا endpoint Click مفترض |
| registerDevice, unregisterDevice, pushNotice, orderEventNotice | ownership وحد الأجهزة، أعضاء ونطاق حاليان، notices idempotent وretry/lease/fencing؛ لم يغير منطقها |
| getSettings, saveSettings | إعدادات غير سرية، manageSettings للحفظ؛ موجود |

مراجعة المصدر ومجموعات الاختبارات لا تساوي اختبار كل endpoint منشور. callable tests تستعمل Functions.run ومحاكيات فعلية؛ App Check المنشور وFCM/KMS الحقيقي خارج الإثبات الحالي.

## الإصلاح المثبت والتعديلات

**P2: تشخيص إرسال خاطئ قبل خروج الطلب.** المسار السابق يحول أي exception بعد القفل إلى needs_review، حتى فشل credentials/KMS قبل transport. الآن يبقى idle عند فشل التجهيز، مع audit ورسالة «لم يبدأ الإرسال». إذا بدأت محاولة create ثم انقطع الرد أو غاب tracking يبقى needs_review؛ لا retry تلقائي ولا حذف الطلب. فحص حالة القفل السابقة يسبق فحص إعداد الشركة، كي يبقى التحذير القديم عن إرسال ملتبس واضحاً.

| الملفات | السبب |
|---|---|
| functions/src/click_delivery.js | طلب getorder موثق كتحضير Mock فقط، exact URL ومصادقة الجسم، ورفض استجابة مجهولة؛ محول تشغيل محجوب |
| functions/src/providers.js وdelivery.js | فصل Click عن generic، ومنع المضيف Click بعقد Bearer، وإعادة استخدام HTTPS/allowlist/timeout/size/redirect checks؛ default live Click fetch محظور |
| functions/src/index.js | مسودة شركة معطلة، رفض secret/mapping غير الموثق، تثبيت provider، إصلاح الإرسال وتدقيقه، وحواجز health/poll/webhook |
| functions/src/remote.js | عدم تفسير Click بأسماء حقول generic حتى مع سجل قديم غير صحيح |
| functions/src/shipping_status.js وorder_view.js | قاموس داخلي سباعي وحقل DTO مستقل، دون كتابة استجابة Click أو حساب مبالغ جديدة |
| lib/models/shipping_status.dart وlib/live/live_orders.dart | تسميات عربية منفصلة عن OrderStatus، وعرض غير مؤكد للتحصيل/الرسوم؛ لا تخمين API codes |
| lib/live/live_admin.dart وlive_app.dart | اختيار Click كمسودة فقط، منع التفعيل والحقول المرجعية، وتعريب أحداث فشل التجهيز/المحاولة |
| functions/test/click_delivery.test.js وshipping_status.test.js | طلبات مؤكدة فقط، حواجز URLs/default transport/unknown responses، وعدم تصنيع حالات أو بيانات مالية |
| functions/test/search_contract.test.js | حصر فحص الأرشفة في webhook وpolling مع السماح بخيار رفض Click قبل فك الاعتماد، دون إزالة شرط دعم الشركة المؤرشفة |
| functions/test/emulator/dispatch_contract.test.js وworkflow.test.js وremote.test.js | معاملات وقفل/audit، KMS mock وفشل local HTTP، منع محاولة ثانية، ورفض Click ومخطط المال غير المعروف |
| test/click_readiness_test.dart | جميع الأدوار × الحالات السبع في gateway fixture، منع إظهار مبالغ غير مؤكدة، ونموذج Click عند 320/768 و200% |
| docs/CLICK_DELIVERY_*.md وdocs/evidence/click-*.json | مصفوفة التوافق والمصادر والأسئلة والإثبات والقيود |

لا تغيير على التبعيات أو قواعد Firestore أو الفهارس أو enum الحالات الداخلية أو عدادات/فلاتر النظام القائمة. المتجر والمخزون والمحاسبة المتقدمة وتكاملات شركات أخرى خارج العمل.

## نتائج التحقق

نجحت الفحوص القائمة: **306 Flutter، 51 Node، 48 Auth/Firestore، 36 فحص باركود PDF رقمي**؛ تحليل وتنسيق وsyntax وأسرار وnpm production audit ناجحة. تشغيل scripts/validate.sh الشامل اجتاز 306/51/47، ثم أعيدت مجموعتا Node والمحاكيات بعد ترتيب الحواجز وإضافة انحدار تزوير الحالة، بنتيجة نهائية 51/48 للمصدر الأخير. لا اختبارات متخطاة في مجموعتي Node والمحاكيات النهائيتين. بقيت مقارنة الصور السابقة مفعلة دون تحديث baseline لتجاوز فشل.

نجح بناء Web بنمطَي Demo/Live محلياً؛ Live compile فقط، لا تهيئة خدمة منشورة. Android وChromium يحملهما CI القائم للـcommit النهائي؛ لا تنسب نتيجة CI سابقة إلى هذه المرحلة. يسجل رابط التشغيل النهائي وحالته في تقرير التسليم بعد رفع commit. أُبقيت اختبارات الانحدار النصية السابقة؛ أول run فشل في اثنين منها بسبب موضع declaration وبنية literal، ثم أعيد تنظيم الكود دون حذف assertions مع إضافة اختبارات سلوك فعلية للإرسال. وبعد إضافة حظر webhook لشركة Click بلا secrets، حدث فحص الأرشفة النصي ليقبل الخيار requireSecrets:false مع الإبقاء على allowInactive:true وتحديد نطاق webhook وpolling؛ اختبار المحاكي لأحداث شركة مؤرشفة بقي ناجحاً.

المحاكاة لشركة الشحن تستعمل HTTP محلياً عبر transport محقون، وKMS محقوناً في عملية الاختبار فقط. **لا نجاح setorder/getorder/removeorder فعلياً**؛ اختبار getorder ينتهي عمداً برفض response غير موثق. المواضيع المالية ترجع «غير مؤكدة» ولا 0 أو خصم أو تحصيل افتراضي. اختبار PDF رقمي ليس اختبار طابعة.

## قرار إغلاق المرحلة

تدقيق الوظائف والتحضير المحجوب والعرض المحلي والوثائق قابل للإغلاق بعد حفظ commit ونجاح CI. **التكامل الحقيقي والحالات الخارجية والماليات غير مكتملة**: اعتمادها متوقف على استجابات الشركة وأكواد الحالات وعقد المعرفات/الرسوم وsandbox. يلزم أيضاً تنفيذ فلاتر/عدادات facet الشحن بعد ثبوت العقد، وفق الخطة الأدنى في تقرير التوافق؛ لا تدعي العدادات الحالية أنها تتابع الحالات السبع من Click.

- [التوافق ومصفوفة الوظائف والحالات ومصدر كل حقل](CLICK_DELIVERY_COMPATIBILITY_AR.md)
- [الأسئلة الجاهزة للشركة](CLICK_DELIVERY_QUESTIONS_AR.md)
- الدليل المنظم: `evidence/click-delivery-contract.json` و`evidence/click-stage3-validation.json`.
