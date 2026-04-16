-- AlterTable
ALTER TABLE "TrackerSeat" ADD COLUMN "originalStartDate" TIMESTAMP(3);

-- Backfill existing seats so the preserved original start date starts with the current start date.
UPDATE "TrackerSeat"
SET "originalStartDate" = "startDate"
WHERE "originalStartDate" IS NULL
  AND "startDate" IS NOT NULL;
