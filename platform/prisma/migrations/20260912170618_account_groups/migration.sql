-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "groupId" TEXT;

-- CreateTable
CREATE TABLE "account_groups" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_groups_code_key" ON "account_groups"("code");

-- CreateIndex
CREATE INDEX "account_groups_status_sortOrder_idx" ON "account_groups"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "accounts_groupId_idx" ON "accounts"("groupId");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "account_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
