import { PrismaClient } from "@prisma/client"

const PRISMA_SCHEMA_VERSION = "2026-03-20-department-mapping-teams-v1"

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
  "externalActualEntry" in cachedPrisma &&
  "accrualAccountMapping" in cachedPrisma &&
  "serviceUser" in cachedPrisma &&
  "serviceApiKey" in cachedPrisma &&
  "featureRequest" in cachedPrisma &&
  "featureRequestVote" in cachedPrisma &&
  "seatReferenceValue" in cachedPrisma
const isMatchingSchemaVersion =
  globalForPrisma.prismaSchemaVersion === PRISMA_SCHEMA_VERSION

function createPrismaClient() {
  return new PrismaClient({
    datasources: prismaUrl
      ? {
          db: {
            url: prismaUrl,
          },
        }
      : undefined,
  })
}

export function getPrismaClient() {
  const globalPrisma = globalForPrisma.prisma
  const globalSupportsFinanceModels =
    globalPrisma &&
    "trackingYear" in globalPrisma &&
    "exchangeRate" in globalPrisma &&
    "budgetArea" in globalPrisma &&
    "statusDefinition" in globalPrisma &&
    "serviceMessage" in globalPrisma &&
    "auditLog" in globalPrisma &&
    "externalActualImport" in globalPrisma &&
    "externalActualEntry" in globalPrisma &&
    "accrualAccountMapping" in globalPrisma &&
    "serviceUser" in globalPrisma &&
    "serviceApiKey" in globalPrisma &&
    "featureRequest" in globalPrisma &&
    "featureRequestVote" in globalPrisma &&
    "seatReferenceValue" in globalPrisma
  const globalMatchesSchemaVersion =
    globalForPrisma.prismaSchemaVersion === PRISMA_SCHEMA_VERSION

  const client =
    globalPrisma &&
    globalForPrisma.prismaUrl === prismaUrl &&
    globalSupportsFinanceModels &&
    globalMatchesSchemaVersion
      ? globalPrisma
      : createPrismaClient()

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client
    globalForPrisma.prismaUrl = prismaUrl
    globalForPrisma.prismaSchemaVersion = PRISMA_SCHEMA_VERSION
  }

  return client
}

export const prisma =
  cachedPrisma &&
  globalForPrisma.prismaUrl === prismaUrl &&
  supportsFinanceModels &&
  isMatchingSchemaVersion
    ? cachedPrisma
    : getPrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
  globalForPrisma.prismaUrl = prismaUrl
  globalForPrisma.prismaSchemaVersion = PRISMA_SCHEMA_VERSION
}
