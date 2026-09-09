-- CreateTable
CREATE TABLE "activity_items" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "eventId" TEXT NOT NULL,
    "type" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE UNIQUE INDEX "activity_items_eventId_key" ON "activity_items"("eventId");

-- CreateIndex
CREATE INDEX "activity_items_userId_createdAt_idx" ON "activity_items"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "activity_items_type_idx" ON "activity_items"("type");

-- CreateIndex
CREATE INDEX "processed_events_processedAt_idx" ON "processed_events"("processedAt");
