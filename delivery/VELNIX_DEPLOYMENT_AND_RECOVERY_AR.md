# VELNIX — DEPLOYMENT & RECOVERY

## 1. الهوية والمشروع

- Project: `velnix-6c1a2`
- Hosting: `https://velnix-6c1a2.web.app`
- Region: `europe-west1` (مع `orderEventNotice` في `us-central1`)
- فرع النشر: `audit/production-readiness`
- لا يُدمج PR #1 في `main` دون قبول نهائي.

## 2. النشر

```bash
firebase deploy --only functions --project velnix-6c1a2 --non-interactive
flutter build web --release --no-web-resources-cdn --no-wasm-dry-run \
  --dart-define-from-file=config/firebase.stage3.production.public.json
firebase deploy --only hosting --config firebase.hosting.json \
  --project velnix-6c1a2 --non-interactive
```

- Firestore Rules/Indexes لم تتغير في هذه الجولة.
- لا تنشر `setorder` الإنتاجي أو جدولة المزامنة دون اعتماد مالي وسياسة معدل.

## 3. Scheduler والمزامنة التلقائية

- الوظيفة: `syncClickStatuses` (كل 15 دقيقة، حد 10 طلبات/تشغيل).
- Job: `firebase-schedule-syncClickStatuses-europe-west1`.
- التحقق: `gcloud scheduler jobs describe firebase-schedule-syncClickStatuses-europe-west1 --location=europe-west1 --project=velnix-6c1a2`.
- التشغيل اليدوي: `gcloud scheduler jobs run firebase-schedule-syncClickStatuses-europe-west1 --location=europe-west1 --project=velnix-6c1a2`.
- Feature Flag: `CLICK_SEND_ALLOWED_COMPANY_IDS=click_delivery_1603` (خادمي).

## 4. التحقق بعد النشر

```bash
firebase functions:list --project velnix-6c1a2
gcloud functions describe syncClickOrder --region=europe-west1 --project=velnix-6c1a2
curl -sS https://velnix-6c1a2.web.app/main.dart.js | grep -c syncClickOrder
```

- افتح النظام في Chrome، سجّل الدخول، وافتح `click_e2e_1318368`.
- اضغط «مزامنة حالة Click» وتحقق من آخر مزامنة.
- راجع Cloud Logs لأي `ERROR` جديد.

## 5. النسخ الاحتياطي

| المورد | الحالة |
|---|---|
| PITR | مفعّل — 7 أيام |
| Delete Protection | مفعّل |
| Backup يومي | 7 أيام |
| Backup أسبوعي | 8 أسابيع |
| نسخ READY | نسختان بتاريخ 2026-10-19 |
| GCS Export | `gs://velnix-6c1a2-backups/exports/20261019T102733Z` |
| استرجاع معزول | تم سابقًا في `velnix-recovery-preview` وتطابق 100% |

## 6. التراجع

- Functions: أعد نشر الإصدار السابق من نفس الفرع/الـcommit.
- Hosting: أعد نشر آخر إصدار سليم من `build/web` أو استخدم Release سابق.
- Firestore: لا تسترجع فوق الإنتاج مباشرة؛ استخدم PITR/Backup إلى قاعدة معزولة ثم تحقق.
- إذا كان العطل من `syncClickOrder` فقط، يمكن تعطيل الوظيفة/إزالة الزر دون تعطيل الطلبات.

## 7. الأمان

- لا أسرار في Git أو Flutter.
- App Check Web مستخدم بـreCAPTCHA Enterprise و`minValidScore=0.5`.
- لا تخفض `minValidScore` في الإنتاج إلا لنافذة اختبار موثقة ثم أعده فورًا.
- راجع IAM وKMS وService Accounts قبل أي نشر واسع.
