-- تجميع الأحداث.
--
-- المنشورات تُعرض واحداً واحداً، فيظهر الحدث الواحد خمسين مرّة: خمسون
-- حساباً نقلوا الخبر نفسه، وكلٌّ منها بطاقةٌ مستقلّة تُقرأ من جديد.
-- والموظّف الذي يفتح الشاشة صباحاً لا يريد خمسين بطاقة، يريد أن يعرف أنّ
-- حدثاً واحداً جرى وأنّ خمسين حساباً تناولوه.
--
-- والتجميع على المتّجهات الموجودة أصلاً: لا نداء على المزوّد، ولا كلفة
-- فوق ما دُفع للفهرسة الدلالية.

-- CreateTable
CREATE TABLE "stories" (
    "id"          TEXT NOT NULL,
    "centroid"    DOUBLE PRECISION[],
    "model"       TEXT NOT NULL,
    "dims"        INTEGER NOT NULL,
    "firstPostAt" TIMESTAMP(3) NOT NULL,
    "lastPostAt"  TIMESTAMP(3) NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- الفهرس على آخر منشور: كلّ دورة تجميع تبدأ بانتقاء العناقيد القريبة
-- زمنياً من الدفعة، فلا تُحمَّل عناقيد السنة كلّها لتُقارَن بمنشور اليوم.
CREATE INDEX "stories_lastPostAt_idx" ON "stories"("lastPostAt" DESC);

-- AlterTable
ALTER TABLE "posts" ADD COLUMN "storyId" TEXT;

CREATE INDEX "posts_storyId_idx" ON "posts"("storyId");

-- SET NULL لا CASCADE: حذف عنقودٍ خاطئ لا يجوز أن يحذف منشوراته.
ALTER TABLE "posts" ADD CONSTRAINT "posts_storyId_fkey"
  FOREIGN KEY ("storyId") REFERENCES "stories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- إعدادات التجميع — تُكتب هنا لا في ملفّ البذور وحده.
--
-- الإنتاج يشغّل `prisma migrate deploy` ولا يشغّل البذور، فالإعداد الذي
-- يُكتب في البذور وحدها لا يظهر في شاشة الإعدادات على الخادم أبداً.
INSERT INTO "settings" ("key", "value", "category", "label", "description", "updatedAt")
VALUES
  (
    'stories.auto',
    'true'::jsonb,
    'assistant',
    'تجميع الأحداث تلقائياً',
    'يجمع النظام المنشورات المتقاربة في حدث واحد اعتماداً على الفهرسة الدلالية الموجودة — بلا كلفة إضافية على المزوّد. إطفاؤه يُبقي المنشورات مفرّقة.',
    NOW()
  ),
  (
    'stories.batch',
    '200'::jsonb,
    'assistant',
    'عدد المنشورات في دورة التجميع الواحدة',
    'تعمل المكنسة كل عشر دقائق. الأكبر أسرع في تصفية الأرشيف المتراكم، وأثقل على الذاكرة في الدورة الواحدة.',
    NOW()
  ),
  (
    'stories.threshold',
    '0.72'::jsonb,
    'assistant',
    'عتبة التشابه لضمّ منشور إلى حدث',
    'بين ٠٫٥ و٠٫٩٥. الأعلى يجمع ما تطابق نصّه تقريباً فتكثر الأحداث الصغيرة، والأدنى يجمع المتباعد فيبتلع الحدثُ الواحد ما ليس منه. وتغييرها يؤثّر في التجميع القادم لا فيما جُمّع.',
    NOW()
  ),
  (
    'stories.windowDays',
    '3'::jsonb,
    'assistant',
    'نافذة الحدث بالأيام',
    'لا يُضمّ المنشور إلا إلى حدث جرى خلال هذا العدد من الأيام منه. بلا نافذة يصير «انقطاع الكهرباء» — وهو يتكرّر كل شهر بنصّ متقارب — حدثاً واحداً يمتدّ سنة.',
    NOW()
  )
ON CONFLICT ("key") DO NOTHING;
