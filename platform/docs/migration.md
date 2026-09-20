# خطة ترحيل النماذج — من منصة الرصد إلى سلام

مخرج المرحلة 1. تنفّذ فعلياً في **المرحلة 3**، ولا يُكتب أي كود قبل اعتماد هذه
الخطة. مرجعها المعماري [`decisions.md`](decisions.md) — خاصةً `ADR-007` و`ADR-012`.

---

## 1. تصحيح لتقدير سابق

قُدِّرت إعادة تسمية `Post → ExtractedItem` في المرحلة 0 على أنها هجرة خطرة تحتاج
ثلاث مراحل. **التقدير الدقيق أخف من ذلك وأدق منه:**

`ALTER TABLE … RENAME` و`ALTER TYPE … RENAME VALUE` عمليتان على البيانات الوصفية
فقط في PostgreSQL: فوريتان، لا تنسخان صفاً واحداً، وتعملان داخل معاملة. لا خطر
فقد بيانات فيهما أصلاً.

**الخطر الحقيقي في مكان آخر:** Prisma **لا يكتشف إعادة التسمية**. عند تشغيل
`prisma migrate dev` على مخطط أُعيدت فيه تسمية نموذج، يولّد `DROP TABLE` ثم
`CREATE TABLE` — وهذا **يمحو الجدول بالكامل**.

> **القاعدة الملزمة:** كل هجرة إعادة تسمية في هذا المشروع **تُكتب يدوياً**
> بـ `ALTER … RENAME`، ويُتحقق من نتيجتها بـ `prisma migrate diff` قبل الدمج.
> لا يُقبل ملف هجرة مولَّد آلياً يحوي `DROP TABLE` لجدول قائم.

هذا يُعيد ترتيب المخاطر: الخطر ليس في PostgreSQL بل في المولِّد، وعلاجه مراجعة
ملف الهجرة بالعين قبل تنفيذه.

---

## 2. خريطة الترحيل

### 2.1 نماذج تُعاد تسميتها

| الحالي | الجديد | الجدول | الملاحظة |
|---|---|---|---|
| `Post` | `ExtractedItem` | `posts` ← `extracted_items` | العنصر الخام، لا المادة المنشورة |
| `PostKeyword` | `ExtractedItemKeyword` | `post_keywords` ← `extracted_item_keywords` | |
| `PostHashtag` | `ExtractedItemHashtag` | `post_hashtags` ← `extracted_item_hashtags` | |

التعداد `PostType` **يبقى باسمه**: هو يصف شكل المنشور الأصلي على منصته (صورة،
فيديو، رابط)، والتسمية دقيقة في موضعها — `ExtractedItem.postType: PostType`
تُقرأ سليمة.

### 2.2 نماذج تُعاد استخدامها كما هي

| النموذج | الدور في سلام | التعديل |
|---|---|---|
| `Platform` | المنصة التي يُستخرج منها (فيسبوك، إكس، إنستغرام) | لا شيء |
| `Account` | **المصدر** (تأكد، إيكاد، كشاف) | إضافة حقول 2.4 |
| `Topic` | **التصنيف** | لا شيء — `code`, `name`, `color`, `parentId`, `sortOrder` كافية |
| `ExtractionRun` | دورة الاستخراج | لا شيء |
| `User`, `Session`, `PasswordResetToken` | المصادقة | تعديل التعداد 2.5 |
| `AuditLog` | سجل التدقيق | إضافة قيم أحداث جديدة (نصية، بلا هجرة) |
| `Setting` | الإعدادات | إضافة مفاتيح (بيانات، بلا هجرة) |
| `Notification` | تنبيهات التشغيل | لا شيء |

`Account` يحمل أصلاً ما تطلبه مواصفة المصدر تقريباً بالكامل:

| مطلوب في المواصفة | الموجود |
|---|---|
| `apifyActorId` | `actorIdOverride` ✅ |
| `apifyInputConfig` | `actorInputOverride` ✅ |
| `extractionIntervalMinutes` | موجود بالاسم نفسه ✅ |
| `isActive` | موجود ✅ |
| `lastRunAt` | `lastExtractedAt` ✅ |
| `lastSuccessAt` | `lastSuccessfulRunAt` ✅ |
| `platform` / `sourcePageUrl` | `platformId` / `url` ✅ |
| `maxItemsPerRun` (سقف الفوترة) | موجود — **فوق المطلوب** ✅ |

### 2.3 نماذج جديدة

```
FactCheck              المادة المنشورة على سلام
Evidence               دليل مرتبط بمادة أو بإجابة
FactCheckRevision      تاريخ تعديل الحكم بعد النشر
ChatConversation       محادثة
ChatMessage            رسالة (مستخدم أو مساعد)
ChatMessageSource      لقطة ثابتة للمصادر التي عُرضت مع إجابة
ChatFeedback           تقييم إجابة والإبلاغ عنها
ChatUsage              عدّاد يومي لفرض السقف
SourceHealthCheck      صحة المصدر عبر الزمن
```

**لماذا `ChatMessageSource` منفصل عن `Evidence`؟** المصادر التي عُرضت للمستخدم
فعلاً يجب أن تبقى كما عُرضت لحظة الإجابة، ولو تغيّر الدليل أو حُذف بعدها. اللقطة
سجل تاريخي لا مرجع حيّ — وهذا شرط تتبّع المنشأ (`provenance`).

### 2.4 حقول تُضاف

**على `Account` (المصدر):**

| الحقل | النوع | السبب |
|---|---|---|
| `slug` | `String? @unique` | رابط المصدر على الموقع العام |
| `websiteUrl` | `String?` | موقع الجهة، غير رابط صفحتها على المنصة |
| `description` | `String?` | تعريف المصدر للقارئ (`notes` داخلي للفريق) |
| `isFactChecker` | `Boolean @default(false)` | يميّز جهات التحقق عن الحسابات المرصودة — **يمنع خلط المنتجين في القاعدة** |

**على `ExtractedItem`:**

| الحقل | النوع | السبب |
|---|---|---|
| `status` | `ExtractedItemStatus @default(PENDING)` | آلة حالات المراجعة — `FR-EXT-07` |
| `rejectionReason` | `String?` | `FR-REV-06` |
| `canonicalUrl` | `String?` | أولوية ثانية في منع التكرار — `FR-EXT-05` |
| `fingerprint` | `String?` | أولوية ثالثة — `FR-EXT-06` |

> الحقول الحالية `isHidden` و`reviewedAt` و`reviewedById` و`reviewNote` تبقى:
> الأولى إخفاء تشغيلي في الرصد الداخلي، والبقية تخدم `status` الجديد مباشرة.

### 2.5 تعدادات

**جديدة:**

```prisma
enum ExtractedItemStatus { PENDING  APPROVED  REJECTED  CONVERTED }
enum Verdict             { TRUE  FALSE  MISLEADING  UNVERIFIED  NOT_FOUND  UNDER_REVIEW }
enum FactCheckStatus     { DRAFT  PUBLISHED  ARCHIVED }
enum Confidence          { HIGH  MEDIUM  LOW }
enum ChatRole            { USER  ASSISTANT }
```

**معدَّلة — `Role`:**

```sql
ALTER TYPE "Role" RENAME VALUE 'SUPERVISOR' TO 'MODERATOR';
ALTER TYPE "Role" ADD VALUE 'USER';
```

> **مصيدة PostgreSQL:** لا يجوز استعمال قيمة تعداد أُضيفت للتوّ داخل المعاملة
> نفسها التي أضافتها. وPrisma ينفّذ كل ملف هجرة داخل معاملة. لذلك:
> `ALTER TYPE … ADD VALUE 'USER'` **في ملف هجرة مستقل** لا يحوي أي استعمال
> للقيمة. أول استعمال فعلي يأتي وقت التشغيل من التسجيل العام، وهو بعد الهجرة
> بمعاملة أخرى — فلا تعارض.

`UserStatus` لا يتغير، لكن **دلالته تنقسم**:

| الدور | الحالة عند الإنشاء | السبب |
|---|---|---|
| `USER` (تسجيل عام) | `ACTIVE` فوراً | لا معنى لانتظار موافقة على قارئ |
| الأدوار الداخلية | `PENDING` حتى الموافقة | السلوك القائم يبقى |

### 2.6 فهارس جديدة

```
fact_checks.slug                       unique
fact_checks (status, publishedAt desc)
fact_checks.verdict
fact_checks.categoryId
fact_checks.sourceId
fact_checks GIN trgm على title و searchText
extracted_items.status
extracted_items (status, publishedAt desc)
extracted_items.fingerprint
extracted_items (sourceId, externalId)  unique حيث ينطبق
chat_conversations (userId, updatedAt desc)
chat_messages (conversationId, createdAt)
chat_usage (userId, day)               unique
```

`extracted_items` يرث فهارسه الحالية كاملة — ومنها `GIN(gin_trgm_ops)` على
النص، وهو ما يجعل البحث العربي جاهزاً تقنياً منذ اليوم الأول (`ADR-010`).

---

## 3. ترتيب التنفيذ في المرحلة 3

الهجرات صغيرة ومستقلة، وكل واحدة قابلة للتراجع وحدها:

| # | الهجرة | النوع | ملاحظة |
|---|---|---|---|
| 1 | `rename_post_to_extracted_item` | يدوية | `ALTER TABLE … RENAME` × 3 + فهارس وقيود |
| 2 | `rename_supervisor_to_moderator` | يدوية | `ALTER TYPE … RENAME VALUE` |
| 3 | `add_user_role` | يدوية | `ADD VALUE` **وحدها في ملفها** |
| 4 | `add_extracted_item_status` | مولَّدة | أعمدة جديدة بقيم افتراضية |
| 5 | `add_source_public_fields` | مولَّدة | حقول `Account` العامة |
| 6 | `add_fact_check_domain` | مولَّدة | `FactCheck` + `Evidence` + `FactCheckRevision` + تعداداتها |
| 7 | `add_chat_domain` | مولَّدة | نماذج التشات الخمسة |
| 8 | `add_source_health` | مولَّدة | `SourceHealthCheck` |

الهجرات 1–3 يدوية لأن Prisma لا يكتشف إعادة التسمية. الباقي إضافات محضة يولّدها
المولِّد بأمان.

---

## 4. قائمة تحقق قبل كل هجرة

- [ ] نسخة احتياطية من القاعدة، ومسار الاسترجاع مُجرَّب لا مفترض.
- [ ] قراءة ملف الهجرة المولَّد **سطراً سطراً** قبل الدمج.
- [ ] **رفض أي `DROP TABLE` أو `DROP COLUMN` لم يُقصد صراحةً.**
- [ ] `prisma migrate diff` بين المخطط والقاعدة بعد التنفيذ ⇦ لا فرق.
- [ ] تنفيذ على بيئة تجريبية بنسخة من بيانات الإنتاج أولاً.
- [ ] `npm run verify:scope` و`tsc --noEmit` بعد التنفيذ.
- [ ] الهجرة مرحلة نشر مستقلة قبل تشغيل التطبيق (`NFR-OPS-06`).

---

## 5. أثر الترحيل على الكود

إعادة التسمية تمسّ مواضع معروفة مسبقاً، تُحصى قبل البدء لا أثناءه:

| الموضع | الأثر |
|---|---|
| `src/lib/queries/posts.ts` | `prisma.post` ⇦ `prisma.extractedItem` |
| `src/lib/apify/mappers.ts` | `MappedPost` ⇦ `MappedExtractedItem` + سجل المحوّلات |
| `src/lib/extraction/service.ts` | كتابة العناصر بحالة `PENDING` |
| `src/lib/stats.ts`, `src/lib/queries/stats.ts` | تجميعات على الاسم الجديد |
| `src/app/api/posts/**` | مسارات الرصد الداخلي — تبقى وظيفتها |
| `src/components/posts/**` | مكوّنات الرصد الداخلي — تبقى |
| `src/lib/auth/rbac.ts` | `SUPERVISOR` ⇦ `MODERATOR` + مجموعة `USER` المنفصلة |

> مسارات `‎/api/posts` ومكوّنات `components/posts` تخصّ **الرصد الداخلي** وتبقى
> على حالها. مسارات سلام العامة تُبنى مستقلة تحت `(site)` ولا تُحمَّل فوقها.
