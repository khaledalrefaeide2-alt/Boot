-- ذاكرة المستخدم — تعليماتٌ يحفظها ليعمل بها المساعد.
--
-- كان في المنصة مستويان من التعليمات: قواعد النظام المكتوبة في الشيفرة،
-- و`analysis_guidance` التي يُقرّها من يملك `taxonomy.manage` فتدخل محرّك
-- التصنيف. ولا شيء بينهما: من أراد «اجعل تقاريري مختصرة» أو «ركّز على
-- قطاع المحروقات» أعادها في كل محادثة.
--
-- والفرق بين هذا الجدول و`analysis_guidance` في الأثر لا في الشكل:
-- التوجيه يُغيّر حكم كلّ منشور قادم في المنصة كلها، وهذه تدخل محادثة
-- صاحبها وحده ولا تمسّ تصنيفاً ولا رقماً. فسقفها أوطأ وإذنها أوسع —
-- ومن أرادها على المنصة كلها (`GLOBAL`) رجع إلى الإذن نفسه.

-- CreateEnum
CREATE TYPE "MemoryKind" AS ENUM ('WORK', 'REPORTING', 'CLASSIFICATION', 'GLOSSARY', 'GENERAL');

-- CreateEnum
CREATE TYPE "MemoryScope" AS ENUM ('USER', 'GLOBAL');

-- CreateEnum
CREATE TYPE "MemoryStatus" AS ENUM ('ACTIVE', 'DISABLED', 'PENDING');

-- CreateTable
CREATE TABLE "user_memories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "kind" "MemoryKind" NOT NULL DEFAULT 'GENERAL',
    "scope" "MemoryScope" NOT NULL DEFAULT 'USER',
    "status" "MemoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "sourceConversationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_memories_pkey" PRIMARY KEY ("id")
);

-- الفهرس الأول يخدم الاستدعاء في كل رسالة: تعليمات هذا المستخدم، المفعّلة
-- وحدها، مرتّبةً بالأولوية. والثاني يخدم التعليمات العامّة التي تُقرأ لكل
-- مستخدم مهما كان صاحبها.
-- CreateIndex
CREATE INDEX "user_memories_userId_status_priority_idx" ON "user_memories"("userId", "status", "priority");

-- CreateIndex
CREATE INDEX "user_memories_scope_status_idx" ON "user_memories"("scope", "status");

-- حذف المستخدم يحذف تعليماته: لا معنى لها بعده، وهي مكتوبة بصيغة المخاطَب.
-- AddForeignKey
ALTER TABLE "user_memories" ADD CONSTRAINT "user_memories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- وحذف المحادثة لا يحذف التعليمة: التعليمة أطول عمراً من الحديث الذي
-- وُلدت فيه، ويبقى أثرها وإن مُحيت محادثته.
-- AddForeignKey
ALTER TABLE "user_memories" ADD CONSTRAINT "user_memories_sourceConversationId_fkey" FOREIGN KEY ("sourceConversationId") REFERENCES "assistant_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
