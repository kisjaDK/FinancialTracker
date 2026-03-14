-- CreateTable
CREATE TABLE "StaffingTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackingYearId" TEXT NOT NULL,
    "scopeLevel" TEXT NOT NULL CHECK ("scopeLevel" IN ('DOMAIN', 'SUB_DOMAIN', 'PROJECT')),
    "domain" TEXT NOT NULL,
    "subDomain" TEXT,
    "projectCode" TEXT,
    "permTarget" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StaffingTarget_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "StaffingTarget_trackingYearId_domain_subDomain_projectCode_idx" ON "StaffingTarget"("trackingYearId", "domain", "subDomain", "projectCode");

-- CreateIndex
CREATE UNIQUE INDEX "StaffingTarget_trackingYearId_scopeLevel_domain_subDomain_projectCode_key" ON "StaffingTarget"("trackingYearId", "scopeLevel", "domain", "subDomain", "projectCode");
