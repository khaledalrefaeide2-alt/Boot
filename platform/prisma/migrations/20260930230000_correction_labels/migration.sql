-- التصحيح يشمل الوسوم والخطورة.
--
-- كان المراجع يرى «تحريض على العنف» و«خطورة ٥» ولا يستطيع تصحيح أيّهما —
-- يغيّر «سلبي» إلى «محايد» فقط. وأثرُه أبعد من الواجهة: نظام التعلّم
-- يبني أمثلته من `analysis_corrections`، فما لا يُصحَّح لا يُتعلَّم منه.
-- فالمحرّك الجديد كان يعمل بلا حلقة تغذية راجعة أصلاً.
--
-- ★ و`severityLevel` يقبل NULL عمداً.
--
--   الصفر حكمٌ («لا مشكلة») وNULL غيابُ حكم («لم يُصحَّح»). ولو جُعل
--   الافتراضُ صفراً لصار كلّ تصحيحٍ لا يمسّ الخطورة يُقرأ تخفيضاً لها —
--   فيتعلّم النموذج من مئات الأمثلة أنّ كلّ ما راجعه إنسان بلا خطر.
--
--   والمصفوفة الفارغة تحتمل المعنيين كذلك، فيفرّق بينهما `labelsTouched`.

-- AlterTable
ALTER TABLE "analysis_corrections" ADD COLUMN "aiLabels"        "ContentLabel"[] DEFAULT ARRAY[]::"ContentLabel"[];
ALTER TABLE "analysis_corrections" ADD COLUMN "aiSeverityLevel" INTEGER;
ALTER TABLE "analysis_corrections" ADD COLUMN "labels"          "ContentLabel"[] DEFAULT ARRAY[]::"ContentLabel"[];
ALTER TABLE "analysis_corrections" ADD COLUMN "severityLevel"   INTEGER;
ALTER TABLE "analysis_corrections" ADD COLUMN "labelsTouched"   BOOLEAN NOT NULL DEFAULT false;
