-- Receive wallet for split bills; drop unused beneficiary columns.
ALTER TABLE "split_bills" ADD COLUMN IF NOT EXISTS "toWalletId" UUID;

-- Dev-safe: drop bills that never had a receive wallet (cannot pay correctly).
DELETE FROM "split_shares"
WHERE "billId" IN (SELECT id FROM "split_bills" WHERE "toWalletId" IS NULL);
DELETE FROM "split_bills" WHERE "toWalletId" IS NULL;

ALTER TABLE "split_bills" ALTER COLUMN "toWalletId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "split_bills_toWalletId_idx" ON "split_bills"("toWalletId");

DROP INDEX IF EXISTS "split_bills_beneficiaryId_idx";
ALTER TABLE "split_bills" DROP COLUMN IF EXISTS "beneficiaryId";
ALTER TABLE "split_bills" DROP COLUMN IF EXISTS "beneficiaryEmail";
