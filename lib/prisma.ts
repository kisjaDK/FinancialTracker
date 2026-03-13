import fs from "node:fs"
import path from "node:path"
import { PrismaClient } from "@/lib/generated/prisma/client"

const PRISMA_SCHEMA_VERSION = "2026-03-13-forecast-overrides-v1"

function resolveDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL
  const fallbackPath = path.resolve(process.cwd(), "prisma", "dev.db")

  if (!databaseUrl) {
    return fs.existsSync(fallbackPath) ? `file:${fallbackPath}` : databaseUrl
  }

  if (!databaseUrl.startsWith("file:./")) {
    return databaseUrl
  }

  const relativePath = databaseUrl.slice("file:".length)
  const cwdCandidate = path.resolve(process.cwd(), relativePath)
  const schemaCandidate = path.resolve(process.cwd(), "prisma", relativePath)

  const resolvedPath = [cwdCandidate, schemaCandidate].find((candidate) =>
    fs.existsSync(candidate)
  )

  if (!resolvedPath) {
    return databaseUrl
  }

  return `file:${resolvedPath}`
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaUrl: string | undefined
  prismaSchemaVersion: string | undefined
}

const prismaUrl = resolveDatabaseUrl()
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
        datasources: {
          db: {
            url: prismaUrl,
          },
        },
      })

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
  globalForPrisma.prismaUrl = prismaUrl
  globalForPrisma.prismaSchemaVersion = PRISMA_SCHEMA_VERSION
}
