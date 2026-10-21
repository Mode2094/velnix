# Stage 4 — مصفوفة الأدوار والصلاحيات

> **مصفوفة مُقاسة تجريبياً** — كل عملية استُدعيت فعلياً لكل دور، والنتيجة **مُرصودة** لا مُفترضة.

## 1. الأدوار المُنفَّذة (من المصدر)

| المُعرّف | التسمية العربية | الصلاحيات المُمنوحة في البيئة |
|---|---|---|
| `generalManager` | مدير عام اصطناعي | **مدير عام — كل الصلاحيات ضمنياً**
| `manager` | مدير اصطناعي | `viewAllOrders` `editAllOrders` `updateOrderStatus` `viewAmounts` `viewReports` `viewAudit` `manageEmployees` |
| `warehouse` | مستودع اصطناعي | صلاحية صريحة على الطلبات + `sendToDelivery` ضمنياً |
| `sales` | مبيعات اصطناعي | مشرف فريق المدخلين |
| `dataEntry` | مدخل اصطناعي | إنشاء الطلبات لنفسها |

المصدر: `functions/src/policy.js` → `ROLES`, `PERMISSIONS`, `can()`.

> ملاحظة: `generalManager` يمرّ بـ`can()` داخلياً ولا يحتاج مصفوفة صلاحيات.

## 2. المصفوفة (مسموح / ممنوع)

| العملية | generalManager (مدير عام اصطناعي) | manager (مدير اصطناعي) | warehouse (مستودع اصطناعي) | sales (مبيعات اصطناعي) | dataEntry (مدخل اصطناعي) |
|---|---|---|---|---|---|
| `me` | مسموح | مسموح | مسموح | مسموح | مسموح |
| `listOrders` | مسموح | مسموح | مسموح | مسموح | مسموح |
| `searchOrders` | مسموح | مسموح | مسموح | مسموح | مسموح |
| `dashboardStats` | مسموح | مسموح | مسموح | مسموح | مسموح |
| `companyStats` | أخرى | أخرى | أخرى | أخرى | أخرى |
| `listOrderCreators` | مسموح | مسموح | مسموح | مسموح | مسموح |
| `getOrder_otherOwner` | مسموح | مسموح | مسموح | ممنوع | ممنوع |
| `getSettings` | مسموح | مسموح | مسموح | مسموح | مسموح |
| `listCompanies` | مسموح | مسموح | مسموح | مسموح | مسموح |
| `listNotices` | مسموح | مسموح | مسموح | مسموح | مسموح |
| `listMembers` | مسموح | مسموح | ممنوع | ممنوع | ممنوع |
| `listAudit` | مسموح | مسموح | ممنوع | ممنوع | ممنوع |
| `listSyncEvents` | مسموح | ممنوع | ممنوع | ممنوع | ممنوع |
| `markNoticeRead` | مسموح | ممنوع | ممنوع | ممنوع | ممنوع |
| `saveSettings` | مسموح | ممنوع | ممنوع | ممنوع | ممنوع |
| `saveCompany` | أخرى | ممنوع | ممنوع | ممنوع | ممنوع |
| `archiveCompany` | أخرى | ممنوع | ممنوع | ممنوع | ممنوع |
| `restoreCompany` | أخرى | ممنوع | ممنوع | ممنوع | ممنوع |
| `testCompanyConnection` | أخرى | ممنوع | ممنوع | ممنوع | ممنوع |
| `saveMember` | أخرى | أخرى | ممنوع | ممنوع | ممنوع |
| `assignCompany` | مسموح | ممنوع | ممنوع | ممنوع | ممنوع |
| `sendOrderToDelivery` | أخرى | ممنوع | ممنوع | ممنوع | ممنوع |
| `updateOrder_otherOwner` | أخرى | أخرى | ممنوع | ممنوع | ممنوع |
| `changeOrderStatus_otherOwner` | مسموح | أخرى | أخرى | ممنوع | ممنوع |
| `registerDevice` | أخرى | أخرى | أخرى | أخرى | أخرى |
| `createOrder` | مسموح | مسموح | مسموح | مسموح | مسموح |

## 3. النتائج غير «مسموح/ممنوع» — مفسَّرة بدقة

| العملية | الأدوار | التفسير | التصنيف |
|---|---|---|---|
| `saveCompany`, `archiveCompany`, `restoreCompany`, `testCompanyConnection`, `companyStats` | GM | `failed-precondition: kms_not_configured` | **يتطلب خدمة خارجية** (KMS) |
| `sendOrderToDelivery` | GM | «الطلب غير جاهز للشحن» | سلوك precondition صحيح |
| `updateOrder_otherOwner` | GM, manager | **409 aborted** «تم تعديل الطلب بواسطة مستخدم آخر» | **حماية التزامن تعمل** ✅ |
| `changeOrderStatus_otherOwner` | manager, warehouse | `failed-precondition: هذا الانتقال غير مسموح` | **رفض سياسة صحيح** ✅ |
| `saveMember` | GM, manager | 404 «الموظف غير موجود» | بعد اجتياز بوابة الصلاحية ✅ |
| `registerDevice` | الجميع | يتطلب توكن FCM حقيقي | **يتطلب خدمة خارجية** (FCM غير مفعّل) |

## 4. عزل الأدوار — مُثبَت

| الفرضية | الدليل |
|---|---|
| `sales`/`dataEntry` لا يريان طلبات الآخرين | `getOrder_otherOwner = **ممنوع**` لهما، و**مسموح** للثلاثة других |
| `warehouse`/`sales`/`dataEntry` لا يديرون الموظفين | `listMembers = **ممنوع**`، و`saveMember = **ممنوع**` |
| لا أحد يعدّل الإعدادات غير GM | `saveSettings = **ممنوع**` لأربعة أدوار |
| لا سجل تدقيق بلا صلاحية | `listAudit = **ممنوع**` لثلاثة أدوار |
| لا مزامنة بلا صلاحية | `listSyncEvents = **ممنوع**` لأربعة أدوار |
