# Velnix — إجراء المرحلة الأولى الموحد

بعد موافقة المالك المحددة على إنشاء أول مدير، اتبع [إجراء الإنشاء عبر جلسة gcloud](OWNER_BOOTSTRAP_GCLOUD_APPLY_AR.md). يستخدم المستودع الحالي دون ZIP أو ADC login، ويعيد توثيق Google ويجري فحصاً جافاً قبل معاملة Firestore الذرية.

للفحص الجاف وحده يبقى `bash scripts/owner-setup/start.sh moderohe8@gmail.com` دون علم الموافقة. لا يمنح هذا الوضع أي عضوية. فتح Cloud Shell لا يمنح Codex التحكم بجلسة المالك.
