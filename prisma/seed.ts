import "dotenv/config"
import fs from "node:fs"
import path from "node:path"
import { PrismaClient } from "../lib/generated/prisma/client"
import {
  ALLOWED_SEAT_STATUSES,
  DEFAULT_ACTIVE_SEAT_STATUSES,
} from "../lib/finance/constants"

function resolveDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL
  const fallbackPath = path.resolve(process.cwd(), "prisma", "dev.db")

  if (!databaseUrl) {
    return `file:${fallbackPath}`
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

  return resolvedPath ? `file:${resolvedPath}` : databaseUrl
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: resolveDatabaseUrl(),
    },
  },
})

const INITIAL_2026_COST_ASSUMPTIONS = [
  ["Australia", "5", 840000],
  ["China", "3", 1628000],
  ["China", "4", 896000],
  ["China", "5", 571000],
  ["China", "6", 338000],
  ["Denmark", "1", 1628000],
  ["Denmark", "2", 1628000],
  ["Denmark", "3", 1628000],
  ["Denmark", "4", 1133000],
  ["Denmark", "5", 814000],
  ["Denmark", "6", 158000],
  ["Denmark", "Grad", 158000],
  ["Panama", "5", 473000],
  ["Poland", "3", 1628000],
  ["Poland", "4", 1027000],
  ["Poland", "5", 366000],
  ["Poland", "6", 225000],
  ["Thailand", "3", 1628000],
  ["Thailand", "4", 493000],
  ["Thailand", "5", 239000],
  ["Thailand", "6", 79000],
  ["UK", "3", 1628000],
  ["UK", "4", 1133000],
  ["UK", "5", 737000],
  ["UK", "6", 518000],
  ["USA", "4", 1155000],
  ["USA", "5", 1047000],
] as const

async function main() {
  console.log("Seeding finance tracker...")

  await prisma.seatMonth.deleteMany()
  await prisma.trackerOverride.deleteMany()
  await prisma.trackerSeat.deleteMany()
  await prisma.auditLog.deleteMany()
  await prisma.costAssumption.deleteMany()
  await prisma.departmentMapping.deleteMany()
  await prisma.exchangeRate.deleteMany()
  await prisma.statusDefinition.deleteMany()
  await prisma.rosterPerson.deleteMany()
  await prisma.rosterImport.deleteMany()
  await prisma.budgetMovement.deleteMany()
  await prisma.budgetMovementBatch.deleteMany()
  await prisma.budgetArea.deleteMany()
  await prisma.trackingYear.deleteMany()

  const trackingYear = await prisma.trackingYear.create({
    data: {
      year: 2026,
      label: "FY2026",
      isActive: true,
    },
  })

  const areas = await Promise.all([
    prisma.budgetArea.create({
      data: {
        trackingYearId: trackingYear.id,
        domain: "Data & Analytics",
        subDomain: "Architecture",
        funding: "D&T Run",
        pillar: "Architecture",
        costCenter: "D6861",
        projectCode: "L68610001",
        displayName: "Architecture",
      },
    }),
    prisma.budgetArea.create({
      data: {
        trackingYearId: trackingYear.id,
        domain: "Data & Analytics",
        subDomain: "AI & Automation",
        funding: "D&T Run",
        pillar: "AI & Automation CoE",
        costCenter: "D4453",
        projectCode: "L44530001",
        displayName: "AI & Automation CoE",
      },
    }),
  ])

  await prisma.costAssumption.createMany({
    data: INITIAL_2026_COST_ASSUMPTIONS.map(([location, band, yearlyCost]) => ({
      trackingYearId: trackingYear.id,
      band,
      location,
      yearlyCost,
      notes: "Seeded 2026 internal cost assumption",
    })),
  })

  await prisma.departmentMapping.createMany({
    data: [
      {
        trackingYearId: trackingYear.id,
        codeType: "DEPARTMENT_CODE",
        sourceCode: "D6861",
        domain: "Data & Analytics",
        subDomain: "Architecture",
      },
      {
        trackingYearId: trackingYear.id,
        codeType: "DEPARTMENT_CODE",
        sourceCode: "D4453",
        domain: "Data & Analytics",
        subDomain: "AI & Automation",
      },
    ],
  })

  await prisma.exchangeRate.createMany({
    data: [
      {
        trackingYearId: trackingYear.id,
        currency: "EUR",
        rateToDkk: 7.46,
        effectiveDate: new Date("2026-01-31"),
      },
      {
        trackingYearId: trackingYear.id,
        currency: "USD",
        rateToDkk: 6.88,
        effectiveDate: new Date("2026-01-31"),
      },
    ],
  })

  await prisma.statusDefinition.createMany({
    data: ALLOWED_SEAT_STATUSES.map((label, index) => ({
      trackingYearId: trackingYear.id,
      label,
      sortOrder: index,
      isActiveStatus: DEFAULT_ACTIVE_SEAT_STATUSES.some(
        (status) => status === label
      ),
    })),
  })

  const movementBatch = await prisma.budgetMovementBatch.create({
    data: {
      trackingYearId: trackingYear.id,
      fileName: "seed-budget-movements.csv",
      rowCount: 4,
    },
  })

  await prisma.budgetMovement.createMany({
    data: [
      {
        trackingYearId: trackingYear.id,
        batchId: movementBatch.id,
        budgetAreaId: areas[0].id,
        givingFunding: "Initial Budget",
        givingPillar: "Initial Budget",
        amountGiven: 2766590,
        financeViewAmount: 2766590,
        receivingCostCenter: areas[0].costCenter,
        receivingProjectCode: areas[0].projectCode,
        category: "Initial Budget Perm",
        fbpValidation: "YES",
        effectiveDate: new Date("2026-01-19"),
      },
      {
        trackingYearId: trackingYear.id,
        batchId: movementBatch.id,
        budgetAreaId: areas[0].id,
        givingFunding: "Initial Budget",
        givingPillar: "Initial Budget",
        amountGiven: 730000,
        financeViewAmount: 730000,
        receivingCostCenter: areas[0].costCenter,
        receivingProjectCode: areas[0].projectCode,
        category: "Cloud Cost",
        fbpValidation: "YES",
        effectiveDate: new Date("2026-01-19"),
      },
      {
        trackingYearId: trackingYear.id,
        batchId: movementBatch.id,
        budgetAreaId: areas[1].id,
        givingFunding: "Initial Budget",
        givingPillar: "Initial Budget",
        amountGiven: 17280300,
        financeViewAmount: 17280300,
        receivingCostCenter: areas[1].costCenter,
        receivingProjectCode: areas[1].projectCode,
        category: "Initial Budget Perm",
        fbpValidation: "YES",
        effectiveDate: new Date("2026-01-19"),
      },
      {
        trackingYearId: trackingYear.id,
        batchId: movementBatch.id,
        budgetAreaId: areas[1].id,
        givingFunding: "Initial Budget",
        givingPillar: "Initial Budget",
        amountGiven: 3887000,
        financeViewAmount: 3887000,
        receivingCostCenter: areas[1].costCenter,
        receivingProjectCode: areas[1].projectCode,
        category: "Cloud Cost",
        fbpValidation: "YES",
        effectiveDate: new Date("2026-01-19"),
      },
    ],
  })

  const rosterImport = await prisma.rosterImport.create({
    data: {
      trackingYearId: trackingYear.id,
      fileName: "seed-roster.csv",
      status: "APPROVED",
      approvedAt: new Date(),
      rowCount: 3,
    },
  })

  const rosterPeople = await Promise.all([
    prisma.rosterPerson.create({
      data: {
        trackingYearId: trackingYear.id,
        importId: rosterImport.id,
        seatId: "300127",
        productLine: "Architecture",
        teamName: "Architecture",
        band: "Band 5",
        resourceName: "Jane Doe",
        status: "Active",
        allocation: 1,
        resourceType: "Internal Insourced",
        location: "Denmark",
        expectedStartDate: new Date("2026-01-01"),
        expectedEndDate: new Date("2026-12-31"),
        fundingType: "D&T Run",
      },
    }),
    prisma.rosterPerson.create({
      data: {
        trackingYearId: trackingYear.id,
        importId: rosterImport.id,
        seatId: "300405",
        productLine: "AI & Automation CoE",
        teamName: "Agentforce",
        band: "Band 4",
        resourceName: "Alex Hansen",
        status: "Active",
        allocation: 1,
        resourceType: "Internal",
        location: "Poland",
        expectedStartDate: new Date("2026-02-01"),
        expectedEndDate: new Date("2026-12-31"),
        fundingType: "D&T Run",
      },
    }),
    prisma.rosterPerson.create({
      data: {
        trackingYearId: trackingYear.id,
        importId: rosterImport.id,
        seatId: "C00372",
        productLine: "AI & Automation CoE",
        teamName: "Cloud Engineering",
        band: "External",
        resourceName: "Morgan Vendor",
        status: "Active",
        allocation: 1,
        resourceType: "External T&M",
        vendor: "HCL",
        dailyRate: 10000,
        location: "India",
        expectedStartDate: new Date("2026-01-01"),
        expectedEndDate: new Date("2026-12-31"),
        fundingType: "D&T Run",
      },
    }),
  ])

  const trackerSeat = await prisma.trackerSeat.create({
    data: {
      trackingYearId: trackingYear.id,
      budgetAreaId: areas[0].id,
      rosterPersonId: rosterPeople[0].id,
      sourceType: "ROSTER",
      seatId: rosterPeople[0].seatId,
      sourceKey: `roster:${rosterPeople[0].seatId}`,
      isActive: true,
      domain: "Data & Analytics",
      subDomain: "Architecture",
      funding: "D&T Run",
      pillar: "Architecture",
      costCenter: areas[0].costCenter,
      projectCode: areas[0].projectCode,
      resourceType: rosterPeople[0].resourceType,
      team: rosterPeople[0].teamName,
      inSeat: rosterPeople[0].resourceName,
      description: "Engineer, Analytics",
      band: rosterPeople[0].band,
      location: rosterPeople[0].location,
      status: rosterPeople[0].status,
      allocation: 1,
      startDate: rosterPeople[0].expectedStartDate,
      endDate: rosterPeople[0].expectedEndDate,
      months: {
        createMany: {
          data: Array.from({ length: 12 }, (_, monthIndex) => ({
            monthIndex,
            actualAmount: monthIndex < 2 ? 65000 : 0,
            actualAmountRaw: monthIndex < 2 ? 65000 : 0,
            actualCurrency: "DKK",
            exchangeRateUsed: monthIndex < 2 ? 1 : null,
            forecastIncluded: monthIndex >= 2,
          })),
        },
      },
    },
  })

  await prisma.trackerSeat.create({
    data: {
      trackingYearId: trackingYear.id,
      budgetAreaId: areas[1].id,
      rosterPersonId: rosterPeople[1].id,
      sourceType: "ROSTER",
      seatId: rosterPeople[1].seatId,
      sourceKey: `roster:${rosterPeople[1].seatId}`,
      isActive: true,
      domain: "Data & Analytics",
      subDomain: "AI & Automation",
      funding: "D&T Run",
      pillar: "AI & Automation CoE",
      costCenter: areas[1].costCenter,
      projectCode: areas[1].projectCode,
      resourceType: rosterPeople[1].resourceType,
      team: rosterPeople[1].teamName,
      inSeat: rosterPeople[1].resourceName,
      band: rosterPeople[1].band,
      location: rosterPeople[1].location,
      status: rosterPeople[1].status,
      allocation: 1,
      startDate: rosterPeople[1].expectedStartDate,
      endDate: rosterPeople[1].expectedEndDate,
      months: {
        createMany: {
          data: Array.from({ length: 12 }, (_, monthIndex) => ({
            monthIndex,
            actualAmount: monthIndex === 0 ? 42000 : 0,
            actualAmountRaw: monthIndex === 0 ? 42000 : 0,
            actualCurrency: "DKK",
            exchangeRateUsed: monthIndex === 0 ? 1 : null,
            forecastIncluded: monthIndex !== 0,
          })),
        },
      },
    },
  })

  await prisma.trackerSeat.create({
    data: {
      trackingYearId: trackingYear.id,
      budgetAreaId: areas[1].id,
      rosterPersonId: rosterPeople[2].id,
      sourceType: "ROSTER",
      seatId: rosterPeople[2].seatId,
      sourceKey: `roster:${rosterPeople[2].seatId}`,
      isActive: true,
      domain: "Data & Analytics",
      subDomain: "AI & Automation",
      funding: "D&T Run",
      pillar: "AI & Automation CoE",
      costCenter: areas[1].costCenter,
      projectCode: areas[1].projectCode,
      resourceType: rosterPeople[2].resourceType,
      team: rosterPeople[2].teamName,
      inSeat: rosterPeople[2].resourceName,
      band: rosterPeople[2].band,
      location: rosterPeople[2].location,
      vendor: rosterPeople[2].vendor,
      dailyRate: rosterPeople[2].dailyRate,
      status: rosterPeople[2].status,
      allocation: 1,
      startDate: rosterPeople[2].expectedStartDate,
      endDate: rosterPeople[2].expectedEndDate,
      months: {
        createMany: {
          data: Array.from({ length: 12 }, (_, monthIndex) => ({
            monthIndex,
            actualAmount: monthIndex === 0 ? 110080 : 0,
            actualAmountRaw: monthIndex === 0 ? 16000 : 0,
            actualCurrency: "USD",
            exchangeRateUsed: monthIndex === 0 ? 6.88 : null,
            forecastIncluded: monthIndex !== 0,
          })),
        },
      },
    },
  })

  await prisma.trackerOverride.create({
    data: {
      trackerSeatId: trackerSeat.id,
      spendPlanId: "SP-2026-001",
      status: "Validated",
      notes: "Seeded example override.",
    },
  })

  console.log("Finance tracker seed complete.")
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
