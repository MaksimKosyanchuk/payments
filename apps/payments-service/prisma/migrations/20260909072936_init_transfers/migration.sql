-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('Pending', 'Held', 'Credited', 'Completed', 'Compensating', 'Failed');

-- CreateEnum
CREATE TYPE "CompensationAction" AS ENUM ('releaseHold', 'refundSender');

-- CreateEnum
CREATE TYPE "SagaStepStatus" AS ENUM ('started', 'succeeded', 'failed', 'compensated', 'skipped');

-- CreateEnum
CREATE TYPE "SplitBillStatus" AS ENUM ('Pending', 'PartiallyPaid', 'Settled', 'Cancelled');

-- CreateEnum
CREATE TYPE "SplitShareStatus" AS ENUM ('Pending', 'Confirmed', 'Paid', 'Overdue', 'Cancelled');

-- CreateTable
CREATE TABLE "transfers" (
    "id" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "fromWalletId" UUID NOT NULL,
    "toWalletId" UUID,
    "toIdentifier" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "fxRate" DECIMAL(18,8),
    "status" "TransferStatus" NOT NULL DEFAULT 'Pending',
    "currentStep" TEXT,
    "holdId" UUID,
    "failureReason" TEXT,
    "compensationAction" "CompensationAction",
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "correlationId" TEXT,
    "initiatorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saga_steps" (
    "id" UUID NOT NULL,
    "sagaId" UUID NOT NULL,
    "step" TEXT NOT NULL,
    "status" "SagaStepStatus" NOT NULL,
    "request" JSONB,
    "response" JSONB,
    "error" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saga_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "split_bills" (
    "id" UUID NOT NULL,
    "initiatorId" UUID NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" "SplitBillStatus" NOT NULL DEFAULT 'Pending',
    "title" TEXT,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "split_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "split_shares" (
    "id" UUID NOT NULL,
    "billId" UUID NOT NULL,
    "payerId" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" "SplitShareStatus" NOT NULL DEFAULT 'Pending',
    "transferId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "split_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_messages" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "outbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transfers_idempotencyKey_key" ON "transfers"("idempotencyKey");

-- CreateIndex
CREATE INDEX "transfers_status_nextRetryAt_idx" ON "transfers"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "transfers_fromWalletId_idx" ON "transfers"("fromWalletId");

-- CreateIndex
CREATE INDEX "transfers_toWalletId_idx" ON "transfers"("toWalletId");

-- CreateIndex
CREATE INDEX "transfers_correlationId_idx" ON "transfers"("correlationId");

-- CreateIndex
CREATE INDEX "saga_steps_sagaId_at_idx" ON "saga_steps"("sagaId", "at");

-- CreateIndex
CREATE INDEX "split_bills_initiatorId_idx" ON "split_bills"("initiatorId");

-- CreateIndex
CREATE INDEX "split_bills_status_dueAt_idx" ON "split_bills"("status", "dueAt");

-- CreateIndex
CREATE INDEX "split_shares_payerId_status_idx" ON "split_shares"("payerId", "status");

-- CreateIndex
CREATE INDEX "split_shares_transferId_idx" ON "split_shares"("transferId");

-- CreateIndex
CREATE UNIQUE INDEX "split_shares_billId_payerId_key" ON "split_shares"("billId", "payerId");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_messages_eventId_key" ON "outbox_messages"("eventId");

-- CreateIndex
CREATE INDEX "outbox_messages_publishedAt_createdAt_idx" ON "outbox_messages"("publishedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "saga_steps" ADD CONSTRAINT "saga_steps_sagaId_fkey" FOREIGN KEY ("sagaId") REFERENCES "transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split_shares" ADD CONSTRAINT "split_shares_billId_fkey" FOREIGN KEY ("billId") REFERENCES "split_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split_shares" ADD CONSTRAINT "split_shares_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
