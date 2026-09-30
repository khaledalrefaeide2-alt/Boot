-- التصنيف التفصيلي: وسومٌ متعدّدة، ودرجة خطورة، وحال الادّعاء.
--
-- كان لكلّ منشور تصنيفٌ واحد (سلبي/إيجابي/محايد) وخمسُ إشارات خطر. و«سلبي»
-- وحدها لا تصف شيئاً: شكوى من خدمة وخطاب كراهية كلاهما سلبي، وبينهما ما
-- بين الرصد والجريمة.
--
-- والوسوم هي ما يفرّق: نقدٌ مشروع أم هدّام، ادّعاءٌ بلا مصدر أم صياغةُ
-- شائعة، إهانةٌ شخصية أم خطاب كراهية يستهدف جماعةً بهويّتها.
--
-- ★ و`riskFlags` و`riskSeverity` تبقيان لا تُحذفان: شاشاتٌ وتنبيهاتٌ
--   قائمة تقرؤهما، وحذفهما يكسرها. وتُشتقّان من الجديد في الشيفرة فلا
--   تتفرّق القراءتان.
--
-- ولا صفٌّ قائم يُمسّ: الأعمدة كلها بقيمة افتراضية، والتحليلات السابقة
-- تُقرأ كما هي (وسومٌ فارغة، وخطورة ٠) حتى يُعاد تصنيفها بقصد.

-- CreateEnum
CREATE TYPE "RumorStatus" AS ENUM ('NONE', 'UNVERIFIED_CLAIM', 'SUSPECTED_RUMOR', 'VERIFIED_MISINFORMATION');

-- CreateEnum
CREATE TYPE "ContentLabel" AS ENUM (
  'CONSTRUCTIVE_CRITICISM', 'DESTRUCTIVE_CRITICISM',
  'UNVERIFIED_CLAIM', 'SUSPECTED_RUMOR', 'VERIFIED_MISINFORMATION', 'MISLEADING_CONTEXT',
  'HATE_SPEECH', 'SECTARIAN_INCITEMENT', 'ETHNIC_INCITEMENT', 'REGIONAL_INCITEMENT',
  'RELIGIOUS_INCITEMENT', 'VIOLENCE_INCITEMENT', 'COLLECTIVE_BLAME',
  'PERSONAL_ATTACK', 'ABUSIVE_LANGUAGE', 'DEFAMATION_RISK', 'UNVERIFIED_ACCUSATION',
  'FEARMONGERING', 'POLARIZATION', 'HARASSMENT', 'THREAT',
  'SARCASM', 'SPAM', 'COORDINATED_CONTENT_SUSPECTED'
);

-- موقف الكاتب ممّا ينقل — حقلٌ جديد لا توسيعٌ للقائم.
--
-- `stance` مقياسُ المنصة المعروض في كل شاشة: الموقف من الجهات والخدمات.
-- وهذا سؤالٌ آخر: أيتبنّى الكاتب ما ينقل أم يسأل عن صحّته أم ينكره؟
--
-- و«لا تصدّقوا الشائعة التي تقول إنّ المصارف ستغلق» منشورٌ ينفي شائعةً لا
-- يروّجها. فلو خُلط الحقلان لصار من يكافح الشائعات مُحصىً في صفّ من يبثّها.
-- CreateEnum
CREATE TYPE "AuthorStance" AS ENUM ('SUPPORTIVE', 'OPPOSED', 'NEUTRAL', 'QUESTIONING', 'REPORTING', 'UNCLEAR');

-- AlterTable
ALTER TABLE "post_analyses" ADD COLUMN "authorStance"         "AuthorStance" NOT NULL DEFAULT 'UNCLEAR';
ALTER TABLE "post_analyses" ADD COLUMN "labels"               "ContentLabel"[] DEFAULT ARRAY[]::"ContentLabel"[];
ALTER TABLE "post_analyses" ADD COLUMN "severityLevel"        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "post_analyses" ADD COLUMN "rumorStatus"          "RumorStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "post_analyses" ADD COLUMN "rumorConfidence"      DOUBLE PRECISION;
ALTER TABLE "post_analyses" ADD COLUMN "hateTargetGroup"      TEXT;
ALTER TABLE "post_analyses" ADD COLUMN "matchedKeywords"      TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "post_analyses" ADD COLUMN "isSarcasm"            BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "post_analyses" ADD COLUMN "isQuoted"             BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "post_analyses" ADD COLUMN "isConstructive"       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "post_analyses" ADD COLUMN "isDestructive"        BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "post_analyses" ADD COLUMN "coordinatedSuspected" BOOLEAN NOT NULL DEFAULT false;
