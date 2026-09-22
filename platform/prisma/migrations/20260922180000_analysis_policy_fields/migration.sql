-- حقول سياسة التصنيف: الجهة المستهدفة، والموضوع، والدليل الحرفيّ،
-- وعلامتا «محتوى مختلط» و«نقل نقد»، وسبب الحاجة إلى المراجعة.
--
-- كلّها اختيارية أو بقيمة افتراضية: التحليلات القائمة أُنتجت بسياسة
-- سابقة لا تعرفها، وملؤها بقيمة مخترَعة يجعل القديم يبدو كالجديد. تبقى
-- فارغةً حتى يُعاد التحليل من /admin/analysis.
ALTER TABLE "post_analyses"
  ADD COLUMN "target"             TEXT,
  ADD COLUMN "subject"            TEXT,
  ADD COLUMN "evidence"           TEXT,
  ADD COLUMN "isMixed"            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isRelayedCriticism" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reviewReason"       TEXT;

CREATE INDEX "post_analyses_isMixed_idx" ON "post_analyses"("isMixed");
