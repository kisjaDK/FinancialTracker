CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AppUser_role_check" CHECK ("role" IN ('GUEST', 'MEMBER', 'ADMIN', 'SUPER_ADMIN'))
);

CREATE TABLE "UserAccessScope" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "subDomain" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserAccessScope_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");
CREATE INDEX "UserAccessScope_userId_idx" ON "UserAccessScope"("userId");
CREATE INDEX "UserAccessScope_domain_subDomain_idx" ON "UserAccessScope"("domain", "subDomain");
CREATE UNIQUE INDEX "UserAccessScope_userId_domain_subDomain_key" ON "UserAccessScope"("userId", "domain", "subDomain");
