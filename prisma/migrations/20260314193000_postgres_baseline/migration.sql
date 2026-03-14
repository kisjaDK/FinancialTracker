-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('DRAFT', 'APPROVED');

-- CreateEnum
CREATE TYPE "SeatSourceType" AS ENUM ('ROSTER', 'MANUAL');

-- CreateEnum
CREATE TYPE "CurrencyCode" AS ENUM ('DKK', 'EUR', 'USD');

-- CreateEnum
CREATE TYPE "MappingCodeType" AS ENUM ('COST_CENTER', 'DEPARTMENT_CODE');

-- CreateEnum
CREATE TYPE "AppRole" AS ENUM ('GUEST', 'MEMBER', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "ServiceMessageKey" AS ENUM ('INTERNAL_ACTUALS');

-- CreateEnum
CREATE TYPE "StaffingTargetScopeLevel" AS ENUM ('DOMAIN', 'SUB_DOMAIN', 'PROJECT');

-- CreateEnum
CREATE TYPE "ExternalActualSourceKind" AS ENUM ('CSV', 'MANUAL', 'PASTE');

-- CreateTable
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "AppRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAccessScope" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "subDomain" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAccessScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingYear" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "label" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackingYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceMessage" (
    "id" TEXT NOT NULL,
    "trackingYearId" TEXT NOT NULL,
    "key" "ServiceMessageKey" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "trackingYearId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "actorName" TEXT,
    "actorEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusDefinition" (
    "id" TEXT NOT NULL,
    "trackingYearId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActiveStatus" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatusDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetArea" (
    "id" TEXT NOT NULL,
    "trackingYearId" TEXT NOT NULL,
    "domain" TEXT,
    "subDomain" TEXT,
    "funding" TEXT,
    "pillar" TEXT,
    "costCenter" TEXT NOT NULL,
    "projectCode" TEXT NOT NULL,
    "displayName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentMapping" (
    "id" TEXT NOT NULL,
    "trackingYearId" TEXT NOT NULL,
    "codeType" "MappingCodeType" NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "subDomain" TEXT NOT NULL,
    "projectCode" TEXT NOT NULL DEFAULT '',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetMovementBatch" (
    "id" TEXT NOT NULL,
    "trackingYearId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BudgetMovementBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetMovement" (
    "id" TEXT NOT NULL,
    "trackingYearId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "budgetAreaId" TEXT,
    "givingFunding" TEXT,
    "givingPillar" TEXT,
    "amountGiven" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receivingCostCenter" TEXT NOT NULL,
    "receivingProjectCode" TEXT NOT NULL,
    "notes" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "category" TEXT,
    "fbpValidation" TEXT,
    "financeViewAmount" DOUBLE PRECISION,
    "capexTarget" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterImport" (
    "id" TEXT NOT NULL,
    "trackingYearId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'APPROVED',
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedByName" TEXT,
    "importedByEmail" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rowCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RosterImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterPerson" (
    "id" TEXT NOT NULL,
    "trackingYearId" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "seatId" TEXT NOT NULL,
    "domain" TEXT,
    "productLine" TEXT,
    "importError" TEXT,
    "teamName" TEXT,
    "band" TEXT,
    "peoplePortalPositionId" TEXT,
    "resourceName" TEXT,
    "email" TEXT,
    "roleCategory" TEXT,
    "specificRole" TEXT,
    "title" TEXT,
    "status" TEXT,
    "allocation" DOUBLE PRECISION,
    "resourceType" TEXT,
    "vendor" TEXT,
    "dailyRate" DOUBLE PRECISION,
    "lineManager" TEXT,
    "location" TEXT,
    "expectedFunding" TEXT,
    "expectedFunding2025" TEXT,
    "expectedStartDate" TIMESTAMP(3),
    "expectedEndDate" TIMESTAMP(3),
    "fundingType" TEXT,
    "hourlyRate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RosterPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostAssumption" (
    "id" TEXT NOT NULL,
    "trackingYearId" TEXT NOT NULL,
    "band" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "yearlyCost" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostAssumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "trackingYearId" TEXT NOT NULL,
    "currency" "CurrencyCode" NOT NULL,
    "rateToDkk" DOUBLE PRECISION NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalActualImport" (
    "id" TEXT NOT NULL,
    "trackingYearId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sourceKind" "ExternalActualSourceKind" NOT NULL DEFAULT 'CSV',
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedByName" TEXT,
    "importedByEmail" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "entryCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ExternalActualImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalActualEntry" (
    "id" TEXT NOT NULL,
    "trackingYearId" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "trackerSeatId" TEXT,
    "sourceKind" "ExternalActualSourceKind" NOT NULL DEFAULT 'CSV',
    "seatId" TEXT NOT NULL,
    "team" TEXT,
    "inSeat" TEXT,
    "description" TEXT,
    "monthIndex" INTEGER NOT NULL,
    "monthLabel" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "originalAmount" DOUBLE PRECISION,
    "originalCurrency" "CurrencyCode",
    "spendPlanId" TEXT,
    "invoiceNumber" TEXT,
    "supplierName" TEXT,
    "rawContent" TEXT,
    "usedForecastAmount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalActualEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackerSeat" (
    "id" TEXT NOT NULL,
    "trackingYearId" TEXT NOT NULL,
    "budgetAreaId" TEXT,
    "rosterPersonId" TEXT,
    "sourceType" "SeatSourceType" NOT NULL DEFAULT 'ROSTER',
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
    "dailyRate" DOUBLE PRECISION,
    "ritm" TEXT,
    "sow" TEXT,
    "spendPlanId" TEXT,
    "status" TEXT,
    "allocation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackerSeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatMonth" (
    "id" TEXT NOT NULL,
    "trackerSeatId" TEXT NOT NULL,
    "monthIndex" INTEGER NOT NULL,
    "actualAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualAmountRaw" DOUBLE PRECISION,
    "actualCurrency" "CurrencyCode" NOT NULL DEFAULT 'DKK',
    "exchangeRateUsed" DOUBLE PRECISION,
    "forecastOverrideAmount" DOUBLE PRECISION,
    "forecastIncluded" BOOLEAN NOT NULL DEFAULT true,
    "usedForecastAmount" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeatMonth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackerOverride" (
    "id" TEXT NOT NULL,
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
    "allocation" DOUBLE PRECISION,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackerOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffingTarget" (
    "id" TEXT NOT NULL,
    "trackingYearId" TEXT NOT NULL,
    "scopeLevel" "StaffingTargetScopeLevel" NOT NULL,
    "domain" TEXT NOT NULL,
    "subDomain" TEXT,
    "projectCode" TEXT,
    "permTarget" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffingTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");

-- CreateIndex
CREATE INDEX "UserAccessScope_userId_idx" ON "UserAccessScope"("userId");

-- CreateIndex
CREATE INDEX "UserAccessScope_domain_subDomain_idx" ON "UserAccessScope"("domain", "subDomain");

-- CreateIndex
CREATE UNIQUE INDEX "UserAccessScope_userId_domain_subDomain_key" ON "UserAccessScope"("userId", "domain", "subDomain");

-- CreateIndex
CREATE UNIQUE INDEX "TrackingYear_year_key" ON "TrackingYear"("year");

-- CreateIndex
CREATE INDEX "ServiceMessage_trackingYearId_key_idx" ON "ServiceMessage"("trackingYearId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceMessage_trackingYearId_key_key" ON "ServiceMessage"("trackingYearId", "key");

-- CreateIndex
CREATE INDEX "AuditLog_trackingYearId_createdAt_idx" ON "AuditLog"("trackingYearId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorEmail_createdAt_idx" ON "AuditLog"("actorEmail", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "StatusDefinition_trackingYearId_sortOrder_idx" ON "StatusDefinition"("trackingYearId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "StatusDefinition_trackingYearId_label_key" ON "StatusDefinition"("trackingYearId", "label");

-- CreateIndex
CREATE INDEX "BudgetArea_trackingYearId_pillar_idx" ON "BudgetArea"("trackingYearId", "pillar");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetArea_trackingYearId_costCenter_projectCode_key" ON "BudgetArea"("trackingYearId", "costCenter", "projectCode");

-- CreateIndex
CREATE INDEX "DepartmentMapping_trackingYearId_sourceCode_idx" ON "DepartmentMapping"("trackingYearId", "sourceCode");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentMapping_trackingYearId_codeType_sourceCode_subDom_key" ON "DepartmentMapping"("trackingYearId", "codeType", "sourceCode", "subDomain", "projectCode");

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
CREATE INDEX "ExchangeRate_trackingYearId_currency_effectiveDate_idx" ON "ExchangeRate"("trackingYearId", "currency", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_trackingYearId_currency_effectiveDate_key" ON "ExchangeRate"("trackingYearId", "currency", "effectiveDate");

-- CreateIndex
CREATE INDEX "ExternalActualImport_trackingYearId_importedAt_idx" ON "ExternalActualImport"("trackingYearId", "importedAt");

-- CreateIndex
CREATE INDEX "ExternalActualImport_importedByEmail_importedAt_idx" ON "ExternalActualImport"("importedByEmail", "importedAt");

-- CreateIndex
CREATE INDEX "ExternalActualEntry_trackingYearId_createdAt_idx" ON "ExternalActualEntry"("trackingYearId", "createdAt");

-- CreateIndex
CREATE INDEX "ExternalActualEntry_importId_seatId_monthIndex_idx" ON "ExternalActualEntry"("importId", "seatId", "monthIndex");

-- CreateIndex
CREATE INDEX "ExternalActualEntry_trackerSeatId_monthIndex_idx" ON "ExternalActualEntry"("trackerSeatId", "monthIndex");

-- CreateIndex
CREATE UNIQUE INDEX "TrackerSeat_rosterPersonId_key" ON "TrackerSeat"("rosterPersonId");

-- CreateIndex
CREATE INDEX "TrackerSeat_trackingYearId_isActive_idx" ON "TrackerSeat"("trackingYearId", "isActive");

-- CreateIndex
CREATE INDEX "TrackerSeat_trackingYearId_sourceType_isActive_idx" ON "TrackerSeat"("trackingYearId", "sourceType", "isActive");

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

-- CreateIndex
CREATE INDEX "StaffingTarget_trackingYearId_domain_subDomain_projectCode_idx" ON "StaffingTarget"("trackingYearId", "domain", "subDomain", "projectCode");

-- CreateIndex
CREATE UNIQUE INDEX "StaffingTarget_trackingYearId_scopeLevel_domain_subDomain_p_key" ON "StaffingTarget"("trackingYearId", "scopeLevel", "domain", "subDomain", "projectCode");

-- AddForeignKey
ALTER TABLE "UserAccessScope" ADD CONSTRAINT "UserAccessScope_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceMessage" ADD CONSTRAINT "ServiceMessage_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusDefinition" ADD CONSTRAINT "StatusDefinition_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetArea" ADD CONSTRAINT "BudgetArea_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentMapping" ADD CONSTRAINT "DepartmentMapping_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetMovementBatch" ADD CONSTRAINT "BudgetMovementBatch_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetMovement" ADD CONSTRAINT "BudgetMovement_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetMovement" ADD CONSTRAINT "BudgetMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "BudgetMovementBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetMovement" ADD CONSTRAINT "BudgetMovement_budgetAreaId_fkey" FOREIGN KEY ("budgetAreaId") REFERENCES "BudgetArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterImport" ADD CONSTRAINT "RosterImport_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterPerson" ADD CONSTRAINT "RosterPerson_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterPerson" ADD CONSTRAINT "RosterPerson_importId_fkey" FOREIGN KEY ("importId") REFERENCES "RosterImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostAssumption" ADD CONSTRAINT "CostAssumption_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalActualImport" ADD CONSTRAINT "ExternalActualImport_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalActualEntry" ADD CONSTRAINT "ExternalActualEntry_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalActualEntry" ADD CONSTRAINT "ExternalActualEntry_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ExternalActualImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalActualEntry" ADD CONSTRAINT "ExternalActualEntry_trackerSeatId_fkey" FOREIGN KEY ("trackerSeatId") REFERENCES "TrackerSeat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackerSeat" ADD CONSTRAINT "TrackerSeat_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackerSeat" ADD CONSTRAINT "TrackerSeat_budgetAreaId_fkey" FOREIGN KEY ("budgetAreaId") REFERENCES "BudgetArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackerSeat" ADD CONSTRAINT "TrackerSeat_rosterPersonId_fkey" FOREIGN KEY ("rosterPersonId") REFERENCES "RosterPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatMonth" ADD CONSTRAINT "SeatMonth_trackerSeatId_fkey" FOREIGN KEY ("trackerSeatId") REFERENCES "TrackerSeat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackerOverride" ADD CONSTRAINT "TrackerOverride_trackerSeatId_fkey" FOREIGN KEY ("trackerSeatId") REFERENCES "TrackerSeat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffingTarget" ADD CONSTRAINT "StaffingTarget_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

