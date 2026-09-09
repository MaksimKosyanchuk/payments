-- AlterTable
ALTER TABLE "split_bills" ADD COLUMN IF NOT EXISTS "beneficiaryId" UUID;
ALTER TABLE "split_bills" ADD COLUMN IF NOT EXISTS "beneficiaryEmail" TEXT;
CREATE INDEX IF NOT EXISTS "split_bills_beneficiaryId_idx" ON "split_bills"("beneficiaryId");
