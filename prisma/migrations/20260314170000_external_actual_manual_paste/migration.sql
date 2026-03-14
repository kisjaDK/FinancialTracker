CREATE TABLE "new_ExternalActualImport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackingYearId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL DEFAULT 'CSV',
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedByName" TEXT,
    "importedByEmail" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "entryCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ExternalActualImport_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ExternalActualImport" ("entryCount", "fileName", "id", "importedAt", "importedByEmail", "importedByName", "rowCount", "trackingYearId")
SELECT "entryCount", "fileName", "id", "importedAt", "importedByEmail", "importedByName", "rowCount", "trackingYearId" FROM "ExternalActualImport";
DROP TABLE "ExternalActualImport";
ALTER TABLE "new_ExternalActualImport" RENAME TO "ExternalActualImport";
CREATE INDEX "ExternalActualImport_trackingYearId_importedAt_idx" ON "ExternalActualImport"("trackingYearId", "importedAt");
CREATE INDEX "ExternalActualImport_importedByEmail_importedAt_idx" ON "ExternalActualImport"("importedByEmail", "importedAt");

CREATE TABLE "new_ExternalActualEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackingYearId" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "trackerSeatId" TEXT,
    "sourceKind" TEXT NOT NULL DEFAULT 'CSV',
    "seatId" TEXT NOT NULL,
    "team" TEXT,
    "inSeat" TEXT,
    "description" TEXT,
    "monthIndex" INTEGER NOT NULL,
    "monthLabel" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "originalAmount" REAL,
    "originalCurrency" TEXT,
    "spendPlanId" TEXT,
    "invoiceNumber" TEXT,
    "supplierName" TEXT,
    "rawContent" TEXT,
    "usedForecastAmount" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExternalActualEntry_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExternalActualEntry_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ExternalActualImport" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExternalActualEntry_trackerSeatId_fkey" FOREIGN KEY ("trackerSeatId") REFERENCES "TrackerSeat" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ExternalActualEntry" ("amount", "createdAt", "description", "id", "importId", "inSeat", "monthIndex", "monthLabel", "seatId", "team", "trackerSeatId", "trackingYearId", "usedForecastAmount", "sourceKind", "originalAmount", "originalCurrency")
SELECT "amount", "createdAt", "description", "id", "importId", "inSeat", "monthIndex", "monthLabel", "seatId", "team", "trackerSeatId", "trackingYearId", "usedForecastAmount", 'CSV', "amount", 'DKK' FROM "ExternalActualEntry";
DROP TABLE "ExternalActualEntry";
ALTER TABLE "new_ExternalActualEntry" RENAME TO "ExternalActualEntry";
CREATE INDEX "ExternalActualEntry_trackingYearId_createdAt_idx" ON "ExternalActualEntry"("trackingYearId", "createdAt");
CREATE INDEX "ExternalActualEntry_importId_seatId_monthIndex_idx" ON "ExternalActualEntry"("importId", "seatId", "monthIndex");
CREATE INDEX "ExternalActualEntry_trackerSeatId_monthIndex_idx" ON "ExternalActualEntry"("trackerSeatId", "monthIndex");
