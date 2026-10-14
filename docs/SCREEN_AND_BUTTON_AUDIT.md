# جرد استاتيكي لمواضع التفاعل في الواجهات

هذه الأرقام تعني وجود callbacks في الكود، **وليست إثباتاً على عمل الأزرار داخل التطبيق**.

| الملف | onPressed | onTap | onChanged | إجمالي مواضع التفاعل |
|---|---:|---:|---:|---:|
| `lib/core/widgets.dart` | 0 | 0 | 1 | 1 |
| `lib/live/directory_panel.dart` | 4 | 0 | 0 | 4 |
| `lib/live/live_admin.dart` | 15 | 1 | 6 | 22 |
| `lib/live/live_app.dart` | 9 | 7 | 0 | 16 |
| `lib/live/live_dashboard.dart` | 4 | 1 | 1 | 6 |
| `lib/live/live_notices.dart` | 3 | 1 | 0 | 4 |
| `lib/live/live_operations.dart` | 0 | 0 | 1 | 1 |
| `lib/live/live_orders.dart` | 20 | 1 | 7 | 28 |
| `lib/live/live_settings.dart` | 2 | 0 | 0 | 2 |
| `lib/live/order_filters.dart` | 3 | 0 | 2 | 5 |
| `lib/printing/order_printing.dart` | 2 | 0 | 3 | 5 |
| `lib/screens/dashboard_screen.dart` | 8 | 4 | 0 | 12 |
| `lib/screens/delivery_screens.dart` | 12 | 1 | 2 | 15 |
| `lib/screens/login_screen.dart` | 1 | 1 | 0 | 2 |
| `lib/screens/notifications_screen.dart` | 1 | 1 | 0 | 2 |
| `lib/screens/orders_screen.dart` | 6 | 2 | 4 | 12 |
| `lib/screens/settings_screen.dart` | 1 | 1 | 0 | 2 |
| `lib/screens/shell_screen.dart` | 2 | 1 | 0 | 3 |
| `lib/screens/team_screen.dart` | 3 | 0 | 4 | 7 |

## حدود الجرد والتحقق
- لا يمكن إثبات صلاحيات الوصول عبر البحث النصي عن زر. الخادم هو المرجع النهائي.
- مصفوفتا demo وlive تختبران الشاشات المرئية لكل دور على عشرة عروض وتكبير 1 و2.
- live_actions_test يختبر إرسال نموذج كل دور وإعادة محاولة مستقرة وحفظ الإعدادات وحالات الخطأ ببوابة محقونة.
- تسجيل الدخول وGoogle وإذن FCM وطباعة الجهاز والإرسال لشركة حقيقية تتطلب integration خارجي؛ callbacks أعلاه لا تثبتها.

## مراجعة المسارات
| الشاشة/الإجراء | الربط | دليل التحقق المحلي |
|---|---|---|
| دخول/خروج/استعادة/Google | Auth؛ Google معطل برسالة حتى الإعداد | دخول demo بالمتصفح، Auth بالمحاكي؛ OAuth خارجي |
| لوحة وعدادات/انتقال حالة | shell إلى قائمة مفلترة | widget ومحاكي عدادات |
| قائمة/بحث/ترتيب/صفحة/فلاتر | Gateway إلى استعلام مخول | معاملات واختبارات استعلام/صفحات |
| إنشاء/تعديل/حالة/تعيين/مراجعة إرسال | معاملات Functions | نماذج الأدوار + محاكيات؛ شركة خارجية |
| تفاصيل/سجل/طباعة | جلب حديث/PDF | widget وPDF |
| أعضاء/شركات/أرشفة | وظائف إدارة مخولة | محاكي صلاحيات؛ KMS خارجي |
| إعدادات المؤسسة | شاشة LiveSettings وحفظ حقيقي | widget حفظ ومحاكي settings |
| إشعارات/مقروء/فتح طلب | notices + Auth scope | محاكي إعادة الحدث؛ FCM خارجي |
| تقارير/سجل/مزامنة | وظائف وفلاتر مخولة | مصفوفات عرض واختبارات خادم |

لم تنفذ رحلة كل زر على جهاز أو Firebase منشور؛ الجرد لا يتيح جواباً قاطعاً بأن جميع الأزرار اجتازت قبولاً واقعياً. فشل الشبكة ومراجعة الإرسال معالجان، وبوابات خارجية معطلة أو تتطلب إعداداً واضحاً.

## مراجعة الإصلاحات النهائية
| الإجراء | الحماية/التحديث | الإثبات |
|---|---|---|
| إكمال داخلي | تأكيد نهائي، منع carrier/locks، provenance، reload/actions نهائية | policy + emulator + live_actions |
| إدارة شركة/موظف | operating guard يعطل الأفعال المتكررة، loading، refresh | matrices + source guard؛ KMS خارجي |
| البحث/المزيد في الإدارة | cursor مستقر، prefix بحث، إعادة البدء، cache يمسح عند فشل | directory_panel +137 fixtures |
| طباعة | نص مستقل وهامش/دقة، جلب مخول، مبلغ محجوب | PDF/scan مع fallback معلن |
| دفع مؤجل/عالق | lease/fencing/4محاولات، per-device acknowledgements، فشل جزئي لا يوسم sent |7 اختبارات محاكي |

30 لقطة browser تغطي رئيسية/طلبات demo بحسب الدور. لا يوجد ادعاء بأن جميع الأزرار اجتازت قبول جهاز أو خدمة فعلية، ولا أن كل صلاحية مخصصة في حاصل ضرب جميع الخيارات اختبرت.
