-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "mediaKey" TEXT;

-- CreateIndex
CREATE INDEX "posts_mediaKey_idx" ON "posts"("mediaKey");
