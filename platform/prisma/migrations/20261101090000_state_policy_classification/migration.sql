-- سياسة التصنيف الجديدة: السلبي نقدُ الدولة السورية الجديدة أو مخالفةُ معايير
-- ميتا وحقوق الإنسان. والعمودان فارغان في التحليلات السابقة؛ يُملآن عند
-- إعادة التحليل.

-- CreateEnum
CREATE TYPE "TargetScope" AS ENUM ('NEW_STATE', 'FORMER_REGIME', 'NON_STATE', 'MIXED', 'NONE');

-- CreateEnum
CREATE TYPE "NegativeBasis" AS ENUM ('STATE_CRITICISM', 'POLICY_VIOLATION', 'BOTH');

-- AlterEnum
ALTER TYPE "ContentLabel" ADD VALUE IF NOT EXISTS 'DANGEROUS_ORGANIZATIONS';
ALTER TYPE "ContentLabel" ADD VALUE IF NOT EXISTS 'GRAPHIC_VIOLENCE';
ALTER TYPE "ContentLabel" ADD VALUE IF NOT EXISTS 'PRIVACY_VIOLATION';
ALTER TYPE "ContentLabel" ADD VALUE IF NOT EXISTS 'SEXUAL_EXPLOITATION';
ALTER TYPE "ContentLabel" ADD VALUE IF NOT EXISTS 'DISCRIMINATION';

-- AlterTable
ALTER TABLE "post_analyses" ADD COLUMN "targetScope" "TargetScope",
ADD COLUMN "negativeBasis" "NegativeBasis";
