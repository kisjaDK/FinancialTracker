CREATE TABLE "ServiceMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackingYearId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServiceMessage_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ServiceMessage_trackingYearId_key_key" ON "ServiceMessage"("trackingYearId", "key");
CREATE INDEX "ServiceMessage_trackingYearId_key_idx" ON "ServiceMessage"("trackingYearId", "key");
