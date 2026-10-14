# المعمارية المستهدفة (تُنفذ بالتدريج)

## المبدأ

الواجهة الحالية تعرض Model / DemoStore بوضوح. عند بدء التنفيذ الحقيقي يتم فصل الواجهة عن مصدر البيانات باستخدام **Repository interfaces**، ثم يضاف Firebase Adapter بلا إعادة كتابة الشاشات. لا نقفز مباشرة لتحويل كل الشاشة إلى Firestore queries.

## مقترح تنظيم lib بعد مرحلة الأساس

```
lib/
  app/                 # bootstrap, DI, router, localization
  core/                # theme, errors, results, widgets, date/number helpers
  features/
    auth/{domain,data,presentation}/
    orders/{domain,data,presentation}/
    team/{domain,data,presentation}/
    delivery/{domain,data,presentation}/
    dashboard/{domain,data,presentation}/
    notifications/{domain,data,presentation}/
    audit/{domain,data,presentation}/
  integrations/        # FlutterFire adapters only
```

## حدود الطبقات

- **Presentation**: Widgets, controllers/state, loading/error/empty states; no passwords/secrets.
- **Domain**: order rules, allowed status transitions, RBAC permission rules, models, repository contracts.
- **Data**: Firestore converters, typed queries, pagination, immutable models, error handling.
- **Server (Cloud Functions)**: shipping API calls, company credentials, webhook verification, scheduled polling, retries, idempotency, audit, notification dispatch.

## كيانات مطلوبة

Tenant/Organization (معرّف ثابت حتى لو نظام لعميل واحد)، UserMembership, Order, OrderItemDescription (نص فقط), OrderStatusEvent, DeliveryCompany, ShippingShipment, DeliverySyncEvent, Notification, AuditEntry.

## ثوابت التشغيل

1. كل أمر يحتوي `tenantId`، `createdBy`، `createdAt`، `updatedAt`، ولا يمكن حذفه نهائياً من واجهة المستخدم.
2. حالة الطلب وحالة الشحنة ليستا دائماً الشيء نفسه: حفظ `internalStatus`, `remoteStatus`, `remoteStatusUpdatedAt` ووثيقة الأحداث.
3. حالة «تم التسليم» القادمة من الشركة موثقة بـsource=`courier_webhook|poller` مع idempotencyKey.
4. جميع الطلبات من أي دور تصل لنفس لوحة الإدارة وفق الصلاحيات.
5. بالنسبة للمبيعات: يستطيع رؤية ما أنشأه، وطلبات مدخلي البيانات ضمن النطاق المتفق؛ التصفية تتم في الاستعلام وقواعد الأمان، وليس فقط بإخفاء زر.
6. مسار الاختبارات: unit لقواعد الأدوار والحالات، widget للشاشات، integration مع Firebase Emulator، اختبارات عقد API للشركة الأولى.
7. إمكانية التوسع لشركات توصيل أخرى عن طريق DeliveryProvider interface + adapter منفصل، لا عن طريق استدعاء URLs عشوائية من جوال المستخدم.

## قرارات تحتاج اعتماداً قبل الربط

- المنصات الهدف: Android / iOS / Web (المشروع مصمم ليكون متجاوباً؛ التفعيل الفعلي يُحدد).
- شركة التوصيل الأولى ونوع مصادقتها وتوثيق API ومجموعة الحالات الفعلية.
- هل المستخدمون ضمن منشأة واحدة أم عدة منشآت؟ يُفضل المحافظة على tenantId في البيانات دون تنفيذ SaaS الآن.
- تحديد سياسة تعديل/إلغاء الطلب بعد إرساله للشركة ومسؤولية حالات المرتجع/إلغاء الشحنة.
