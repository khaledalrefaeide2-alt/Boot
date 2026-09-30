-- مجموعة «النخبة المتعاونة».
--
-- ترحيلٌ جديد لا إضافةٌ إلى سابقه: الترحيل المكتوب لا يُعدَّل بعد دفعه.
-- Prisma تحفظ بصمةً لكلّ ملفّ في `_prisma_migrations`، فتعديلُ ملفٍّ
-- طُبِّق في أيّ قاعدة — ولو قاعدة تطوير — يجعل بصمته لا تطابق المحفوظ،
-- فيتوقّف `migrate deploy` هناك على خطأ لا علاقة له بما يُنشَر.
--
-- والرمز `elite-partners` يجمعها إلى أخواتها من النخبة في أيّ فرزٍ
-- بالرمز، ويبقى مستقلّاً عن `partners` (المنصات المتعاونة).
INSERT INTO "account_groups" ("id", "code", "name", "sortOrder", "status", "updatedAt")
VALUES
  ('grp_elite_partners', 'elite-partners', 'النخبة المتعاونة', 9, 'ACTIVE', NOW())
ON CONFLICT ("code") DO NOTHING;
