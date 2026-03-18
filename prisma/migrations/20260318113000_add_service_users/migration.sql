-- CreateTable
CREATE TABLE "ServiceUser" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "role" "AppRole" NOT NULL DEFAULT 'MEMBER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByName" TEXT,
    "createdByEmail" TEXT,
    "deactivatedAt" TIMESTAMP(3),
    "deactivatedByName" TEXT,
    "deactivatedByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceApiKey" (
    "id" TEXT NOT NULL,
    "serviceUserId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "name" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedByName" TEXT,
    "revokedByEmail" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdByName" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceUser_isActive_createdAt_idx" ON "ServiceUser"("isActive", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceApiKey_keyId_key" ON "ServiceApiKey"("keyId");

-- CreateIndex
CREATE INDEX "ServiceApiKey_serviceUserId_createdAt_idx" ON "ServiceApiKey"("serviceUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceApiKey_serviceUserId_revokedAt_idx" ON "ServiceApiKey"("serviceUserId", "revokedAt");

-- AddForeignKey
ALTER TABLE "ServiceApiKey" ADD CONSTRAINT "ServiceApiKey_serviceUserId_fkey" FOREIGN KEY ("serviceUserId") REFERENCES "ServiceUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
