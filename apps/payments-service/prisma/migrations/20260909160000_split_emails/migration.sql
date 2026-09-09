-- AlterTable
ALTER TABLE "split_bills" ADD COLUMN IF NOT EXISTS "initiatorEmail" TEXT;
ALTER TABLE "split_shares" ADD COLUMN IF NOT EXISTS "payerEmail" TEXT;
