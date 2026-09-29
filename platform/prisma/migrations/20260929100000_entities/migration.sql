-- الكيانات المذكورة في المنشورات: أشخاص ومؤسسات وأماكن.
--
-- التصنيف يقول «سلبي تجاه الخدمات» ولا يقول من ذُكر. وسؤال «ما قيل عن
-- وزير الكهرباء» لا يُجاب عنه ببحثٍ نصّي: الوزير يُذكر باسمه وبمنصبه
-- وبأخطاء إملائية — فتُجمَع الصور تحت كيانٍ واحد بمفتاحٍ موحَّد.

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('PERSON', 'ORGANIZATION', 'PLACE', 'OTHER');

-- CreateTable
CREATE TABLE "entities" (
    "id"          TEXT NOT NULL,
    "key"         TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "type"        "EntityType" NOT NULL DEFAULT 'OTHER',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "entities_key_key" ON "entities"("key");
CREATE INDEX "entities_type_idx" ON "entities"("type");
CREATE INDEX "entities_lastSeenAt_idx" ON "entities"("lastSeenAt");

-- CreateTable
CREATE TABLE "post_entities" (
    "postId"   TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "mention"  TEXT NOT NULL,

    CONSTRAINT "post_entities_pkey" PRIMARY KEY ("postId", "entityId")
);

-- الفهرس على الكيان وحده: كلّ استعلامات هذه الصفحة تبدأ منه — «كم
-- منشوراً ذُكر فيه» و«أيّ المنشورات». والاتجاه الآخر (منشور ← كياناته)
-- يخدمه المفتاح الأساسي المركّب لأن postId أوّله.
CREATE INDEX "post_entities_entityId_idx" ON "post_entities"("entityId");

-- AddForeignKey
ALTER TABLE "post_entities" ADD CONSTRAINT "post_entities_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_entities" ADD CONSTRAINT "post_entities_entityId_fkey"
  FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
