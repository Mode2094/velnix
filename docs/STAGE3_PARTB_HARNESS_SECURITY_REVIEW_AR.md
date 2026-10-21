# Velnix — مراجعة أمنية لمِقياس قبول الجزء B

**التاريخ:** 2026-10-17
**الفرع:** `audit/production-readiness`
**خط الأساس:** `d6eb2d78938a9d8c3ad5dd62db3342b879358a58`
**الوسم المعتمد:** `STAGE3_ACCEPTANCE_20261016T214135Z`

> ⛔ **لم يُنفَّذ الجزء B.** لم يُنشأ الطلب الاصطناعي. لم يُنشر شيء ولم تُعدَّل أي خدمة.
> ⛔ **حُذف `scripts/stage3_partb_harness.js` بالكامل.** لم يُعَد استخدام `fetch().then(eval)` في جلسة GM.

---

## 1. الحكم على المِقياس السابق

**كان غير صالح للتنفيذ — والرفض owner's صحيح.** اكتشفتُ **12 عيباً**، 7 منها مؤكَّدة في_TASK و5 اكتشفتها بنفسي.

| # | العيب | الدليل | الأثر |
|---|---|---|---|
| 1 | `joinSession`/`me`/`dashboardStats` بلا `await` | السطر 105/110/125: `call()` تُعيد Promise | `js.ok` = `undefined` ⇒ البوابة تفشل دائماً |
| 2 | وحدات Firebase مُستوردة منفصلة قد لا تتشارك الحالة | لا يوجد دليل ثانٍ على المشاركة | غير مُثبَت |
| 3 | قراءة أحداث قديمة | السطر 192 يقرأ `go2.data.events` المأخوذة **قبل** الانتقالات | لا يُتحقق من `status_changed` |
| 4 | فحص المنع ضعيف | السطر 235: `denied: true` **لأي** خطأ | يقبل `failed-precondition` كمنع |
| 5 | الاستئناف يُعلِّم `PASS` خطأً | السطر 171: `if (o.status !== from) … 'PASS'` | قد يمرّ انتقال لم يُنفَّذ |
| 6 | لا يتوقف عند فشل أمني | السطران 239/250: يسجّل فقط | يكمل اختبارات أمنية بعد انهيار |
| 7 | تقرير الانهيار يضيع contextual | السطر 258: `orderId: null` دائماً | **يفقد معرّف الطلب المنشأ** |
| 8 | **`updateOrder` بحمولة جزئية** | `validateOrderFields` يفرض كل الحقول | **التحرير كان سيفشل دائماً** |
| 9 | **`revision` غير مُرسَل** | يفرض `req.data.revision` تطابق الحالي | **فشل `aborted` دائماً** |
| 10 | قراءة `e.type` | الأحداث تستخدم `action` | `undefined` ⇒ فحص خاطئ |
| 11 | التأكيد على `amountMinor` | DTO يعرض `amount` فقط | `undefined === 0` ⇒ فشل |
| 12 | تجنّب `hasDelivery` | DTO لا يعرضه أصلاً | تحقق مستحيل |

> **الأخطاء 8–11 مكتشفة بالاختبار (§5) وليست بالقراءة فقط.**

---

## 2. البنية المختارة — الخيار B

| الخيار | الحالة | السبب |
|---|---|---|
| A. مسار قبول داخل تطبيق Flutter | ❌ **مرفوض** | يتطلب **نشر Hosting جديد** — غير مصرَّح به |
| **B. المالك يقود واجهة الإنتاج + تحقق خلفي للقراءة فقط** | ✅ **مُختار** | **بدون نشر، وبدون كود في جلسة GM** |
| نقطة اختبار إنتاجية غير مصادَق عليها | ❌ **ممنوعة** | يعيد تقديم الخطر |
| Admin backdoor | ❌ **ممنوع** | — |
| `fetch().then(eval)` | ❔ **مُسحَب** | كود غير مُراجَع في جلسة مُصادَق عليها |

**لم يُعدّال أي شيفرة تطبيق.** هذا مهم: رحلة القبول تمر عبر **مسار واجهة الإنتاج الحقيقي** — وهو ما نريد قبوله أصلاً، لا مساراً جانبياً مكتوباً.

### هل يُستخدم نسخة Firebase المُصادَق عليها الموجودة؟

| السند | الحالة |
|---|---|
| هل يحتاج الـverifier جلسة GM؟ | **لا** — قراءة فقط عبر جلسة gcloud |
| هل ينفّذ المالك الكتابة؟ | **نعم** — عبر **واجهة الإنتاج نفسها** بإصبعه |
| هل تُستخدم نسختي Firebase معاً؟ | **لا longer** — أُزيل المِقياس الذي كان يفعل ذلك |

**الجواب: لم يعد هناك أي كود يفتح جلسة GM.** التفاعل happening في واجهة الإنتاج التي يملكها العميل بالفعل.

---

## 3. العقود المُتحقَّق منها فعلياً (من المصدر، لا بالتخمين)

| الـcallable | العقد الفعلي |
|---|---|
| `joinSession` | بلا payload ⇒ `{status:'approved'\|'pending'\|'disabled'}` |
| `me` | ⇒ `{id,name,role,active,permissions,…}` |
| `dashboardStats` | ⇒ عدّادات |
| `createOrder` | **كل الحقول إلزامية** + `requestKey` بنمط `^[a-zA-Z0-9_-]{16,80}$`. يُنشئ idempotency بـ`sha256(uid+':'+key)` ⇒ **إعادة الاستدعاء تُعيد نفس الطلب**، ودفع مختلف تحت نفس المفتاح ⇒ `already-exists` |
| `getOrder` | ⇒ `{order, events}`؛ DTO فيه **`amount`** ولا `amountMinor`، ولا `hasDelivery`؛ الأحداث فيها **`action`** |
| `updateOrder` | **حمولة كاملة + `revision`** تطابق الحالي ⇒ وإلا `aborted`. يزيد `revision` ويُسجّل `order.edited` |
| `searchOrders` | `{query}` + فلاتر اختيارية؛ بحث بالاسم/الهاتف/المعرّف |
| `changeOrderStatus` | `{id,status}`؛ `delivered` ⇒ `completionSource:'internal'` تلقائياً |
| `listAudit` | ⇒ سجلّكل الطلبات الطلبات المرئية |
| `listNotices` | ⇒ `{items:[{id,orderId,read,…}]}` |
| `markNoticeRead` | `{id}`؛ يقرأ فقط إن كان `recipientId` = المستخدم |

### ثوابت حراسة مُتحقَّق منها
- الخادم يفرض `companyId:null`, `trackingNumber:null`, `remoteStatus:null`, `hasDelivery:false`, `status:'created'`, `revision:0`, `dispatchState:'idle'` — **مُختبَر بت(inputs) مزوَّرة**
- الانتقالات: `created→review→preparing→ready→delivered`؛ `delivered` نهائية — **مُختبَر**
- الحقول `shippingStatus`, `Order_ID`, `collectedAmount`, `companyId`, `trackingNumber`, `status` المرسَلة من العميل **تُتجاهل تماماً**

---

## 4. أداة التحقق الجديدة — للقراءة فقط

`functions/scripts/stage3_partb_verify.js`

| الخاصية | الحالة |
|---|---|
| مسارات كتابة/إنشاء/حذف/استدعاء callable | **صفر** |
| عدد طلبات القراءة | 7 (`GET` فقط) |
| استخراج/طباعة UID أو بريد أو رمز | **لا** — بل لا يُطلب حقل UID أصلاً |
| المشروع مثبَّت في الشيفرة | `velnix-6c1a2` |
| يعمل على الإنتاج | ✅ مُجرَّب: A1–A3 PASS، B1 PASS، الباقي `NOT TESTED` لأن الطلب لم يُنشأ |

### نتيجة التشغيل الحالية (قراءة فقط، بلا كتابة)
```
A1 exactly one generalManager member        PASS   1 member, role=generalManager
A2 GM active and approved                   PASS   active=true approvalStatus=approved
A3 exactly one Auth user, google-linked     PASS   1 user, providers=google.com
B1 exactly one order carries the tag        PASS   0 tagged of 0 total
B2 idempotency records                      NOT TESTED (no order yet)
B3..B6 journey / workflow / audit / notice  NOT TESTED (no order yet)
F1 client-SDK Firestore denial              NOT TESTED (owner browser only)
```

---

## 5. نتائج القبول على المحاكي — 11/11

`functions/test/emulator/stage3_partb_journey.test.js`

| # | الاختبار | النتيجة |
|---|---|---|
| 1 | `signed out cannot reach any protected callable` | ✅ |
| 2 | `authenticated GM passes the gate callables` | ✅ |
| 3 | `non-GM roles are denied GM-only scope` | ✅ |
| 4 | `createOrder forces internal-only fields (forged input ignored)` | ✅ |
| 5 | **`partial updateOrder rejected`** (يثبت العيب 8) | ✅ |
| 6 | `full-payload update with matching revision succeeds, bumps revision` | ✅ |
| 7 | **`client DTO exposes amount, never amountMinor`** (يثبت العيب 11) | ✅ |
| 8 | **`same requestKey never creates a second order`** (3 استدعاءات ⇒ نفس المعرّف) | ✅ |
| 9 | `journey: create, edit, search, four transitions` (revision=5) | ✅ |
| 10 | `terminal internal order refuses further change` | ✅ |
| 11 | `invalid transition target refused` | ✅ |

**المجموعة الكاملة: 79/79** (68 سابقة + 11 جديدة).

### عيوب إضافية وجدتها الاختبارات
| الاكتشاف | التفصيل |
|---|---|
| حدّ `requestKey` | مفروض صارم: 16–80 محرفاً. **اختباراتي الأولى استُعملت بمفاتيح أقصر ورفضها الخادم** — سلوك صحيح |
| رسائل الخطأ | `firebaseError` تُترجم الرموز الداخلية إلى رسائل عربية ⇒ يجب تأكيد **الرمز** لا الرسالة |
| `hasDelivery` | ليس في DTO — يجب تأكيده على السجلّ من جهة الخادم |

---

## 6. الانحدار بعد الإصلاح

| البوابة | النتيجة |
|---|---|
| `dart format` | ✅ 50 ملفاً، 0 تغيير |
| `flutter analyze` | ✅ No issues |
| `check_secrets` | ✅ 425 ملفاً، **0 نتائج** |
| `npm audit --omit=dev` | ✅ **0 ثغرة** |
| وحدات Functions | ✅ **128/128** |
| المحاكي | ✅ **79/79** |
| Flutter | ✅ **329 ناجح** / 18 golden خاصة بـmacOS |

**لم يُضعَّف أي تأكيد أمني. أساس goldens على Linux محفوظ.**

---

## 7. التفاعل الآمن المطلوب من المالك — بدون أي كود

**لا سطر واحد من JavaScript.** كل شيء عبر واجهة الإنتاج.

### الخطوة 0 — تحقّق مسبق (أقرأه أنا)
```bash
cd <velnix-repo>
node functions/scripts/stage3_partb_verify.js
```
يُظهر: GM واحد نشط ومعتمد · مستخدم Auth واحد · **0 طلبات بالوسم** ⇒ آمن للبدء.

### الخطوة 1 — إنشاء الطلب (واجهة الإنتاج)
1. افتح `https://velnix-6c1a2.web.app` وسجّل دخول Google بحساب المدير العام.
2. من **الرئيسية** ⇒ زر **إضافة طلب**.
3. املأ بالحرف:
   | الحقل | القيمة |
   |---|---|
   | اسم المستلم | `STAGE3_ACCEPTANCE_20261016T214135Z` |
   | رقم الهاتف | `0000000000` |
   | المحافظة | `اختبار آلي` |
   | المنطقة | `منطقة اختبار` |
   | العنوان | `TEST ONLY — عنوان اصطناعي للاختبار` |
   | وصف الطرد | `INTERNAL TEST — STAGE3_ACCEPTANCE_20261016T214135Z` |
   | الكمية | `1` |
   | المبلغ | `0.000` |
   | طريقة الدفع | `عند الاستلام` |
   | الملاحظات | `INTERNAL TEST — STAGE3_ACCEPTANCE_20261016T214135Z` |
4. **لا تختر شركة توصيل. لا تضف تتبعاً.** احفظ.

### الخطوة 2 — التعديل
افتح الطلب ⇒ **تعديل** ⇒ غيّر **الملاحظات فقط** إلى:
`INTERNAL TEST EDITED — STAGE3_ACCEPTANCE_20261016T214135Z`
احفظ. **لا تغيّر المبلغ ولا المستلم ولا أي حقل آخر.**

### الخطوة 3 — الانتقالات الأربعة (بالترتيب)
من تفاصيل الطلب، كل مرّة:

| الحالة | الزر |
|---|---|
| `created→review` | تحويل إلى **تحت المراجعة** |
| `review→preparing` | تحويل إلى **قيد التجهيز** |
| `preparing→ready` | تحويل إلى **جاهز** |
| `ready→delivered` | **إكمال الطلب الداخلي** |

في الخطوة الأخيرة ستظهر نافذة **«تأكيد إكمال الطلب الداخلي»** ⇒ اضغط **«تأكيد الإكمال»**.

### الخطوة 4 — الإشعار
تبويب **الإشعارات** ⇒ سيظهر إشعار للطلب ⇒ افتحه (يعلَّم كمقروء).

### الخطوة 5 — تحقّق خلفي (أقرأه أنا)
```bash
node functions/scripts/stage3_partb_verify.js
```

**النتيجة المتوقعة:** `created` + `edited` + `status_changed×4` · `completionSource=internal` · `companyId=null` · لا تتبع · `revision=5` · إشعار واحد مقروء.

---

## 8. اختبار منع Firestore المباشر — يحتاج خطوة منفصلة

المِسند الذي أعدّه **لا يستطيع** ملاحظة سلوك عميل Firestore؛ ذلك يُرى من متصفحك فقط.

**إذا أردت إثباته** (اختياري، بلا كتابة):
افتح **IndexedDB** في DevTools على `velnix-6c1a2.web.app` — لا يمكنني قراءة قيمته. بدل ذلك:

**الطريقة الموصى بها:** بعد الخطوة 4، أخبرني بقراءة الواجهة فقط. إن ظهر خطأ «غير مصرَّح» عند فتح تفاصيل الطلب عبر مسار مباشر فهذا دليل؛ أما الإثبات الإيجابي فيحتاج DevTools.

**أو اتركه `NOT TESTED`** — وهو **الأمين والأدق**. لن أدّعي PASS لشيٍّ لم أره.

---

## 9. حالة CI

| التشغيل | SHA | النتيجة |
|---|---|---|
| Push CI `38999226727` | `ffd6784` | ✅ **success** — 4/4 |
| PR CI `38999230354` | `ffd6784` | ✅ **success** — 4/4 |
| Push CI `38999598131` | `924c3fd` | ✅ **success** — 4/4 *(بعد إعادة تشغيل واحدة — انظر §9.1)* |
| PR CI `38999600739` | `924c3fd` | ✅ **success** — 4/4 |

### 9.1 حادثة CI موثّقة — ليست انحداراً

| البند | التفاصيل |
|---|---|
| المحاولة الأولى | فشل Usage:  [options] [command]

Options:
  -V, --version                                                                     output the version number
  -P, --project <alias_or_project_id>                                               the Firebase project to use for this command
  --account <email>                                                                 the Google account to use for authorization
  -j, --json                                                                        output JSON instead of text, also triggers non-interactive mode
  --token <token>                                                                   DEPRECATED - will be removed in a future major version - supply an auth token for this command
  --non-interactive                                                                 error out of the command instead of waiting for prompts
  -i, --interactive                                                                 force prompts to be displayed
  --debug                                                                           print verbose debug output and keep a debug log file
  -c, --config <path>                                                               path to the firebase.json file to use for configuration
  -h, --help                                                                        display help for command

Commands:
  appdistribution:distribute [options] <release-binary-file>                        upload a release binary and optionally distribute it to testers and run automated tests
  appdistribution:testers:list [group]                                              list testers in project
  appdistribution:testers:add [options] [emails...]                                 add testers to project (and App Distribution group, if specified via flag)
  appdistribution:testers:remove [options] [emails...]                              remove testers from a project (or App Distribution group, if specified via flag)
  appdistribution:groups:list|appdistribution:group:list                            list App Distribution groups
  appdistribution:groups:create|appdistribution:group:create <displayName> [alias]  create an App Distribution group
  appdistribution:groups:delete|appdistribution:group:delete <alias>                delete an App Distribution group
  appdistribution:testcases:export [options] <test-cases-yaml-file>                 export test cases as a YAML file
  appdistribution:testcases:import [options] <test-cases-yaml-file>                 import test cases from YAML file
  apptesting:execute [options] [release-binary-file]                                Run mobile automated tests written in natural language driven by AI
  apps:create [options] [platform] [displayName]                                    create a new Firebase app. [platform] can be IOS, ANDROID or WEB (case insensitive)
  apps:list [platform]                                                              list the registered apps of a Firebase project. Optionally filter apps by [platform]: IOS, ANDROID or WEB (case insensitive)
  apps:init [options] [platform] [appId]                                            automatically download and create config of a Firebase app
  apps:sdkconfig [options] [platform] [appId]                                       print the Google Services config of a Firebase app. [platform] can be IOS, ANDROID or WEB (case insensitive)
  apps:android:sha:list <appId>                                                     list the SHA certificate hashes for a given app id
  apps:android:sha:create <appId> <shaHash>                                         add a SHA certificate hash for a given app id
  apps:android:sha:delete <appId> <shaId>                                           delete a SHA certificate hash for a given app id
  auth:export [options] [dataFile]                                                  export accounts from your Firebase project into a data file
  auth:import [options] [dataFile]                                                  import users into your Firebase project from a data file (.csv or .json)
  crashlytics:symbols:upload [options] <symbolFiles...>                             upload symbols for native code, to symbolicate stack traces
  crashlytics:mappingfile:generateid [options]                                      generate a mapping file id and write it to an Android resource file, which will be built into the app
  crashlytics:mappingfile:upload [options] <mappingFile>                            upload a ProGuard/R8-compatible mapping file to deobfuscate stack traces
  database:get [options] <path>                                                     fetch and print JSON data at the specified path
  database:import [options] <path> [infile]                                         non-atomically import the contents of a JSON file to the specified path in Realtime Database
  database:instances:create [options] <instanceName>                                create a Realtime Database instance
  database:instances:list [options]                                                 list realtime database instances, optionally filtered by a specified location
  database:profile [options]                                                        profile the Realtime Database and generate a usage report
  database:push [options] <path> [infile]                                           add a new JSON object to a list of data in your Firebase
  database:remove [options] <path>                                                  remove data from your Firebase at the specified path
  database:set [options] <path> [infile]                                            store JSON data at the specified path via STDIN, arg, or file
  database:settings:get [options] <path>                                            read the realtime database setting at path
  database:settings:set [options] <path> <value>                                    set the Realtime Database setting at path
  database:update [options] <path> [infile]                                         update some of the keys for the defined path in your Realtime Database
  deploy [options]                                                                  deploy code and assets to your Firebase project
  emulators:exec [options] <script>                                                 start the local Firebase emulators, run a test script, then shut down the emulators
  emulators:export [options] <path>                                                 export data from running emulators
  emulators:start [options]                                                         start the local Firebase emulators
  experiments:list                                                                  list all experiments, along with a description of each experiment and whether it is currently enabled
  experiments:describe <experiment>                                                 describe what an experiment does when enabled
  experiments:enable <experiment>                                                   enable an experiment on this machine
  experiments:disable <experiment>                                                  disable an experiment on this machine
  ext                                                                               display information on how to use ext commands and extensions installed to your project
  ext:configure [options] <extensionInstanceId>                                     configure an existing extension instance
  ext:info [options] <extensionName>                                                display information about an extension by name (extensionName@x.y.z for a specific version)
  ext:export [options]                                                              export all Extension instances installed on a project to a local Firebase directory
  ext:install [options] [extensionRefOrLocalPath]                                   add an extension to firebase.json
  ext:list                                                                          list all the extensions that are installed in your Firebase project
  ext:uninstall [options] <extensionInstanceId>                                     uninstall an extension that is installed in your Firebase project by instance ID
  ext:update [options] <extensionInstanceId> [updateSource]                         update an existing extension instance to the latest version, or to a specific version if provided
  ext:sdk:install [options] <extensionName>                                         get an SDK for this extension. The SDK will be put in the 'generated' directory
  ext:dev:init                                                                      initialize files for writing an extension in the current directory
  ext:dev:list <publisherId>                                                        list all extensions uploaded under publisher ID
  ext:dev:register                                                                  register a publisher ID; run this before publishing your first extension
  ext:dev:deprecate [options] <extensionRef> [versionPredicate]                     deprecate extension versions that match the version predicate
  ext:dev:undeprecate <extensionRef> <versionPredicate>                             undeprecate extension versions that match the version predicate
  ext:dev:upload [options] <extensionRef>                                           upload a new version of an extension
  ext:dev:usage <publisherId>                                                       get usage statistics for an extension
  firestore:delete [options] [path]                                                 delete data from a Cloud Firestore database
  firestore:bulkdelete [options]                                                    managed bulk delete service to delete data from one or more collection groups
  firestore:indexes [options]                                                       list indexes in a Cloud Firestore database
  firestore:locations                                                               list possible locations for your Cloud Firestore database
  firestore:operations:cancel [options] <operationName>                             cancels a long-running Cloud Firestore admin operation
  firestore:operations:describe [options] <operationName>                           retrieves information about a Cloud Firestore admin operation
  firestore:operations:list [options]                                               list pending Cloud Firestore admin operations and their status
  firestore:databases:list                                                          list the Cloud Firestore databases on your project
  firestore:databases:get [database]                                                get information about a Cloud Firestore database
  firestore:databases:create [options] <database>                                   create a database in your Firebase project
  firestore:databases:update [options] <database>                                   update a database in your Firebase project. Must specify at least one property to update
  firestore:databases:delete [options] <database>                                   delete a database in your Cloud Firestore project
  firestore:databases:restore [options]                                             restore a Firestore database from a backup
  firestore:databases:clone [options] <sourceDatabase> <targetDatabase>             clone one Firestore database to another
  firestore:backups:schedules:list [options]                                        list backup schedules under your Cloud Firestore database
  firestore:backups:schedules:create [options]                                      create a backup schedule under your Cloud Firestore database
  firestore:backups:schedules:update [options] <backupSchedule>                     update a backup schedule under your Cloud Firestore database
  firestore:backups:schedules:delete [options] <backupSchedule>                     delete a backup schedule under your Cloud Firestore database
  firestore:backups:list [options]                                                  list all Cloud Firestore backups in a given location
  firestore:backups:get <backup>                                                    get a Cloud Firestore database backup
  firestore:backups:delete [options] <backup>                                       delete a backup under your Cloud Firestore database
  functions:config:clone [options]                                                  clone environment config from another project
  functions:config:export [options]                                                 export environment config as a JSON secret to store in Cloud Secret Manager
  functions:config:get [path]                                                       fetch environment config stored at the given path
  functions:config:set [values...]                                                  set environment config with key=value syntax
  functions:config:unset [keys...]                                                  unset environment config at the specified path(s)
  functions:delete [options] [filters...]                                           delete one or more Cloud Functions by name or group name.
  functions:log [options]                                                           read logs from deployed functions
  functions:shell [options]                                                         launch full Node shell with emulated functions
  functions:list                                                                    list all deployed functions in your Firebase project
  functions:secrets:access <KEY>[@version>                                          access secret value given secret and its version. Defaults to accessing the latest version
  functions:secrets:destroy [options] <KEY>[@version>                               destroy a secret. Defaults to destroying the latest version
  functions:secrets:get <KEY>                                                       get metadata for secret and its versions
  functions:secrets:describe <KEY>                                                  get metadata for secret and its versions. Alias for functions:secrets:get to align with gcloud
  functions:secrets:prune [options]                                                 destroy unused secrets
  functions:secrets:set [options] <KEY>                                             create or update a secret for use in Cloud Functions for Firebase
  functions:artifacts:setpolicy [options]                                           set up a cleanup policy for Cloud Run functions container images in Artifact Registry to automatically delete old function images
  help [command]                                                                    display help information
  hosting:channel:create [options] [channelId]                                      create a Firebase Hosting channel
  hosting:channel:delete [options] <channelId>                                      delete a Firebase Hosting channel
  hosting:channel:deploy [options] [channelId]                                      deploy to a specific Firebase Hosting channel
  hosting:channel:list [options]                                                    list all Firebase Hosting channels for your project
  hosting:channel:open [options] [channelId]                                        opens the URL for a Firebase Hosting channel
  hosting:clone <source> <targetChannel>                                            clone a version from one site to another
  hosting:disable [options]                                                         stop serving web traffic to your Firebase Hosting site
  hosting:sites:create [options] [siteId]                                           create a Firebase Hosting site
  hosting:sites:delete [options] <siteId>                                           delete a Firebase Hosting site
  hosting:sites:get <siteId>                                                        print info about a Firebase Hosting site
  hosting:sites:list                                                                list Firebase Hosting sites
  init [feature]                                                                    interactively configure the current directory as a Firebase project directory
  apphosting:backends:list                                                          list Firebase App Hosting backends
  apphosting:backends:create [options]                                              create a Firebase App Hosting backend
  apphosting:backends:get <backend>                                                 print info about a Firebase App Hosting backend
  apphosting:backends:delete [options] <backend>                                    delete a Firebase App Hosting backend
  apphosting:secrets:set [options] <secretName>                                     create or update a secret for use in Firebase App Hosting
  apphosting:secrets:revokeaccess [options] <secretNames>                           Revoke service accounts, users, or groups permissions from the provided secret(s). Can pass one or more secrets, separated by a comma
  apphosting:secrets:grantaccess [options] <secretNames>                            Grant service accounts, users, or groups permissions to the provided secret(s). Can pass one or more secrets, separated by a comma
  apphosting:secrets:describe <secretName>                                          get metadata for secret and its versions
  apphosting:secrets:access <secretName[@version]>                                  access secret value given secret and its version. Defaults to accessing the latest version
  apphosting:rollouts:create [options] <backendId>                                  create a rollout using a build for an App Hosting backend
  login [options]                                                                   log the CLI into Firebase
  login:add [options] [email]                                                       authorize the CLI for an additional account
  login:ci [options]                                                                generate an access token for use in non-interactive environments
  login:list                                                                        list authorized CLI accounts
  login:use <email>                                                                 set the default account to use for this project directory or the global default account if not in a Firebase project directory
  logout [email]                                                                    log the CLI out of Firebase
  mcp|experimental:mcp                                                              Run the multi-modal conversational platform (MCP) server.
  open [link]                                                                       quickly open a browser to relevant project resources
  projects:addfirebase [projectId]                                                  add Firebase resources to a Google Cloud Platform project
  projects:create [options] [projectId]                                             creates a new Google Cloud Platform project, then adds Firebase resources to the project
  projects:list                                                                     list all Firebase projects you have access to
  remoteconfig:get [options]                                                        get a Firebase project's Remote Config template
  remoteconfig:rollback [options]                                                   roll back a project's published Remote Config template to the one specified by the provided version number
  remoteconfig:versions:list [options]                                              get a list of Remote Config template versions that have been published for a Firebase project
  remoteconfig:rollouts:get <rolloutId>                                             get a Remote Config rollout
  remoteconfig:rollouts:list [options]                                              get a list of Remote Config rollouts.
  remoteconfig:rollouts:delete <rolloutId>                                          delete a Remote Config rollout.
  remoteconfig:experiments:get <experimentId>                                       get a Remote Config experiment.
  remoteconfig:experiments:list [options]                                           get a list of Remote Config experiments
  remoteconfig:experiments:delete <experimentId>                                    delete a Remote Config experiment.
  serve [options]                                                                   start a local server for your static assets
  setup:emulators:database                                                          download the database emulator
  setup:emulators:firestore                                                         download the firestore emulator
  setup:emulators:pubsub                                                            download the pubsub emulator
  setup:emulators:storage                                                           download the storage emulator
  setup:emulators:ui                                                                download the ui emulator
  setup:emulators:dataconnect                                                       download the dataconnect emulator
  dataconnect:execute [options] [file] [operationName]                              execute a SQL Connect query or mutation. If FIREBASE_DATACONNECT_EMULATOR_HOST is set (such as during 'firebase emulator:exec', executes against the emulator instead.
  dataconnect:services:list                                                         list all deployed SQL Connect services
  dataconnect:sql:diff [options]                                                    display the differences between the local SQL Connect schema and your CloudSQL database's schema
  dataconnect:sql:setup [options]                                                   set up your CloudSQL database
  dataconnect:sql:migrate [options]                                                 migrate your CloudSQL database's schema to match your local SQL Connect schema
  dataconnect:sql:grant [options]                                                   grants the SQL role <role> to the provided user or service account <email>
  dataconnect:sql:shell [options]                                                   start a shell connected directly to your SQL Connect service's linked CloudSQL instance
  dataconnect:compile [options]                                                     compile your SQL Connect schema and connector config and GQL files.
  dataconnect:sdk:generate [options]                                                generate typed SDKs to use SQL Connect in your apps
  studio:export [options] [path]                                                    Bootstrap Firebase Studio apps for migration to Antigravity. Run on the unzipped folder from the Firebase Studio download, or directly on the downloaded zip file.
  target [type]                                                                     display configured deploy targets for the current project
  target:apply <type> <name> <resources...>                                         apply a deploy target to a resource
  target:clear <type> <target>                                                      clear all resources from a named resource target
  target:remove <type> <resource>                                                   remove a resource target
  use [options] [alias_or_project_id]                                               set an active Firebase project for your working directory في  — الاختبار  |
| #79 | 78 ناجح / **1 فاشل** من 79 |
| **جذر السبب** | اختبار تزامن معروف عدم استقرار. عند الفشل تُلغى **كلتا** المحاولتين ⇒ عدد الناجحين **0 بدل 1** — **اتجاه آمن (fail-closed)** |
| **ليس انحداراً** | ① نفس الـSHA **نجح** في PR CI بالتوازي · ② هذا الملف **يُنفَّذ أولاً** أبجدياً قبل ملف الاختبار الجديد · ③ ملفي الجديد **لا يحذف ولا يعيد تهيئة** أي حالة مشتركة · ④ **3 تشغيلات محلية متتالية: 79/79** |
| الإجراء | إعادة تشغيل الوظيفة الفاشلة فقط ⇒ نجحت. **موثّق بلا إخفاء** |
| لم يُعدَّل | الاختبار نفسه (تعديله يفرض إضعاف تأكيد أمني) |
---

## 10. هل يمكن تنفيذ الجزء B **بدون نشر جديد**؟

### ✅ **نعم — بالكامل.**

| المتطلب | الحالة |
|---|---|
| نشر Hosting جديد؟ | **لا** — غير مطلوب إطلاقاً |
| تغيير شيفرة التطبيق؟ | **لا** — لا يوجد |
| نشر Functions؟ | **لا** |
| المِيعاد غيّر المخطّط؟ | `updateOrder` يرسل الحمولة الكاملة مع `revision` تلقائياً في الواجهة |

**الوظائف الـ23 المنشورة تحوي كل ما تحتاجه الرحلة** (مُتحقَّق منه سابقاً).

---

## 11. البلوكرات المتبقية

| # | البلوكر | النوع |
|---|---|---|
| 1 | **الرحلة لم تُنفَّذ بعد** — بانتظار خطواتك | ⏸️ إجراء المالك |
| 2 | **إثبات منع Firestore من العميل** غير مرصود | ⏸️ `NOT TESTED` — لا يُدّعى PASS |
| 3 | `firebaseapp.com` سيفشل عند App Check | ⚠️ استخدم `web.app` حصراً |
| 4 | 12 دالة غير منشورة | خارج النطاق |
| 5 | 18 golden خاصة بـmacOS | بيئي — CI المرجع |

---

## 12. ملاحظة أمنية عن الاعتماد

⚠️ اعتماد حساب اختبار Click **نُوقش في محادثة سابقة**. أدعوك لتدويره قبل أي اختبار تكامل مستقبلي. لا علاقة له بهذا الإصلاح.

---

## 13. قرار الانتقال

⛔ **متوقف قبل تنفيذ الإنتاج.** أنتظر:

1. تأكيد أنك فهمت أن الجزء B صار بالكامل في واجهة الإنتاج، بلا أي كود.
2. تنفيذ الخطوات 1–4 في متصفحك.
3. تشغيل `node functions/scripts/stage3_partb_verify.js` وإرسال الناتج.

**لم يُنشأ أي طلب. `orders = 0` · `auditEvents = 1` · `idempotency = 0` · `notices = 0`.**

---

**المراجع:** [الإجراء المعتمد](STAGE3_REAL_GM_ACCEPTANCE.md) · [نتيجة المرحلة 3 الجزء A](STAGE3_REAL_GM_ACCEPTANCE_RESULT_AR.md) · [نتيجة النشر](STAGE2_REAL_HOSTING_DEPLOYMENT_RESULT_AR.md)

---

## 14. تدقيق المُحقِّق — التصحيحات الثمانية المطلوبة

الالتزام `54b5e45` — مُحقِّق مُصلَح.

| # | العيب المُبلَّغ | التصحيح | اختبار |
|---|---|---|---|
| 1 | صفر طلبات = PASS خطأ | `n===0` ⇒ **NOT TESTED** · `n===1` ⇒ **PASS** · `n>1` ⇒ **FAIL** يمنع كل البوابات اللاحقة ولا يرشّح طلباً | 1–3 |
| 2 | قراءة صفحة واحدة فقط | `listAll()` يتبع `nextPageToken` حتى النفاد، **ويرفض الرمز المكرّر** بدل الوثوق به، والتقرير يذكر هل كانت القراءة كاملة | 4–5 |
| 3 | فحص الإشعار PASS غير مشروط | يقرأ `read` الفعلي: لا إشعار ⇒ NOT TESTED · موجود غير مقروء ⇒ NOT TESTED · `read=true` مرصود ⇒ PASS فقط | 6–9 |
| 4 | استخراج المعرّف والمخططات | `documentIdFromName` صارم: `orders/<id>` فقط، وإلا **C0 FAIL**. مخططات الحقول مُثبَّتة باختبارات | 10–13 |
| 5 | مطابقة الرحلة للواجهة | **مُثبَّت من المصدر**: الواجهة ترسل حمولة كاملة + `revision` عند التعديل، وتعرض تأكيد الإكمال الداخلي | 22–23 |
| 6 | **ادّعاء أن الوسم هو `requestKey`** | **كان غير صحيح للواجهة.** الواجهة تولّد `_requestKey` بـ`Random.secure()` لكل نموذج. ادّعاءُ العكس **أُزيل** واختبار يمنع انزلاقه | 21 |
| 7 | تسريب بيانات عملاء | **الطلب الموسوم فقط** هو الموصوف؛ غيره **يُعدّ فقط**. هاتف غير اصطناعي يُبلَّغ `UNEXPECTED` **دون طبع القيمة**؛ لا UID ولا بريد | 13, 18 |
| 8 | اختبارات الانحدار | **23 اختباراً** تغطي صفر/واحد/مكرر، ترقيم الصفحات، إشعار مفقود/غير مقروء/لغيره، مخطّط ناقص، مسار مكتمل، تدقيق نطاقي، قراءات متعثّرة | 1–23 |

### 14.1 اكتشاف مهم — `requestKey`

> **الوسم `STAGE3_ACCEPTANCE_…` ليس هو `requestKey` في مسار الواجهة.**
> الواجهة تولّد مفتاحاً عشوائياً من 30 محرفاً بـ`Random.secure()` **مرة واحدة لكل نموذج**، وتعيد استخدامه عند إعادة الحفظ.
> ⇒ الحماية من التكرار في الواجهة تأتي من **ثبات المفتاح داخل النموذج**، لا من الوسم.
> ⇒ **إذا خرجت من النموذج وأعدت فتحه ⇒ مفتاح جديد ⇒ طلب ثانٍ محتمل.**
> ⇒ لذلك يبقى **فحص التفرّد بالوسم (B1)** هو شبكة الأمان الحقيقية، وقد صار الآن `FAIL` صارماً عند التكرار.

### 14.2 نتيجة المُحقِّق على الإنتاج (قراءة فقط)
```
decision: NOT_EXECUTED · readErrors: none
A1 PASS   1 generalManager of 1 member(s)
A2 PASS   active=true approvalStatus=approved
A3 PASS   1 user(s), providers=google.com
B1 NOT TESTED   0 tagged of 0 order(s) across complete page(s)
B2/B3/B4/B5/B6 NOT TESTED
F1 NOT TESTED   not observable server-side
```

### 14.3 أدلة الاختبار
| المجموعة | النتيجة |
|---|---|
| مُحقِّق (جديد) | **23/23** |
| رحلة الجزء B (جديدة) | **11/11** |
| مجموعة المحاكي الكاملة | **102/102** |
| وحدات Functions | **128/128** |
| ثوابت النشر | **23/23** |
| Flutter | **329 ناجح** / 18 golden خاصة بـmacOS |
| أسرار | **428 ملفاً · 0 نتائج** |
| تدقيق إنتاجي | **0 ثغرة** |

**سلامة المِحقِّق:** لا مسار كتابة/إنشاء/حذف/استدعاء callable · **9 قراءات فقط** · لا UID ولا بريد.

### 14.4 CI للإصلاح
| التشغيل | SHA | النتيجة |
|---|---|---|
| Push `39014309649` | `54b5e45` | ✅ **success** 4/4 |
| PR `39014312777` | `54b5e45` | ✅ **success** 4/4 |

### 14.5 حادثة CI موثّقة — تكرار لنمط معروف

| البند | التفاصيل |
|---|---|
| التشغيل | Push CI `39014683561` عند `99d84b6` — **المحاولة الأولى فشلت** |
| الاختبار | `concurrent REST bootstrap attempts produce exactly one administrator and audit` |
| PR CI لنفس الـSHA | ✅ **نجح** في `39014688038` |
| **جذر السبب** | اختبار تزامن معروف؛ عند الفشل تُلغى **كلتا** المحاولتين ⇒ 0 بدل 1 — **fail-closed** |
| الإجراء | إعادة تشغيل الوظيفة الفاشلة فقط ⇒ نجحت |
| لم يُعدَّل الاختبار | تعديله يفرض إضعاف تأكيد أمني |

> ⚠️ **ملاحظة أمانة مهمة:** حجم المجموعة المحاكي نما من **68 إلى 102 اختباراً** بفضل اختباراتي الجديدة، وزمن التشغيل ما زال نحو 114 ثانية. الاختبار المتزامن **حسّاس للتوقيت**، وإطالة المجموعة تزيد احتمال تعارضه تحت حمل الـrunner. **لم أُخفِ هذا ولم أعدّل الاختبار**، لكنه يُعالَج في عمل هندسي منفصل: تثبيت ترتيب deterministic بدل الاعتماد على `Promise.allSettled` المتزامن — **وليس** بإضعاف التأكيد.
