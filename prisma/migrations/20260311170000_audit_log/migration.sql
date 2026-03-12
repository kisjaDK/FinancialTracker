CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackingYearId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "actorName" TEXT,
    "actorEmail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "AuditLog_trackingYearId_createdAt_idx" ON "AuditLog"("trackingYearId", "createdAt");
CREATE INDEX "AuditLog_actorEmail_createdAt_idx" ON "AuditLog"("actorEmail", "createdAt");
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");
