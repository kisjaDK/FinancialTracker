CREATE TABLE "StatusDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackingYearId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActiveStatus" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StatusDefinition_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StatusDefinition_trackingYearId_label_key" ON "StatusDefinition"("trackingYearId", "label");
CREATE INDEX "StatusDefinition_trackingYearId_sortOrder_idx" ON "StatusDefinition"("trackingYearId", "sortOrder");
