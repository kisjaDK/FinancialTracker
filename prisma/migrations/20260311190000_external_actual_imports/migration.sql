CREATE TABLE "ExternalActualImport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackingYearId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedByName" TEXT,
    "importedByEmail" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "entryCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ExternalActualImport_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ExternalActualEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackingYearId" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "trackerSeatId" TEXT,
    "seatId" TEXT NOT NULL,
    "team" TEXT,
    "inSeat" TEXT,
    "description" TEXT,
    "monthIndex" INTEGER NOT NULL,
    "monthLabel" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExternalActualEntry_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExternalActualEntry_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ExternalActualImport" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExternalActualEntry_trackerSeatId_fkey" FOREIGN KEY ("trackerSeatId") REFERENCES "TrackerSeat" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ExternalActualImport_trackingYearId_importedAt_idx" ON "ExternalActualImport"("trackingYearId", "importedAt");
CREATE INDEX "ExternalActualImport_importedByEmail_importedAt_idx" ON "ExternalActualImport"("importedByEmail", "importedAt");
CREATE INDEX "ExternalActualEntry_trackingYearId_createdAt_idx" ON "ExternalActualEntry"("trackingYearId", "createdAt");
CREATE INDEX "ExternalActualEntry_importId_seatId_monthIndex_idx" ON "ExternalActualEntry"("importId", "seatId", "monthIndex");
CREATE INDEX "ExternalActualEntry_trackerSeatId_monthIndex_idx" ON "ExternalActualEntry"("trackerSeatId", "monthIndex");
