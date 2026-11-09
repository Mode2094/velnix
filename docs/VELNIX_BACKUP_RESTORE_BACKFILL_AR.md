# Velnix — نسخة احتياطية وإجراءات استعادة قبل الـbackfill

نطاق الـbackfill: حقل `deliveryAccepted` (boolean) فقط على مجموعة `orders`.
**لا يمسّ** `status` / `internalStatus` / `companyId` / `hasDelivery` /
`dispatchState` / مراجع الشحن / المبالغ / أرقام الشحن / سجلات التدقيق.

## 1. نسخة احتياطية (قبل أي كتابة)
```bash
# تصدير المجموعات الحرجة إلى مجلد مؤرّخ (Cloud Storage المتوافق مع Firebase Backup
# أو gcloud firestore export على مشروع velnix-6c1a2).
gcloud firestore export gs://velnix-6c1a2-backups/pret-backfill-$(date +%Y%m%d-%H%M%S) \
  --project=velnix-6c1a2 \
  --collection-ids=orders,auditEvents,companies,companySecrets,members
```
- تحقّق من نجاح التصدير: `gcloud firestore operations list --project=velnix-6c1a2`.

## 2. إثبات عدم التغيير (قبل/بعد)
- لقطة للقراءة فقط: عدد الطلبات وحقولها الحرجة.
```bash
node functions/scripts/backfill_delivery_accepted.js            # dry-run قبل
node functions/scripts/backfill_delivery_accepted.js --apply    # بعد موافقة فقط
# قارن: عدد الطلبات ثابت، deliveryAccepted تغيّر فقط، وكل الحقول الأخرى مطابقة.
```

## 3. الاستعادة (rollback)
- **الأفضل:** الـbackfill إضافي (merge لحقل boolean) ولا يؤثر على أي وظيفة. لا حاجة لاستعادة.
- إن لزم: استعادة المجموعة `orders` من التصدير.
```bash
gcloud firestore import gs://velnix-6c1a2-backups/pret-backfill-<ts> --project=velnix-6c1a2
```
> تحذير: الاستيراد يستبدل المستندات الموجودة؛ لا يُنفَّذ إلا بعد موافقة صريحة ومع إيقاف الكتابة.

## 4. خصائص الأمان المؤكدة في الأداة
- معاملاتية: إعادة قراءة داخل معاملة + رفض الكتابة إن وُجد `deliveryAccepted` مسبقًا (لا كتابة فوق قبول أحدث).
- فعّالة التكرار: تخطّي أي مستند يحمل boolean.
- قابلة للاستئناف: `--start-after=<id>`.
- آمنة الشبكة: تتوقف عند الخطأ وتعرض العدّاد `failed`.

## 5. تنفيذ مصالحة m4Wlx (قراءة فقط)
الطلب `m4WlxZKsRSB7C35tPFy2` بعيد الإرسال غير مؤكد (`needs_review`) ولا يحمل دليل قبول.
- **لا يُصنَّف مقبولًا.** يبقى داخليًا حتى مصالحة يدوية مديرية عبر:
  `functions:reconcileClickShipment` (قراءة getorder فقط) أو
  `functions:resolveDispatchException` بإدخال رقم البوليصة المؤكَّد من بوابة Click.
- أي استدعاء إنتاجي لـClick**يتطلب موافقتك**؛ لم يُنفَّذ.
