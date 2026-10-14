# Firebase — خطة ربط آمنة بعد التصميم

هذه صفحة إرشادية وليست دليلاً على تنفيذ الربط. يُنفذ على مراحل بعد فحص المشروع داخل Open Code.

## الأدوات المقترحة

- Firebase Authentication: تسجيل الدخول للمستخدمين المعتمدين.
- Cloud Firestore: الطلبات، الموظفون (ملفاتهم الوظيفية)، شركات التوصيل العامة، الحالات، الأحداث، الإشعارات.
- Cloud Functions: إنشاء الشحنات وتلقي Webhooks / polling وتحديث الحالات والتعامل مع الأسرار.
- Firebase Cloud Messaging: إشعارات المستلمين المخوّلين، حسب المنصة والدعم.
- Secret Manager: مفاتيح شركات التوصيل. **لا تخزن الرموز الحقيقية في Firestore أو Flutter أو مستودع Git.**
- Firebase App Check، Security Rules، Emulator Suite، Logging بحسب الحاجة.

## الهيكل المبدئي للبيانات

```
organizations/{orgId}
  members/{uid}
  orders/{orderId}
    statusEvents/{eventId}
  couriers/{courierId}
    (name, enabled, providerCode, publicEndpointMetadata, statusMappings)
  shipments/{shipmentId}
  syncEvents/{eventId}
  notifications/{notificationId}
  auditLogs/{eventId}
```

## وظائف الخادم الضرورية

1. `createShipment({orgId, orderId, courierId})`: تحقق من الصلاحية، تحقق من عدم الإرسال مسبقاً، قراءه رقمية آمنة للبيانات، استدعاء الـAPI، حفظ `externalShipmentId` و `trackingNumber` وأحداث المزامنة، وتسجيل الخطأ عند الفشل.
2. `deliveryWebhook(providerCode)`: تحقق من التوقيع أو مصدر الاتصال حسب البروتوكول، تحليل الحدث، التحقق من org/order/shipment، منع الأحداث المكررة، mapping، تحقق من انتقال الحالة، تحديث Firestore داخل transaction وسجل تدقيق.
3. `pollCourierUpdates()`: مهمة دورية كبديل عند غياب Webhook إذا كانت شركة التوصيل تسمح بذلك، مع حدود المعدل والصفحات وbackoff.
4. `testCourierConnection(...)`: **يعمل على الخادم** ولا يعرض أو يرجع سر الشركة إلى الجوال.
5. `configureCourierCredentials(...)`: عملية مدير عام آمنة لإعداد/تدوير الأسرار، مع مراعاة واجهة Secret Manager.

## حماية البيانات

- Security Rules ترفض القراءة/الكتابة الافتراضية دون عضوية نشطة وصلاحية محددة، وتتأكد من `orgId` وعدم قدرة المستخدم على رفع دوره من التطبيق.
- التغييرات القادمة من شركة التوصيل يكتبها service account عبر وظائف الخادم فقط؛ لا تسمح بكتابة `remoteStatus` مباشرة من Flutter.
- لا تعتمد على client timestamps أو الأزرار المخفية لتطبيق صلاحيات الخادم.
- قواعد Firestore والادعاءات المخصصة تحتاج اختبارات محاكاة متعددة الأدوار قبل أي تشغيل حقيقي.
- سجلات الأداء والأخطاء لا تحتوي أرقام الهاتف الكاملة أو مفاتيح API.
- حفظ PII ومراعاة سياسة الاحتفاظ بالبيانات والموافقة والصلاحيات القضائية المطلوبة.

## نقطة حرجة: معنى المزامنة العكسية

مثال: شركة التوصيل ترجع `DONE` ⇒ adapter الخاص بها يحولها إلى `delivered` ⇒ الخادم يتحقق ويحفظ الحدث ويحدث الطلب ⇒ واجهة Flutter تتجدد من Firestore stream. **لا يكفي** جعل مستخدم يضغط «تم التسليم» يدوياً.

## دليل رسمي حديث

https://firebase.google.com/docs/flutter/setup
