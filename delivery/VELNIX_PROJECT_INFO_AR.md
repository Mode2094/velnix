# VELNIX — معلومات المشروع والإصدارات

## 1. الهوية

| البند | القيمة |
|---|---|
| المشروع (Firebase) | `velnix-6c1a2` |
| المستودع | `Mode2094/velnix` |
| الفرع المعتمد | `audit/production-readiness` |
| رابط الإنتاج | https://velnix-6c1a2.web.app |
| المنطقة | `europe-west1` (استثناء `orderEventNotice` في `us-central1`) |
| التقنية | Flutter Web (CanvasKit) + Firebase (Functions v2 / Firestore / Auth / Hosting) |
| اللغة | عربية RTL |

## 2. روابط سريعة

- Firebase Console: https://console.firebase.google.com/project/velnix-6c1a2
- Hosting: https://velnix-6c1a2.web.app
- PR #1 (إلى `main`): https://github.com/Mode2094/velnix/pull/1

## 3. الإصدارات

| المكوّن | الإصدار |
|---|---|
| Flutter | 3.47.7 (Dart 3.13.5) |
| Node runtime (Functions) | Node.js 22 |
| Firebase Functions SDK | v2 |
| Click provider | `click_delivery_v1` / الشركة `click_delivery_1603` / `clickUserId=1603` |

## 4. أرقام الـCommits المعتمدة

| المعنى | Commit |
|---|---|
| إغلاق الرحلة الموحدة + قسم الإجراءات | `a89112b` |
| تحديثات QA harness | `201d5af` |
| وسم إلغاء Google في الوثائق | `5dcba8f` |
| مجموعة أدلة التسليم | `4e96ef7` |
| **دمج PR #1 في `main`** | `c2c8cf5` |
| أحدث HEAD معتمد للتسليم | `4e96ef7` (فرع) / `c2c8cf5` (main) |

## 5. الخدمات المنشورة

- Functions: 41 تصديرًا (منها `sendOrderToDelivery`, `syncClickStatuses`, `syncClickOrder`, `createEmployee`, `resetEmployeePassword`, `deleteMember`).
- Scheduler: `firebase-schedule-syncClickStatuses-europe-west1` (15 دقيقة)، و`firebase-schedule-reconcileDeliveryStatuses-europe-west1`.
- Firestore: 109 فهرس composite (READY).
- KMS: مفتاح `company-secrets` (تشفير اعتماد الشركات).
- App Check (reCAPTCHA Enterprise) بـ`enforceAppCheck: true`.

## 6. أمان

- لا أسرار في Git (فحص التوقيعات: 0 findings).
- اعتماد Click مخزَّن مشفّرًا في `companySecrets` عبر KMS فقط.
- Firestore Rules: رفض افتراضي لكل شيء، وقراءة بريد المستخدم فقط.
