-- CreateEnum
CREATE TYPE "GuidanceSource" AS ENUM ('MANUAL', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "AnalysisRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "analysis_guidance" ADD COLUMN     "source" "GuidanceSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "sourceMessage" TEXT;

-- AlterTable
-- التوجيهات القائمة أُضيفت يدوياً وهي مفعّلة، فتبقى كما هي.
-- والافتراض الجديد «غير مفعّل» يسري على ما يُنشأ بعد هذا الترحيل وحده.
ALTER TABLE "analysis_guidance" ALTER COLUMN "isActive" SET DEFAULT false;

-- CreateTable
CREATE TABLE "analysis_runs" (
    "id" TEXT NOT NULL,
    "status" "AnalysisRunStatus" NOT NULL DEFAULT 'PENDING',
    "filters" JSONB,
    "reanalyze" BOOLEAN NOT NULL DEFAULT false,
    "total" INTEGER NOT NULL DEFAULT 0,
    "done" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "review" INTEGER NOT NULL DEFAULT 0,
    "flagged" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "requestedById" TEXT,
    "queueJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "analysis_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analysis_runs_status_createdAt_idx" ON "analysis_runs"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
