-- CreateEnum
CREATE TYPE "SeatReferenceValueType" AS ENUM ('VENDOR', 'LOCATION', 'MANAGER');

-- AlterTable
ALTER TABLE "TrackerOverride" ADD COLUMN     "band" TEXT,
ADD COLUMN     "dailyRate" DOUBLE PRECISION,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "inSeat" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "manager" TEXT,
ADD COLUMN     "team" TEXT,
ADD COLUMN     "vendor" TEXT;

-- AlterTable
ALTER TABLE "TrackerSeat" ADD COLUMN     "manager" TEXT;

-- CreateTable
CREATE TABLE "SeatReferenceValue" (
    "id" TEXT NOT NULL,
    "trackingYearId" TEXT NOT NULL,
    "type" "SeatReferenceValueType" NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeatReferenceValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeatReferenceValue_trackingYearId_type_value_idx" ON "SeatReferenceValue"("trackingYearId", "type", "value");

-- CreateIndex
CREATE UNIQUE INDEX "SeatReferenceValue_trackingYearId_type_value_key" ON "SeatReferenceValue"("trackingYearId", "type", "value");

-- AddForeignKey
ALTER TABLE "SeatReferenceValue" ADD CONSTRAINT "SeatReferenceValue_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;
