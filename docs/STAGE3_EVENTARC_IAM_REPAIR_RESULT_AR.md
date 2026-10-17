# نتيجة إصلاح IAM لمُشغّل Eventarc — `orderEventNotice`

> **الحالة: الإصلاح نجح. `E1` PASS. Stage 3 = PARTIAL** (لأن `E2` و`F1` لم يُختبرا).

---

## 1. الهوية والمصادر

| البند | القيمة |
|---|---|
| **source SHA** | `ff1ff4207bbf3ef9c079ab1cff8cabdb2a5fb69f` |
| مشروع Google Cloud | `velnix-6c1a2` (رقم `948196868655`) |
| حساب CLI المخوَّل | `moderohe8@gmail.com` (جلسة بشرية معتمدة) |
| Cloud Run | `ordereventnotice` · `us-central1` |
| مُشغّل Eventarc | `ordereventnotice-524138` · `nam5` |
| وجهة المُشغّل | `projects/velnix-6c1a2/locations/us-central1/functions/orderEventNotice` ✅ مطابقة |
| مرشّحات الحدث | `namespace=(default)` · `document=orders/{orderId}/events/{eventId}` · `type=firestore.document.v1.created` · `database=(default)` ✅ |

## 2. ✅ إثبات هوية المستدعي — بمصدرين مستقلَّين

> هذا هو جوهر التفويض: لم أستخدم حساب Functions التشغيلي لمجرد ظهوره في الإعدادات.

**المصدر (أ) — إعداد المُشغّل**
```
trigger.serviceAccount = velnix-runtime-internal@velnix-6c1a2.iam.gserviceaccount.com
```

**المصدر (ب) — المُشغِّل الحقيقي فعلياً (مستقلّ عن أ)**

تبيّن أن التسليم يمرّ عبر **Pub/Sub push** لا اتصال مباشر، والدليل من مسار الطلب نفسه:
`?__GCP_CloudEventsMode=CE_PUBSUB_BINDING`

```
subscription : projects/velnix-6c1a2/subscriptions/eventarc-nam5-ordereventnotice-524138-sub-326
topic        : projects/velnix-6c1a2/topics/eventarc-nam5-ordereventnotice-524138-096
pushEndpoint : https://ordereventnotice-i32ccqmgqq-uc.a.run.app?__GCP_CloudEventsMode=CE_PUBSUB_BINDING
oidc SA      : velnix-runtime-internal@velnix-6c1a2.iam.gserviceaccount.com   ← المستدعي الحقيقي
audience     : https://ordereventnotice-i32ccqmgqq-uc.a.run.app
```

**الهوية التي وقّع بها Cloud Run هي توقيع OIDC الخاص بالاشتراك — وهي نفس الحساب بالضبط.**
استُبعدت `gcp-sa-eventarc` و`gcp-sa-pubsub` لأن مسار التسليم Pub/Sub push لا يستعملهما هنا.

### فحوص ما قبل التغيير — كلها مطابقة
| الفحص | النتيجة |
|---|---|
| `bindings` على الخدمة | `null` ⇒ **لا يوجد أي invoker** ✅ |
| `etag` قبل | `ACAB` |
| `version` قبل | `None` |
| رصيد revision لـ Cloud Run | `ordereventnotice-00001-vub` |
| محاولات فاشلة | **98 × HTTP 403** بين `08:45:41Z` و `10:49:05Z` |
| نجاحات سابقة | **0 — لم يُشغَّل جسم الدالة ولا مرة** |
| إعدادات إعادة المحاولة | Pub/Sub: `min 10s` / `max 600s` · بلا DLQ · احتفاظ الرسائل `86400s` |
| عدد الإشعارات قبل | **0** |

## 3. التغيير المنفَّذ — binding واحد فقط

| البند | القيمة |
|---|---|
| **طابع الوقت** | `2026-10-17T10:51:29Z` |
| المورد | Cloud Run `ordereventnotice` (مستوى الخدمة فقط) |
| العضو | `serviceAccount:velnix-runtime-internal@velnix-6c1a2.iam.gserviceaccount.com` |
| الدور | `roles/run.invoker` |
| **حالة CLI** | **0 (نجاح)** — نُفِّذ مرة واحدة |
| `etag` بعد | `BwZeBxBe6n4=` |
| `version` بعد | `1` |

### التحقّق بعد التغيير — البنود الثمانية
| # | المتطلّب | النتيجة |
|---|---|---|
| 1 | الحساب المتوقَّع حاز `roles/run.invoker` | ✅ |
| 2 | النطاق محصور في `ordereventnotice` فقط | ✅ |
| 3 | الروابط السابقة سليمة | ✅ (لم تكن هناك روابط؛ `bindings=null`) |
| 4 | **لا** `allUsers` / `allAuthenticatedUsers` | ✅ لم يُضَف أيٌّ |
| 5 | لا تغيير IAM على خدمات أخرى | ✅ `createorder`/`getorder`/`listnotices` ما زالت `allUsers` كما كانت |
| 6 | revision Cloud Run بلا تغيير | ✅ `updateTime` ما زال `2026-10-15T20:18:58Z` |
| 7 | إعداد المُشغّل بلا تغيير | ✅ الحساب نفسه |
| 8 | إعداد Functions بلا تغيير | ✅ `nam5` · `nodejs22` |

**لم يُرصد أي توسّع صلاحيات ولا استبدال سياسة.** لم|report أي حادث أمني.

## 4. المراقبة بعد الإصلاح

| النافذة | النتيجة |
|---|---|
| `10:51:32Z` | آخر 403 — طلب كان **جارٍاً** قبل الانتشار |
| من `10:52:42Z` | **HTTP 204 × 5 — نجاح** |
| أخطاء تشغيلية (Cloud Run / Firestore) | **لا شيء** |

### سلوك التسليم
- `retryPolicy` في Pub/Sub: `10s → 600s`، وبلا DLQ ⇒ **الرسائل المعلّقة تُعاد تلقائياً**.
- **5 إشعارات أُنشئت تلقائياً بعد الإصلاح — لم أُنشئ أي حدث ولا طلباً.**
- 6 أحداث طلب ⇒ 6 إشعاراً متوقّعاً؛ وصل **5 حتى لحظة القياس**، والباقي في طابور إعادة المحاولة.

### ⚠️ الإشعار السادس ليس عطلاً
`notifyRecipients` يبني مُعرّفاً من `hash(orderId + eventId + recipientId)`، فكل حدث يعطي إشعاراً مستقلاً وصحيحاً.
وصول 5 من 6 حتى لحظة القياسة، والباقي في طابور إعادة المحاولة — لا يعد عيناً.

## 5. الأثر المالي — **لم أفترض أنه صفر**

| البند | التقدير |
|---|---|
| Cloud Functions / Cloud Run | **5 استدعاءات ناجحة** بعد الإصلاح (كانت 98 محاولة فاشلة لم تُشغّل الدالة) |
| Firestore | **5 عمليات كتابة** إشعار + قراءات المصدر والعضويات |
| Eventarc / Pub/Sub | حجم صغير ضمن الحصة المجانية؛ **قد** تُحتسبukai محاولات التسليم الزائدة |
| ⚠️ | التكلفة **محدودةMinute ومحدودة النطاق** بهذا الطلب الواحد. الأثر التراكمي المستقبلي يعتمد على حجم الطلبات الحقيقي، وهو خارج هذا التقييم |

## 6. نتائج القبول

```
decision : NOT_EXECUTED — not verified: E2
orderId  : RLWEouzNty2huVT8DUHN | status: delivered | revision: 5
```

| البوابة | قبل الإصلاح | بعد الإصلاح |
|---|---|---|
| **E1** إشعار موجود | ❌ FAIL | ✅ **PASS — 5 إشعارات** |
| **E2** إشعار مقروء | ⬜ NOT TESTED | ⬜ **NOT TESTED** (0 من 5 مقروءة) |
| **F1** منع Firestore من العميل | ⬜ NOT TESTED | ⬜ **NOT TESTED** |

| أخرى | الحالة |
|---|---|
| `A1 A2 A3` | ✅ PASS |
| `B1 B2r` | ✅ PASS — طلب واحد، التكرار مرتبط به |
| `C0 C1 C2 C3 C4` | ✅ PASS — `delivered` · `internal` · `rev 5` · `0` د.أ · بلا شركة |
| `D1 D2` | ✅ PASS — `created=1 edited=1 status_changed=4` |

> **`E1` تحقّق بإثبات فعلي.** `E2` بقي `NOT TESTED` ولن أدّعي غير ذلك — لأن **لم يقرأ أحد الإشعار بعد**.
> **`F1` بقي `NOT TESTED`** — لا يُشتق من وصول الخادم إلى أنه دليل على منع العميل.

## 7. ⏭️ القرار النهائي

# Stage 3 — **PARTIAL**

`E1` اجتاز. الناقص **غير مُثبت بعد**:
- **`E2`** — يقرأ المالك أي إشعار من تبويب «الإشعارات»، ثم يُؤكَّد `read=true` من الخادم.
- **`F1`** — من جلسة عميل حقيقية: محاولة قراءة/كتابة مباشرة على Firestore يجب أن تُرفض بـ`permission-denied`.

عندها فقط ⇒ **Stage 3 PASS**.

## 8. التراجع (عند الحاجة فقط)

```bash
gcloud run services remove-iam-policy-binding ordereventnotice \
  --project=velnix-6c1a2 --region=us-central1 \
  --member="serviceAccount:velnix-runtime-internal@velnix-6c1a2.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```
- يستهدف **Binding واحداً** أُدخل في هذه المهمة فقط
- **يُبقي** كل المدخلات غير المرتبطة سليمة
- أثره: يعيد الدالة إلى حالة «لا إشعارات» — بيانات الطلبات سليمة
- **لم يُنفَّذ التراجع** — الإصلاح يعمل

> ⚠️ لا يُعكس الإصلاح لمجرد بطء Eventarc؛ لا حاجة للتراجع الآن.

## 9. ⛔ ما لم يُنفَّذ

❌ إنشاء/تعديل أي طلب · ❌ إنشاء إشعار يدوياً · ❌ إعادة إنشاء أحداث ·
❌ إعادة نشر Functions أو Hosting · ❌ تعديل قواعد/فهارس Firestore ·
❌ تغيير Auth أو App Check · ❌ تعديل مُشغّلات Eventarc · ❌ IAM لمورد آخر ·
❌ `allUsers` · ❌ تفعيل Push أو Scheduler · ❌ Click Delivery ·
❌ حذف أو إعادة تشغيل أحداث · ❌ دمج PR #1 · ❌ تعديل `main`

**لا أسرار ولا رموز وصول ولا بيانات عملاء في هذا التقرير.**