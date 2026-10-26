# إنشاء أول مدير عام عبر جلسة Cloud Shell

هذا المسار مخصص لموافقة المالك المسجلة لإنشاء عضوية `generalManager` نشطة لحساب `moderohe8@gmail.com` على `velnix-6c1a2` فقط. لا يثبت البريد أو لقطة الشاشة UID للأداة؛ تعيد توثيقه من جلسة Firebase Google موقعة وحديثة، وتطابقه مع سجل Auth الفعلي. لا حسابات اصطناعية ولا إنشاء Auth بكلمة مرور.

من المستودع الموجود في Cloud Shell شغّل الأمر الواحد التالي بعد نجاح CI للنسخة المنشورة:

```bash
test "$(git branch --show-current)" = audit/production-readiness && git pull --ff-only origin audit/production-readiness && bash scripts/owner-setup/start.sh moderohe8@gmail.com --approve-bootstrap
```

افتح Web Preview على المنفذ 8080، ثم اضغط المتابعة باستخدام Google بالحساب المحدد. أوقف المعاينة القديمة أولاً إن بقيت تعمل على المنفذ نفسه. لا يلزم نسخ UID أو token أو تشغيل أمر apply منفصل. لا يصل Codex إلى جلسة Cloud Shell تلقائياً.

## الحماية والتنفيذ

- الوضع الافتراضي بلا `--approve-bootstrap` يظل جافاً. وضع الموافقة يرفض بريد مرشح آخر أو مشغل gcloud غير الحساب المعتمد، ويفشل مع service accounts أو impersonation أو emulator overrides أو صلاحيات ناقصة. لا ADC login ولا مفاتيح إدارة.
- الجرد يرفض عضويات أو إدارة سابقة، lock، حساب Auth آخر أو طلبات قديمة. يعاد فحصه بعد تسجيل Google، ثم ينفذ dry-run القديم. لا تعتمد الأداة على خلو Authentication وحده.
- يتحقق Admin Auth من توقيع ID token والمشروع والإلغاء ووقت الدخول (خمس دقائق) وGoogle والبريد الموثق. داخل مسار الإنشاء يعاد getUser بالـUID نفسه قبل بدء المعاملة وقبل commit، مع رفض التعطيل أو اختلاف البريد أو UID أو مزود Google. خدمات Auth وFirestore منفصلة؛ لا توجد معاملة ذرية تجمعهما، لذا لا يمكن ادعاء قفل تعديل Auth المتزامن مع commit.
- Firestore REST الرسمي: beginTransaction، batchGet للمستندات الثلاثة ضمن transaction، runQuery على members بالمعاملة نفسها، commit، وrollback قبل محاولة commit عند الفشل. HTTPS وquota header وتثبيت الحساب ومنع redirects والمهلة محفوظة. لا اتصال بقاعدة أخرى أو تطبيق دور اعتماد SDK غير مدعوم.
- يُرفض وجود **أي عضوية**، بما فيها مدير عام معطل. تقرأ المعاملة `settings/bootstrapState` و`members/{uid}` و`joinRequests/{uid}`. إن وُجد طلب للمرشح في المسار الداخلي فيجب أن يكون pending؛ الجرد الخارجي الحالي أشد ويشترط خلو طلبات الانضمام كلها.
- commit واحد ينشئ القفل والعضوية وسجل Audit مع `exists:false`، ووقت خادم؛ ويوافق الطلب إن كان موجوداً مع الحفاظ على حقوله الأخرى. الدور وactive وapprovalStatus وauthorizationVersion وبنية العضوية تطابق bootstrap السابق. `permissions:[]` لا ينقص صلاحيات generalManager؛ السياسة الموجودة تمنحه كل الصلاحيات المعروفة بالدور، واختبار الانحدار يؤكد ذلك.
- بعد commit تعاد قراءة العضوية والقفل وAudit من Firestore. لا تعلن الأداة `membershipCreated:true` إلا بعد مطابقة النتيجة. التعارض أو التكرار لا ينشئ مديراً أو Audit إضافياً. لا محاولات تلقائية بعد commit.
- عند فقد استجابة commit أو فشل إثبات القراءة تكون النتيجة `bootstrap_commit_outcome_unknown` و`membershipCreated:null`؛ لا تعني الفشل أو النجاح. تتوقف المعاينة عن إعادة التطبيق، ويلزم فحص المستندات الثلاثة للـUID الفعلي قبل أي تدخل. لا تمسح القفل أو العضوية لتجاوز التوقف.

يلزم للمشغل وصول Auth قراءة، وFirestore get/list/beginTransaction/commit وصلاحيات إنشاء المستندات المطلوبة (وتحديث طلب pending إن وجد) على المشروع المعتمد. لا تمنح الأداة IAM، ولا تفعّل API أو فوترة عند الرفض. لا تغيّر المزودات أو App Check أو قواعد Firestore أو Backend، ولا Deploy أو Click أو Merge.

## أدلة الاختبار وحدودها

اختبارات الوحدة تختبر الهوية والموافقة والعضويات والقفل والرفض والصلاحيات والفشل قبل commit وبعده. اختبارات صفحة المعاينة تختبر حماية Origin/Cookie/CSRF وعدم قبول UID من الطلب، وdry-run قبل apply، وعدم تكرار التطبيق بعد النجاح أو نتيجة غير مؤكدة. اختبارات Firestore emulator تنفذ بروتوكول REST نفسه ومعاملة حقيقية محلية، بما فيها طلبان متزامنان ينتج عنهما مدير واحد وAudit واحد، وserver timestamps وحفظ حقول pending ورفض العضو السابق.

بيئة الاختبار محصورة في loopback وnamespace يبدأ بـdemo؛ لا يُثبت نجاحها إنشاء عضوية على Firebase الحقيقي. أثناء اختبار GET مع معامل transaction ظهر عيب محاكي `Unmapped JavaType: BYTE_STRING`؛ استُبدلت القراءة بـbatchGet الرسمي داخل transaction، واجتازت الاختبارات الفعلية دون رفع مهلة أو تعطيل تحقق.

لا يُعتبر إنشاء المدير أو تسجيل دخوله في تطبيق Velnix المنشور مكتملين قبل ظهور إثبات Firebase الحقيقي واختبار Backend المنشور؛ الأداة لا تنشره.
