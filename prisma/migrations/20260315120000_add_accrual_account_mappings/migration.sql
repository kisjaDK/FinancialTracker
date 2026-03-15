CREATE TABLE "AccrualAccountMapping" (
    "id" TEXT NOT NULL,
    "trackingYearId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccrualAccountMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccrualAccountMapping_trackingYearId_resourceType_key" ON "AccrualAccountMapping"("trackingYearId", "resourceType");
CREATE INDEX "AccrualAccountMapping_trackingYearId_resourceType_idx" ON "AccrualAccountMapping"("trackingYearId", "resourceType");

ALTER TABLE "AccrualAccountMapping" ADD CONSTRAINT "AccrualAccountMapping_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;
