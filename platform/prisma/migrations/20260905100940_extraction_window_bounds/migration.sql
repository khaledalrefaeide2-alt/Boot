-- AlterTable
ALTER TABLE "extraction_runs" ADD COLUMN     "windowFrom" TIMESTAMP(3),
ADD COLUMN     "windowTo" TIMESTAMP(3);
