-- CreateTable
CREATE TABLE "TrackingYear" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "label" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BudgetArea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackingYearId" TEXT NOT NULL,
    "domain" TEXT,
    "subDomain" TEXT,
    "funding" TEXT,
    "pillar" TEXT,
    "costCenter" TEXT NOT NULL,
    "projectCode" TEXT NOT NULL,
    "displayName" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BudgetArea_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DepartmentMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackingYearId" TEXT NOT NULL,
    "codeType" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "subDomain" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DepartmentMapping_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BudgetMovementBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackingYearId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "BudgetMovementBatch_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BudgetMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackingYearId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "budgetAreaId" TEXT,
    "givingFunding" TEXT,
    "givingPillar" TEXT,
    "amountGiven" REAL NOT NULL DEFAULT 0,
    "receivingCostCenter" TEXT NOT NULL,
    "receivingProjectCode" TEXT NOT NULL,
    "notes" TEXT,
    "effectiveDate" DATETIME,
    "category" TEXT,
    "fbpValidation" TEXT,
    "financeViewAmount" REAL,
    "capexTarget" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BudgetMovement_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BudgetMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "BudgetMovementBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BudgetMovement_budgetAreaId_fkey" FOREIGN KEY ("budgetAreaId") REFERENCES "BudgetArea" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RosterImport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackingYearId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" DATETIME,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "RosterImport_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RosterPerson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackingYearId" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "seatId" TEXT NOT NULL,
    "domain" TEXT,
    "productLine" TEXT,
    "teamName" TEXT,
    "band" TEXT,
    "peoplePortalPositionId" TEXT,
    "resourceName" TEXT,
    "email" TEXT,
    "roleCategory" TEXT,
    "specificRole" TEXT,
    "title" TEXT,
    "status" TEXT,
    "allocation" REAL,
    "resourceType" TEXT,
    "vendor" TEXT,
    "dailyRate" REAL,
    "lineManager" TEXT,
    "location" TEXT,
    "expectedFunding" TEXT,
    "expectedFunding2025" TEXT,
    "expectedStartDate" DATETIME,
    "expectedEndDate" DATETIME,
    "fundingType" TEXT,
    "hourlyRate" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RosterPerson_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RosterPerson_importId_fkey" FOREIGN KEY ("importId") REFERENCES "RosterImport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CostAssumption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackingYearId" TEXT NOT NULL,
    "band" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "yearlyCost" REAL NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CostAssumption_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackingYearId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "rateToDkk" REAL NOT NULL,
    "effectiveDate" DATETIME NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExchangeRate_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrackerSeat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackingYearId" TEXT NOT NULL,
    "budgetAreaId" TEXT,
    "rosterPersonId" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'ROSTER',
    "seatId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "domain" TEXT,
    "subDomain" TEXT,
    "funding" TEXT,
    "pillar" TEXT,
    "costCenter" TEXT,
    "projectCode" TEXT,
    "resourceType" TEXT,
    "team" TEXT,
    "inSeat" TEXT,
    "description" TEXT,
    "band" TEXT,
    "ppid" TEXT,
    "location" TEXT,
    "vendor" TEXT,
    "dailyRate" REAL,
    "ritm" TEXT,
    "sow" TEXT,
    "spendPlanId" TEXT,
    "status" TEXT,
    "allocation" REAL NOT NULL DEFAULT 0,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TrackerSeat_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrackerSeat_budgetAreaId_fkey" FOREIGN KEY ("budgetAreaId") REFERENCES "BudgetArea" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TrackerSeat_rosterPersonId_fkey" FOREIGN KEY ("rosterPersonId") REFERENCES "RosterPerson" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SeatMonth" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackerSeatId" TEXT NOT NULL,
    "monthIndex" INTEGER NOT NULL,
    "actualAmount" REAL NOT NULL DEFAULT 0,
    "actualAmountRaw" REAL,
    "actualCurrency" TEXT NOT NULL DEFAULT 'DKK',
    "exchangeRateUsed" REAL,
    "forecastIncluded" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SeatMonth_trackerSeatId_fkey" FOREIGN KEY ("trackerSeatId") REFERENCES "TrackerSeat" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrackerOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackerSeatId" TEXT NOT NULL,
    "domain" TEXT,
    "subDomain" TEXT,
    "funding" TEXT,
    "pillar" TEXT,
    "budgetAreaId" TEXT,
    "costCenter" TEXT,
    "projectCode" TEXT,
    "resourceType" TEXT,
    "ritm" TEXT,
    "sow" TEXT,
    "spendPlanId" TEXT,
    "status" TEXT,
    "allocation" REAL,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TrackerOverride_trackerSeatId_fkey" FOREIGN KEY ("trackerSeatId") REFERENCES "TrackerSeat" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TrackingYear_year_key" ON "TrackingYear"("year");

-- CreateIndex
CREATE INDEX "BudgetArea_trackingYearId_pillar_idx" ON "BudgetArea"("trackingYearId", "pillar");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetArea_trackingYearId_costCenter_projectCode_key" ON "BudgetArea"("trackingYearId", "costCenter", "projectCode");

-- CreateIndex
CREATE INDEX "BudgetMovementBatch_trackingYearId_importedAt_idx" ON "BudgetMovementBatch"("trackingYearId", "importedAt");

-- CreateIndex
CREATE INDEX "BudgetMovement_trackingYearId_budgetAreaId_idx" ON "BudgetMovement"("trackingYearId", "budgetAreaId");

-- CreateIndex
CREATE INDEX "BudgetMovement_batchId_idx" ON "BudgetMovement"("batchId");

-- CreateIndex
CREATE INDEX "RosterImport_trackingYearId_importedAt_idx" ON "RosterImport"("trackingYearId", "importedAt");

-- CreateIndex
CREATE INDEX "RosterPerson_trackingYearId_seatId_idx" ON "RosterPerson"("trackingYearId", "seatId");

-- CreateIndex
CREATE UNIQUE INDEX "RosterPerson_importId_seatId_key" ON "RosterPerson"("importId", "seatId");

-- CreateIndex
CREATE UNIQUE INDEX "CostAssumption_trackingYearId_band_location_key" ON "CostAssumption"("trackingYearId", "band", "location");

-- CreateIndex
CREATE INDEX "DepartmentMapping_trackingYearId_sourceCode_idx" ON "DepartmentMapping"("trackingYearId", "sourceCode");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentMapping_trackingYearId_codeType_sourceCode_key" ON "DepartmentMapping"("trackingYearId", "codeType", "sourceCode");

-- CreateIndex
CREATE INDEX "ExchangeRate_trackingYearId_currency_effectiveDate_idx" ON "ExchangeRate"("trackingYearId", "currency", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_trackingYearId_currency_effectiveDate_key" ON "ExchangeRate"("trackingYearId", "currency", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "TrackerSeat_rosterPersonId_key" ON "TrackerSeat"("rosterPersonId");

-- CreateIndex
CREATE INDEX "TrackerSeat_trackingYearId_budgetAreaId_idx" ON "TrackerSeat"("trackingYearId", "budgetAreaId");

-- CreateIndex
CREATE INDEX "TrackerSeat_trackingYearId_seatId_idx" ON "TrackerSeat"("trackingYearId", "seatId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackerSeat_trackingYearId_sourceKey_key" ON "TrackerSeat"("trackingYearId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "SeatMonth_trackerSeatId_monthIndex_key" ON "SeatMonth"("trackerSeatId", "monthIndex");

-- CreateIndex
CREATE UNIQUE INDEX "TrackerOverride_trackerSeatId_key" ON "TrackerOverride"("trackerSeatId");
