# نتائج التحقق النهائي — 14 أكتوبر 2026

هذه النتائج تخص بيئة التطوير المحلية. لا يوجد اتصال production أو اعتماد تشغيل تجاري. المصدر النهائي قبل وثائق التسليم: `382ad34`، مع النسخ النظيفة الموضحة في دليل JSON.

| اسم الفحص | البيئة | الحالات | النتيجة النهائية | المرجع | حدود الإثبات |
|---|---|---:|---|---|---|
| flutter analyze / dart format | Flutter 3.47.7 | فحصان | ناجح | scripts/validate.sh | تحليل وتنسيق، لا قبول وظيفي |
| Flutter suite كامل | Flutter tester | 271 | ناجح، صفر فشل | test/ وevidence/final-engineering-validation.json | widgets وبعض gateways محقونة |
| demo screen matrix | Flutter tester | 100 | ناجح | test/screen_matrix_test.dart | خمسة أدوار × عشرة عروض × تكبيرين |
| live screen matrix | Flutter tester | 100 | ناجح | test/live_screen_matrix_test.dart | شاشة live مع gateway fixture، ليس Firebase منشوراً |
| إنشاء الأدوار/إعادة محاولة/إكمال/إعدادات | Flutter tester | 10 | ناجح | test/live_actions_test.dart | subset من271، server responses محقونة |
| قوائم وصفحات/فشل تحديث/اختيارات137 | Flutter tester | 3 | ناجح | test/directory_panel_test.dart | subset؛ backend paging منفصل بالمحاكي |
| Goldens: لوحة390 وعناصر عربية | Flutter tester + خطوط محملة | 2 | ناجح | test/goldens/ | baseline مراجعة، وليس اعتماد هوية من مصمم |
| Node suite | Node22 | 45 | ناجح، صفر فشل | functions/test/ | يشمل11 textual/static checks لا تعد اختبار خدمة |
| Auth/Firestore Emulator suite | demo-velnix loopback | 36 | ناجح، صفر فشل | functions/test/emulator/ | Functions.run، وليس RPC/App Check منشوراً |
| push recovery | Firestore + FCM محقون | 7 | ناجح | push_recovery.test.js | duplicate/lease/fencing/backoff/partial/permanent؛ لا تسليم FCM حقيقي |
| قواعد وصول | Firestore Emulator | 7 | ناجح | rules.test.js | أدوار وdeny CRUD وself profile |
| remote events | Firestore Emulator | 3 | ناجح | remote.test.js | منع التكرار والرجوع وتأجيل المبكر |
| workflows | Auth/Firestore Emulator | 19 | ناجح | workflow.test.js | خمسة حسابات،10005 طلبات،35 مالكاً،137 شركة/موظف و120 creators scoped |
| توليد/قراءة PDF Code128 | Poppler/ZXingCpp/Pillow | 36 | ناجح | scripts/verify_barcodes.py | 12 ملفاً ×203/300/600؛ preprocessing معلن أدناه |
| صفحات Demo في Chromium | متصفح حقيقي | 30 لقطة | صفر page errors | evidence/screenshots/ وbrowser-results.json | خمسة أدوار ×3 عروض ×رئيسية/طلبات؛ لا يثبت كل زر |
| Web Demo وLive | Flutter compiler | بناءان | ناجح | سجلات workspace وCI workflow | Live compile لا يهيئ Firebase |
| Android Debug Demo وLive | SDK36/JDK21 | بناءان | ناجح | سجلات workspace | لا جهاز فعلي ولا release signing |
| secrets signature / production dependency audit | Python/npm | فحصان | صفر findings/advisories معروفة | scripts/check_secrets.py | لا اختبار اختراق ولا تدقيق تبعيات التطوير كله |
| GitHub Actions | GitHub | غير متاح محلياً | راجع دليل CI النهائي | PR #1/Actions | لا نستبدل CI بعيداً بالنتائج المحلية |

أعداد المجموعات الفرعية في الجدول داخلة في المجموع؛ لا تجمعها مرة أخرى. أعيدت الاختبارات المتأثرة خلال الإصلاح؛ الأعداد النهائية حالات وليست مجموع كل مرات التشغيل.

## الباركود والحدود
باركود ثابت لا يحتوي بيانات العميل. النص المقروء منفصل ومساحة هادئة لا تقل عن10 modules و2مم. رفض الورق الضيق بدلاً من الضغط إلى أقل من نقطة203DPI. للعينات الحالية32 حالة فُكت مباشرة، وأربع صور300DPI احتاجت تكبيراً عاماً2x bilinear في decoder قبل الفك. النتائج تسجل كل استراتيجية ولا تستخدم expected text كـhint. هذا **لا يثبت قراءة جميع الصور مباشرة أو صلاحية الطباعة على جهاز**. العينات الحرارية تضم معرف20 محرفاً، وcustom50×80 متعدد الصفحات، ومبلغاً محجوباً ووصفاً وملاحظات طويلين. JSON في evidence/barcode-decode-results.json وصور مراجعة في evidence/receipt-previews/.

## النسخة النظيفة والفشل الذي عولج
تم clone محلي مستقل وتثبيت locks عبر flutter pub get --enforce-lockfile وnpm ci ثم تشغيل validate. كرر التشغيل من clone نهائي بعد إصلاح الخط وحالة push الجزئية. لا تُستخدم بيانات إنتاج.

ظهر فشل scan حراري203DPI لمعرف20 قبل ضبط الأعمدة، وفشل300DPI مباشر لبعض العينات بعد الضبط؛ decoder fallback معلن ولا يخفي القيد الفيزيائي. كشف Chromium مربعات في Chips، فثبت Cairo لجميع أنماط عناصر التحكم. تغيّر golden للوحة بسبب الخط المقصود، فراجعناه وحملنا Regular/Bold/MaterialIcons وحدّثنا baseline ثم أعيدت مقارنة كاملة بلا update-goldens. لا skip أو continue-on-error.

لم يُختبر Google أو FCM foreground/background أو App Check/KMS أو carrier sandbox فعلي أو طابعة/ماسح أو جهاز Android/iOS أو restore/performance/cost إنتاج. Network/doctor وKGP/Cupertino font dependency warnings السابقة موثقة؛ Flutter مثبت، MaterialIcons المستخدم فعلياً ظاهر بالمتصفح، وiOS يحتاج منصة وتجربة خارجية.

قراءة `gh pr checks 1 --repo Mode2094/velnix` أعادت Forbidden من GitHub GraphQL API. لم نكرر المحاولة عبر API؛ لذلك لا يوجد ادعاء بأن Actions الجديدة نجحت. رفع Git والتحقق من SHA البعيد منفصلان ومتاحان. راجع [PR #1](https://github.com/Mode2094/velnix/pull/1) و[Actions](https://github.com/Mode2094/velnix/actions).
