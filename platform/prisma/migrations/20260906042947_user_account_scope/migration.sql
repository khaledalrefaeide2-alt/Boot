-- CreateEnum
CREATE TYPE "AccountAccess" AS ENUM ('ALL', 'ASSIGNED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "accountAccess" "AccountAccess" NOT NULL DEFAULT 'ALL';

-- CreateTable
CREATE TABLE "user_accounts" (
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_accounts_pkey" PRIMARY KEY ("userId","accountId")
);

-- CreateIndex
CREATE INDEX "user_accounts_userId_idx" ON "user_accounts"("userId");

-- CreateIndex
CREATE INDEX "user_accounts_accountId_idx" ON "user_accounts"("accountId");

-- AddForeignKey
ALTER TABLE "user_accounts" ADD CONSTRAINT "user_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_accounts" ADD CONSTRAINT "user_accounts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
