ALTER TABLE "split_bills" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "split_bills_idempotencyKey_key" ON "split_bills"("idempotencyKey");
