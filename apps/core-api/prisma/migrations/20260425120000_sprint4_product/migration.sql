-- EntitlementType: new values
DO $enum$ BEGIN
  ALTER TYPE "EntitlementType" ADD VALUE 'ADMIN_BYPASS';
EXCEPTION
  WHEN duplicate_object THEN null;
END $enum$;

DO $enum2$ BEGIN
  ALTER TYPE "EntitlementType" ADD VALUE 'TRIAL';
EXCEPTION
  WHEN duplicate_object THEN null;
END $enum2$;

-- OutboxStatus enum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

-- User: last event query (cooldown)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastEventQueryAt" TIMESTAMP(3);

-- EventDailyUsage
CREATE TABLE IF NOT EXISTS "EventDailyUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayUtc" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "EventDailyUsage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EventDailyUsage_userId_dayUtc_key" ON "EventDailyUsage"("userId", "dayUtc");
CREATE INDEX IF NOT EXISTS "EventDailyUsage_dayUtc_idx" ON "EventDailyUsage"("dayUtc");
DO $fk1$ BEGIN
  ALTER TABLE "EventDailyUsage" ADD CONSTRAINT "EventDailyUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $fk1$;

-- NotificationOutbox
CREATE TABLE IF NOT EXISTS "NotificationOutbox" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationOutbox_dedupeKey_key" ON "NotificationOutbox"("dedupeKey");
CREATE INDEX IF NOT EXISTS "NotificationOutbox_status_createdAt_idx" ON "NotificationOutbox"("status", "createdAt");
DO $fk2$ BEGIN
  ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $fk2$;
