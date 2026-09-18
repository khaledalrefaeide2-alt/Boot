-- AlterTable
ALTER TABLE "extraction_runs" ADD COLUMN     "fetchedFrom" TIMESTAMP(3),
ADD COLUMN     "fetchedTo" TIMESTAMP(3);
