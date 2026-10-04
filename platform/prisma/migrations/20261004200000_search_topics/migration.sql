-- مواضيع البحث المحفوظة.
--
-- ★ ولماذا سطرٌ محفوظ لا جدولُ ارتباطٍ كالكلمات المفتاحية؟
--
--   الكلمة المفتاحية تُطابَق لحظةَ الاستيراد وتُربط بالمنشور في
--   `post_keywords`. وثمنُها أنّ ما أُضيف اليوم لا يرى شيئاً ممّا
--   استُورد أمس: الموضوع الجديد يبدأ من الصفر، ولا يجيب عن «ماذا قيل
--   في هذا الموضوع الشهر الماضي؟» — وهو أوّل سؤالٍ يُسأل في منصّة رصد.
--   وتصحيحُ صياغةِ كلمةٍ بعد شهر لا يُصلح ما فات، إلا بمكنسةٍ تعيد
--   الربط على الجدول كلّه.
--
--   والموضوع هنا استعلامٌ يُنفَّذ وقت السؤال: يُحرَّر فتتغيّر نتائجه على
--   التاريخ كلّه في اللحظة نفسها، ولا يحتاج تخزيناً ولا مكنسة.
--
-- والسطر بقواعد الشاشة نفسها — مرادفاتٌ بـ| وعبارةٌ بعلامتين واستبعادٌ
-- بـ- — لا بلغةٍ ثانية: من فتح الموضوع يرى سطراً يفهمه ويعدّله، لا
-- بنيةً مخزَّنة لا يراها إلا من كتب الشاشة.

CREATE TABLE "search_topics" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_topics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "search_topics_name_key" ON "search_topics"("name");
CREATE INDEX "search_topics_status_sortOrder_idx" ON "search_topics"("status", "sortOrder");

ALTER TABLE "search_topics"
  ADD CONSTRAINT "search_topics_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
