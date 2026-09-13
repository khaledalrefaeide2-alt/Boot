-- CreateEnum
CREATE TYPE "GuidanceScope" AS ENUM ('STANCE', 'SENTIMENT', 'RISK', 'GENERAL');

-- CreateTable
CREATE TABLE "analysis_corrections" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "aiStance" "PostStance",
    "aiSentiment" "Sentiment",
    "aiRiskFlags" "RiskFlag"[] DEFAULT ARRAY[]::"RiskFlag"[],
    "stance" "PostStance",
    "sentiment" "Sentiment",
    "riskFlags" "RiskFlag"[] DEFAULT ARRAY[]::"RiskFlag"[],
    "note" TEXT,
    "embedding" DOUBLE PRECISION[],
    "model" TEXT NOT NULL,
    "dims" INTEGER NOT NULL,
    "correctedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_guidance" (
    "id" TEXT NOT NULL,
    "scope" "GuidanceScope" NOT NULL DEFAULT 'GENERAL',
    "instruction" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analysis_guidance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analysis_corrections_postId_idx" ON "analysis_corrections"("postId");

-- CreateIndex
CREATE INDEX "analysis_corrections_createdAt_idx" ON "analysis_corrections"("createdAt");

-- CreateIndex
CREATE INDEX "analysis_guidance_isActive_sortOrder_idx" ON "analysis_guidance"("isActive", "sortOrder");

-- AddForeignKey
ALTER TABLE "analysis_corrections" ADD CONSTRAINT "analysis_corrections_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_corrections" ADD CONSTRAINT "analysis_corrections_correctedById_fkey" FOREIGN KEY ("correctedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_guidance" ADD CONSTRAINT "analysis_guidance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
