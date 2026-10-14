# جرد استاتيكي لمواضع التفاعل في الواجهات

هذه الأرقام تعني وجود callbacks في الكود، **وليست إثباتاً على عمل الأزرار داخل التطبيق**.

| الملف | onPressed | onTap | onChanged | إجمالي مواضع التفاعل |
|---|---:|---:|---:|---:|
| `lib/core/widgets.dart` | 0 | 0 | 1 | 1 |
| `lib/live/live_admin.dart` | 15 | 1 | 6 | 22 |
| `lib/live/live_app.dart` | 8 | 6 | 0 | 14 |
| `lib/live/live_dashboard.dart` | 4 | 1 | 0 | 5 |
| `lib/live/live_notices.dart` | 1 | 1 | 0 | 2 |
| `lib/live/live_orders.dart` | 20 | 1 | 6 | 27 |
| `lib/printing/order_printing.dart` | 2 | 0 | 3 | 5 |
| `lib/screens/dashboard_screen.dart` | 8 | 4 | 0 | 12 |
| `lib/screens/delivery_screens.dart` | 12 | 1 | 2 | 15 |
| `lib/screens/login_screen.dart` | 1 | 1 | 0 | 2 |
| `lib/screens/notifications_screen.dart` | 1 | 1 | 0 | 2 |
| `lib/screens/orders_screen.dart` | 6 | 2 | 4 | 12 |
| `lib/screens/settings_screen.dart` | 1 | 1 | 0 | 2 |
| `lib/screens/shell_screen.dart` | 2 | 1 | 0 | 3 |
| `lib/screens/team_screen.dart` | 3 | 0 | 4 | 7 |

## ملاحظات
- لا يمكن إثبات صلاحيات الوصول عبر البحث النصي عن زر. الخادم هو المرجع النهائي.
- يجب تنفيذ اختبارات Flutter widget وintegration على المقاسات المختلفة.
