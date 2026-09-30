-- مجموعة «النشطاء»، ومعها بقيّة المجموعات التي لم يبذرها ترحيلٌ قطّ.
--
-- المطلوب مجموعةٌ واحدة جديدة. وتبيّن عند إضافتها أنّ المجموعات السبع
-- الأصلية ليست في أيّ ترحيل: ترحيلُ `account_groups` أنشأ الجدول فارغاً،
-- وصفوفُه جاءت من تشغيلٍ يدويّ واحد لـ`npm run setup:db` عند التأسيس.
--
-- فقاعدةٌ تُبنى من الترحيلات وحدها تقوم بلا مجموعةٍ واحدة: لا فلتر، ولا
-- إسناد حساب، ولا قسمٌ في تقرير. والصفوف هنا `ON CONFLICT DO NOTHING`،
-- فلا تمسّ قاعدةً قائمة — وإنّما تُغني الجديدة عن خطوةٍ يدوية تُنسى.
--
-- والمعرّفات نصوصٌ ثابتة لا مولَّدة: الصفّ يُعرف بها إن احتيج، وإعادة
-- تشغيل الترحيل لا تُنشئ شيئاً. والرمز (`code`) هو المفتاح الذي تُبنى
-- عليه الروابط والفلاتر، فتغييرُ الاسم العربي من الإدارة لا يكسر شيئاً.
INSERT INTO "account_groups" ("id", "code", "name", "sortOrder", "status", "updatedAt")
VALUES
  ('grp_owned',           'owned',           'المنصات المملوكة',   1, 'ACTIVE', NOW()),
  ('grp_elite_facebook',  'elite-facebook',  'النخبة فيسبوك',      2, 'ACTIVE', NOW()),
  ('grp_elite_twitter',   'elite-twitter',   'النخبة تويتر',       3, 'ACTIVE', NOW()),
  ('grp_elite_instagram', 'elite-instagram', 'النخبة إنستغرام',    4, 'ACTIVE', NOW()),
  ('grp_partners',        'partners',        'المنصات المتعاونة',  5, 'ACTIVE', NOW()),
  ('grp_ministries',      'ministries',      'وزارات',             6, 'ACTIVE', NOW()),
  ('grp_governorates',    'governorates',    'محافظات',            7, 'ACTIVE', NOW()),
  ('grp_activists',       'activists',       'النشطاء',            8, 'ACTIVE', NOW())
ON CONFLICT ("code") DO NOTHING;
