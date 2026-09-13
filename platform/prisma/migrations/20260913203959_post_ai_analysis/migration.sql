-- CreateEnum
CREATE TYPE "PostStance" AS ENUM ('SUPPORTIVE', 'OPPOSED', 'NEUTRAL', 'MIXED', 'UNCLEAR');

-- CreateEnum
CREATE TYPE "RiskFlag" AS ENUM ('INCITEMENT_VIOLENCE', 'SECTARIAN_REGIONAL', 'HATE_SPEECH', 'THREAT', 'PLATFORM_POLICY');

-- CreateEnum
CREATE TYPE "RiskSeverity" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "post_analyses" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "stance" "PostStance" NOT NULL,
    "sentiment" "Sentiment" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "rationale" TEXT NOT NULL,
    "themes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "riskFlags" "RiskFlag"[] DEFAULT ARRAY[]::"RiskFlag"[],
    "riskSeverity" "RiskSeverity" NOT NULL DEFAULT 'NONE',
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "post_analyses_postId_key" ON "post_analyses"("postId");

-- CreateIndex
CREATE INDEX "post_analyses_stance_idx" ON "post_analyses"("stance");

-- CreateIndex
CREATE INDEX "post_analyses_riskSeverity_idx" ON "post_analyses"("riskSeverity");

-- CreateIndex
CREATE INDEX "post_analyses_needsReview_idx" ON "post_analyses"("needsReview");

-- AddForeignKey
ALTER TABLE "post_analyses" ADD CONSTRAINT "post_analyses_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
