-- CreateEnum
CREATE TYPE "BackfillStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "backfills" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "chunkDays" INTEGER NOT NULL,
    "maxItemsPerChunk" INTEGER NOT NULL,
    "totalChunks" INTEGER NOT NULL,
    "doneChunks" INTEGER NOT NULL DEFAULT 0,
    "failedChunks" INTEGER NOT NULL DEFAULT 0,
    "status" "BackfillStatus" NOT NULL DEFAULT 'RUNNING',
    "itemsSaved" INTEGER NOT NULL DEFAULT 0,
    "itemsFetched" INTEGER NOT NULL DEFAULT 0,
    "stopReason" TEXT,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "backfills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "backfills_accountId_createdAt_idx" ON "backfills"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "backfills_status_createdAt_idx" ON "backfills"("status", "createdAt");

-- AlterTable
ALTER TABLE "extraction_runs" ADD COLUMN     "backfillId" TEXT,
ADD COLUMN     "backfillSeq" INTEGER;

-- CreateIndex
CREATE INDEX "extraction_runs_backfillId_backfillSeq_idx" ON "extraction_runs"("backfillId", "backfillSeq");

-- AddForeignKey
ALTER TABLE "backfills" ADD CONSTRAINT "backfills_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backfills" ADD CONSTRAINT "backfills_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backfills" ADD CONSTRAINT "backfills_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_runs" ADD CONSTRAINT "extraction_runs_backfillId_fkey" FOREIGN KEY ("backfillId") REFERENCES "backfills"("id") ON DELETE SET NULL ON UPDATE CASCADE;
