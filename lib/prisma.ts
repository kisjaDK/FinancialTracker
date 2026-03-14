import { PrismaClient } from "@/lib/generated/prisma/client"

const PRISMA_SCHEMA_VERSION = "2026-03-13-forecast-overrides-v1"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaUrl: string | undefined
  prismaSchemaVersion: string | undefined
}

const prismaUrl = process.env.DATABASE_URL
const cachedPrisma = globalForPrisma.prisma
const supportsFinanceModels =
  cachedPrisma &&
  "trackingYear" in cachedPrisma &&
  "exchangeRate" in cachedPrisma &&
  "budgetArea" in cachedPrisma &&
  "statusDefinition" in cachedPrisma &&
  "serviceMessage" in cachedPrisma &&
  "auditLog" in cachedPrisma &&
  "externalActualImport" in cachedPrisma &&
  "externalActualEntry" in cachedPrisma
const isMatchingSchemaVersion =
  globalForPrisma.prismaSchemaVersion === PRISMA_SCHEMA_VERSION

export const prisma =
  cachedPrisma &&
  globalForPrisma.prismaUrl === prismaUrl &&
  supportsFinanceModels &&
  isMatchingSchemaVersion
    ? cachedPrisma
    : new PrismaClient({
        datasources: prismaUrl
          ? {
              db: {
                url: prismaUrl,
              },
            }
          : undefined,
      })

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
  globalForPrisma.prismaUrl = prismaUrl
  globalForPrisma.prismaSchemaVersion = PRISMA_SCHEMA_VERSION
}
