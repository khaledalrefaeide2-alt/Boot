-- التصنيف التلقائي: وسمُ الجولة بمن طلبها، وإعداداتُ المكنسة.

-- CreateEnum
CREATE TYPE "AnalysisRunTrigger" AS ENUM ('MANUAL', 'AUTO');

-- AlterTable
-- الجولات القائمة كلها طلبها إنسان من الشاشة، فالافتراض يصفها وصفاً صحيحاً.
ALTER TABLE "analysis_runs"
  ADD COLUMN "trigger" "AnalysisRunTrigger" NOT NULL DEFAULT 'MANUAL';

-- CreateIndex
-- يخدم حساب سقف اليوم: مجموع ما صنّفته الجولات التلقائية في آخر ٢٤ ساعة.
CREATE INDEX "analysis_runs_trigger_finishedAt_idx" ON "analysis_runs"("trigger", "finishedAt");

-- الإعدادات تُزرع في الترحيل لا في seed وحده.
-- النشر الإنتاجي يشغّل deploy:migrate ولا يشغّل seed على قاعدة قائمة، فصفٌّ
-- يُضاف في seed وحده لا يظهر في شاشة الإعدادات عند المستخدم أبداً — يعمل
-- بقيمته الافتراضية في الشيفرة ولا يجد صاحبُ المنصة مكاناً يغيّره منه.
INSERT INTO "settings" ("key", "value", "category", "label", "description", "updatedAt")
VALUES
  (
    'analysis.auto',
    'true'::jsonb,
    'analysis',
    'التصنيف التلقائي بالذكاء الاصطناعي',
    'يصنّف الذكاء الاصطناعي كل منشور جديد من تلقاء نفسه وفق سياسة التصنيف، بلا تشغيل يدوي. إطفاؤه يُبقي المنشورات «غير محسومة» حتى تُشغَّل جولة من شاشة التحليل الذكي.',
    NOW()
  ),
  (
    'analysis.autoBatch',
    '200'::jsonb,
    'analysis',
    'عدد المنشورات في الجولة التلقائية الواحدة',
    'كم منشوراً تصنّفه المكنسة في كل دورة. الأكبر أسرع في تصفية المتراكم، والأصغر أنعم على حدّ الطلبات لدى المزوّد.',
    NOW()
  ),
  (
    'analysis.dailyCap',
    '3000'::jsonb,
    'analysis',
    'سقف ما يُصنَّف تلقائياً في اليوم',
    'حاجز كلفة: كل منشور استدعاءٌ مدفوع. عند بلوغ السقف تتوقّف المكنسة حتى اليوم التالي، ويبقى التشغيل اليدوي متاحاً. صفر يعني بلا سقف.',
    NOW()
  )
ON CONFLICT ("key") DO NOTHING;
