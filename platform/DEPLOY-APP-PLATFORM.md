# النشر على DigitalOcean App Platform باستخدام Docker

ثلاثة مكوّنات من صورة Docker واحدة، وقاعدة بيانات وطابور مُداران خارجها.

> للنشر على خادم افتراضي واحد بدل ذلك (أرخص، وإدارته عليك) انظر [`DEPLOY.md`](DEPLOY.md).

---

## البنية

```
GitHub  →  App Platform يبني Dockerfile مرة واحدة
                │
                ├── web      →  npm run start:prod      (Web Service)
                ├── worker   →  npm run worker:prod     (Worker، نسخة واحدة)
                └── migrate  →  npm run deploy:migrate  (Pre-Deploy Job)
                          │
                          ├── Managed PostgreSQL
                          └── Managed Caching (Valkey)
```

صورة واحدة تخدم الأدوار الثلاثة، ويفرّق بينها **أمر التشغيل** لا محتوى الصورة.

---

## جدول الإعدادات النهائي

### المكوّن `web` — Web Service

| الحقل | القيمة |
|---|---|
| Resource Type | `Web Service` |
| Source Directory | **`platform`** |
| Dockerfile Path | `platform/Dockerfile` |
| Build Command | *(فارغ — البناء داخل Dockerfile)* |
| Run Command | **`npm run start:prod`** |
| HTTP Port | **8080** |
| عنوان الاستماع | `0.0.0.0` — يُمرَّر صراحةً بـ `-H` |
| Health Check Path | **`/api/health`** |
| Instance Count | 1 |
| Output Directory | غير مطلوب |

### المكوّن `worker` — Worker

| الحقل | القيمة |
|---|---|
| Resource Type | `Worker` |
| Source Directory | **`platform`** |
| Dockerfile Path | `platform/Dockerfile` |
| Run Command | **`npm run worker:prod`** |
| HTTP Port | غير مطلوب |
| Health Check | غير مطلوب |
| Instance Count | **1 — ولا تزده** |

> **لماذا نسخة واحدة:** الجدولة الدورية مؤقّت `setInterval` داخل العملية لا
> مهمة طابور. كل نسخة إضافية تُعيد جدولة الحسابات المستحقة كل دقيقة بشكل
> مستقل، فتتكرر عمليات الاستخراج وتُستهلك حصة Apify مرتين.

### المكوّن `migrate` — Pre-Deploy Job

| الحقل | القيمة |
|---|---|
| Resource Type | `Job` بنوع **`PRE_DEPLOY`** |
| Source Directory | **`platform`** |
| Dockerfile Path | `platform/Dockerfile` |
| Run Command (أول نشر) | **`npm run deploy:bootstrap`** |
| Run Command (بعده) | **`npm run deploy:migrate`** |

`deploy:bootstrap` يطبّق الترحيلات **ثم** يبذر البيانات الأولية، ويتوقف عند أول
فشل ولا يبتلعه (مُختبَر: فشل الترحيل يعطي رمز خروج 1 ولا يصل إلى البذر).

---

## متغيرات البيئة

**لا تضع أي قيمة سرّية في ملف داخل المستودع.** السرّية تُضبط في اللوحة بنوع
`SECRET` فتُخزَّن مشفّرة ولا تظهر بعد الحفظ.

| المتغيّر | web | worker | migrate | النطاق | النوع | من أين |
|---|:--:|:--:|:--:|---|---|---|
| `DATABASE_URL` | ✅ | ✅ | ✅ | **BUILD + RUN** | مربوط | `${db.DATABASE_URL}` |
| `SESSION_SECRET` | ✅ | ✅ | ✅ | **BUILD + RUN** | SECRET | `openssl rand -base64 48` |
| `DATABASE_CA_CERT` | ✅ | ✅ | ✅ | **BUILD + RUN** | SECRET | لوحة القاعدة ← Download CA certificate |
| `REDIS_URL` | ✅ | ✅ | — | RUN | مربوط | `${cache.DATABASE_URL}` |
| `APP_URL` | ✅ | — | — | RUN | عام | رابط التطبيق بعد النشر |
| `APIFY_TOKEN` | ✅ | ✅ | — | RUN | SECRET | console.apify.com |
| `NODE_ENV` | ✅ | ✅ | ✅ | BUILD + RUN | عام | `production` |
| `SESSION_TTL_DAYS` | ✅ | — | — | RUN | عام | اختياري (7) |
| `WORKER_CONCURRENCY` | — | ✅ | — | RUN | عام | اختياري (2) |
| `SEED_OWNER_*` | — | — | ✅ | RUN | مختلط | أول نشر فقط |

> **`DATABASE_URL` و `SESSION_SECRET` مطلوبان وقت البناء لا التشغيل فقط.**
> هذا مُختبَر: البناء بدونهما يفشل بـ
> `Failed to collect configuration for /api/accounts/[id]`. اضبط نطاقهما على
> `RUN_AND_BUILD_TIME` وإلا فشل أول نشر.

---

## المنفذ — ترتيب الأولوية

```
APP_PORT   ←  اختيارك الصريح، يغلب كل ما عداه
   ↓
PORT       ←  ما تحقنه App Platform تلقائياً
   ↓
3000       ←  الافتراضي للتطوير المحلي
```

**على App Platform لا تحتاج ضبط شيء:** المنصة تحقن `PORT`، والمشغّل يقرأه.
اضبط `HTTP Port = 8080` في المكوّن فقط.

وعنوان الاستماع `0.0.0.0` يُمرَّر صراحةً — لا يُترك لـ `HOSTNAME` الذي يضبطه
Docker على معرّف الحاوية، فيستمع الخادم على عنوان الحاوية وحده.

---

## TLS مع القاعدة المُدارة

القاعدة المُدارة تفرض TLS بشهادة من سلطة خاصة بها لا يعرفها النظام. المشروع
يتحقق منها تحققاً كاملاً عبر `DATABASE_CA_CERT`، **ولا يوجد فيه أي مسار
يعطّل التحقق** — لا `sslmode=no-verify` ولا `rejectUnauthorized: false` ولا
`NODE_TLS_REJECT_UNAUTHORIZED=0`.

كيف تضبطها:

1. لوحة قاعدة البيانات ← **Connection Details** ← **Download CA certificate**
2. افتح الملف ونسخ محتواه كاملاً (من `-----BEGIN` إلى `-----END`)
3. ضعه في `DATABASE_CA_CERT` بنوع `SECRET` في **المكوّنات الثلاثة**

القيمة تُقبل بثلاث صيغ: PEM كما هو، أو PEM بأسطر مهروبة `\n`، أو نصّه مُرمّزاً
بـ `base64` — لأن حقول البيئة في اللوحات تعادي النصوص متعددة الأسطر.

**مساران مختلفان داخلياً، ولذلك سبب:**

| المسار | الآلية |
|---|---|
| التطبيق والعامل والبذر | `pg` عبر `PrismaPg` ← `{ ca, rejectUnauthorized: true }` |
| ترحيلات Prisma | محرّك مستقل ← معاملات في الرابط: `sslmode=require&sslcert=<ملف>&sslaccept=strict` |

المعاملات في السطر الثاني ليست معاملات libpq المعتادة، وهذا **مُختبَر**:
رابط فيه `sslmode=verify-full&sslrootcert=…` تجاهل الشهادة تماماً، بينما
`sslcert=…&sslaccept=strict` قرأ الملف فعلاً. الدالة `databaseUrlForPrismaCli`
في `src/lib/db-ssl.ts` تبني الرابط الصحيح، وتُعيده كما هو حين لا تكون هناك
شهادة — فيبقى التشغيل المحلي بلا تغيير.

---

## الطابور — Managed Caching

يقبل المشروع `redis://` و **`rediss://`** معاً. TLS يُفعَّل تلقائياً من مخطّط
العنوان، في اتصال التطبيق وفي طوابير BullMQ على السواء (مُختبَر: `rediss://`
ينتج عميلاً بـ `tls` مفعّل والمضيف والمنفذ صحيحان).

> ### ⚠️ سياسة الإخلاء
>
> **اضبط `maxmemory-policy` على `noeviction`** بعد إنشاء الطابور.
>
> الطابور يخزّن بيانات المهام في الذاكرة. أي سياسة إخلاء أخرى تسمح بحذف
> **مهمة استخراج منتظرة** عند امتلاء الذاكرة، فتختفي العملية بلا خطأ ولا أثر
> في السجل. مع `noeviction` تُرفض الكتابة ويظهر العطل صريحاً.
>
> **وهذا لا يكفي وحده:** `noeviction` تمنع الحذف عند الامتلاء، ولا تضمن بقاء
> الطابور عبر إعادة تشغيل الخدمة أو ترقيتها. استمرارية الطابور (AOF أو RDB أو
> ما يعادلهما عند المزوّد) **مسألة مستقلة تحتاج تحققاً منفصلاً في اللوحة**.
> ولم أتحقق منها — لم أنشئ أي مورد.

---

## الخطوات

**١)** أنشئ **Managed PostgreSQL** و**Managed Caching** في المنطقة التي ستضع
فيها التطبيق. اضبط سياسة الإخلاء على `noeviction`.

**٢)** أنشئ التطبيق من المستودع، واختر الفرع، واضبط **Source Directory =
`platform`**. أو استورد [`.do/app.yaml`](.do/app.yaml) مباشرة.

**٣)** اضبط المكوّنات الثلاثة بالجداول أعلاه، واربط القاعدة والطابور.

**٤)** اضبط متغيرات البيئة — انتبه إلى نطاق `BUILD + RUN` للثلاثة المعلّمة.

**٥)** اجعل أمر `migrate` هو `npm run deploy:bootstrap` **لأول نشر فقط**.

**٦)** انشر. ثم:

```
GET https://<تطبيقك>.ondigitalocean.app/api/health   →   200  {"ok":true}
```

**٧)** بعد أول نشر:
- سجّل الدخول وغيّر كلمة المرور من **الملف الشخصي**
- فرّغ `SEED_OWNER_PASSWORD`
- أعد أمر `migrate` إلى `npm run deploy:migrate`
- افحص **لوحة الإدارة ← الإعدادات**: Apify متصل، والطابور «متصل والعامل يسحب المهام»

**٨)** النطاق الخاص لاحقاً: أضفه في **Settings ← Domains**، ثم **حدّث `APP_URL`**
إلى العنوان الجديد — وإلا رُفض تسجيل الدخول منه. لإبقاء الرابطين عاملين معاً
ضع القديم في `APP_ALLOWED_ORIGINS`.

---

## ما لم يُختبَر

| البند | الحالة |
|---|---|
| بناء صورة Docker فعلياً | **لم يُختبَر** — سحب الصور من Docker Hub محجوب في بيئة التطوير. اختُبر بدلاً منه تسلسل مراحل Dockerfile على نسخة نظيفة من المستودع، وقد نجح |
| الاتصال بقاعدة DigitalOcean مُدارة | **لم يُختبَر** — لم تُنشأ أي موارد. اختُبر بناء إعداد TLS ومعاملات الرابط فقط |
| النشر على App Platform | **لم يُنفَّذ** |
| اسم محرّك Valkey وأحجام النسخ في `app.yaml` | **غير مؤكد** — تُراجع في اللوحة |
| استمرارية الطابور عبر إعادة التشغيل | **غير مؤكد** — تحتاج تحققاً في لوحة المزوّد |
