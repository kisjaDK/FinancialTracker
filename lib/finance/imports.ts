import { ImportStatus, SeatSourceType } from "@/lib/generated/prisma/enums"
import type { AuditActor } from "@/lib/finance/audit"
import { writeAuditLog } from "@/lib/finance/audit"
import { prisma } from "@/lib/prisma"
import { parseCsv } from "@/lib/finance/csv"
import { deriveTrackerSeatsForYear } from "@/lib/finance/queries"

function requireAnyHeader(
  rows: Record<string, string>[],
  headerGroups: Array<{ label: string; headers: string[] }>
) {
  const sample = rows[0] ?? {}
  const missing = headerGroups
    .filter((group) => !group.headers.some((header) => header in sample))
    .map((group) => group.label)

  if (missing.length > 0) {
    throw new Error(`Missing required columns: ${missing.join(", ")}`)
  }
}

export function parseNumber(value: string | undefined) {
  if (!value || value.trim().length === 0) {
    return null
  }

  const trimmed = value.trim().replace(/\s/g, "")
  const isParenthesesNegative = /^\(.*\)$/.test(trimmed)
  const unsigned = isParenthesesNegative ? trimmed.slice(1, -1) : trimmed
  const normalized = /^\-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(unsigned)
    ? unsigned.replaceAll(".", "").replace(",", ".")
    : /^\-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(unsigned)
      ? unsigned.replaceAll(",", "")
      : unsigned.includes(",") && !unsigned.includes(".")
        ? unsigned.replace(",", ".")
        : unsigned
  const signed = isParenthesesNegative ? `-${normalized}` : normalized
  const result = Number(signed)
  return Number.isFinite(result) ? result : null
}

function parseDate(value: string | undefined) {
  if (!value || value.trim().length === 0) {
    return null
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

async function getOrCreateTrackingYear(year: number) {
  return prisma.trackingYear.upsert({
    where: { year },
    update: {},
    create: {
      year,
      label: String(year),
      isActive: true,
    },
  })
}

function budgetMovementHeaderValue(row: Record<string, string>, primary: string, alias?: string) {
  return row[primary] || (alias ? row[alias] : "") || ""
}

function rosterHeaderValue(row: Record<string, string>, ...headers: string[]) {
  for (const header of headers) {
    const value = row[header]
    if (value !== undefined && value !== null && value !== "") {
      return value
    }
  }

  return ""
}

function normalizeValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ""
}

function normalizeSubDomainLabel(value: string | null | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) {
    return ""
  }

  return normalizeValue(trimmed) === "engineering"
    ? "Architecture & Engineering"
    : trimmed
}

function buildDepartmentCodeKey(sourceCode: string | null | undefined) {
  return normalizeValue(sourceCode)
}

function getRosterImportError(input: {
  departmentCode: string | null
  rosterSubDomain: string | null
  mapping?: {
    subDomain: string
  }
}) {
  if (!input.departmentCode) {
    return "Missing department code"
  }

  if (!input.mapping) {
    return `No hierarchy mapping for ${input.departmentCode}`
  }

  const rosterSubDomain = normalizeSubDomainLabel(input.rosterSubDomain)
  const mappedSubDomain = normalizeSubDomainLabel(input.mapping.subDomain)

  if (normalizeValue(rosterSubDomain) !== normalizeValue(mappedSubDomain)) {
    return `Hierarchy mapping mismatch: ${input.departmentCode} maps to ${mappedSubDomain}, roster row has ${rosterSubDomain || "blank"}`
  }

  return null
}

const EXTERNAL_ACTUAL_MONTH_MAP = new Map(
  ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map(
    (label, index) => [label.toLowerCase(), index]
  )
)

function parseExternalActualMonthHeader(header: string, year: number) {
  const match = header.trim().match(/^([A-Za-z]{3})-(\d{2})\s+ID$/)
  if (!match) {
    return null
  }

  const monthIndex = EXTERNAL_ACTUAL_MONTH_MAP.get(match[1].toLowerCase())
  const twoDigitYear = year % 100

  if (monthIndex === undefined || Number(match[2]) !== twoDigitYear) {
    return null
  }

  return {
    header,
    monthIndex,
    monthLabel: `${match[1]}-${String(year).slice(-2)}`,
  }
}

function hasImportableExternalActualValue(value: string | undefined) {
  return Boolean(value && value.trim().length > 0)
}

function isHistoricalRosterRow(
  row: Record<string, string>,
  year: number
) {
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const startDate = parseDate(
    rosterHeaderValue(row, "Expected start date", "Start date")
  )
  const endDate = parseDate(
    rosterHeaderValue(row, "Expected end date", "End date")
  )

  return Boolean(
    startDate &&
      endDate &&
      startDate.getTime() < yearStart.getTime() &&
      endDate.getTime() < yearStart.getTime()
  )
}

export async function importRosterCsv(
  year: number,
  fileName: string,
  content: string,
  actor?: AuditActor
) {
  const rows = parseCsv(content)
  if (rows.length === 0) {
    throw new Error("Roster file is empty.")
  }

  requireAnyHeader(rows, [
    { label: "Seat ID", headers: ["Seat ID"] },
    {
      label: "Sub-domain / Product line",
      headers: ["Name of Product line / Project", "Sub-Domain"],
    },
    { label: "Team", headers: ["Name of team", "Team"] },
    { label: "Band", headers: ["Band"] },
    { label: "Name", headers: ["Name of resource", "Name"] },
    { label: "Status", headers: ["Status"] },
    { label: "FTE", headers: ["FTE allocation to team (%)", "FTE"] },
    { label: "Resource type", headers: ["Type of resource", "Resource type"] },
    { label: "Location", headers: ["Location"] },
    { label: "Start date", headers: ["Expected start date", "Start date"] },
    { label: "End date", headers: ["Expected end date", "End date"] },
    { label: "Funding type", headers: ["Funding type"] },
  ])
  const trackingYear = await getOrCreateTrackingYear(year)
  const departmentMappings = await prisma.departmentMapping.findMany({
    where: {
      trackingYearId: trackingYear.id,
      codeType: "DEPARTMENT_CODE",
    },
  })
  const departmentMappingLookup = new Map(
    departmentMappings.map((mapping) => [buildDepartmentCodeKey(mapping.sourceCode), mapping])
  )
  const [existingImports, existingPeople, existingSeats] = await Promise.all([
    prisma.rosterImport.count({ where: { trackingYearId: trackingYear.id } }),
    prisma.rosterPerson.count({ where: { trackingYearId: trackingYear.id } }),
    prisma.trackerSeat.count({
      where: {
        trackingYearId: trackingYear.id,
        sourceType: SeatSourceType.ROSTER,
      },
    }),
  ])

  const rowsWithSeatId = rows.filter(
    (row) => String(rosterHeaderValue(row, "Seat ID")).trim().length > 0
  )
  const activeRowsWithSeatId = rowsWithSeatId.filter(
    (row) => !isHistoricalRosterRow(row, year)
  )
  const skippedHistoricalRows = rowsWithSeatId.length - activeRowsWithSeatId.length

  if (rowsWithSeatId.length === 0) {
    throw new Error("Roster file does not contain any rows with a Seat ID.")
  }

  if (activeRowsWithSeatId.length === 0) {
    throw new Error(`Roster file does not contain any rows active on or after January 1, ${year}.`)
  }

  const dedupedRows = Array.from(
    new Map(
      activeRowsWithSeatId.map((row) => [
        String(rosterHeaderValue(row, "Seat ID")).trim(),
        row,
      ])
    ).values()
  )
  const errorRowCount = dedupedRows.filter((row) =>
    Boolean(
      getRosterImportError({
        departmentCode: rosterHeaderValue(row, "Domain") || null,
        rosterSubDomain:
          rosterHeaderValue(row, "Name of Product line / Project", "Sub-Domain") ||
          null,
        mapping: departmentMappingLookup.get(
          buildDepartmentCodeKey(rosterHeaderValue(row, "Domain") || null)
        ),
      })
    )
  ).length

  const batch = await prisma.$transaction(async (transaction) => {
    const nextBatch = await transaction.rosterImport.create({
      data: {
        trackingYearId: trackingYear.id,
        fileName,
        status: ImportStatus.APPROVED,
        importedByName: actor?.name ?? null,
        importedByEmail: actor?.email ?? null,
        approvedAt: new Date(),
        rowCount: dedupedRows.length,
      },
    })

    await transaction.rosterPerson.createMany({
      data: dedupedRows.map((row) => ({
        trackingYearId: trackingYear.id,
        importId: nextBatch.id,
        seatId: String(rosterHeaderValue(row, "Seat ID")).trim(),
        domain: rosterHeaderValue(row, "Domain") || null,
        productLine:
          rosterHeaderValue(row, "Name of Product line / Project", "Sub-Domain") ||
          null,
        importError: getRosterImportError({
          departmentCode: rosterHeaderValue(row, "Domain") || null,
          rosterSubDomain:
            rosterHeaderValue(row, "Name of Product line / Project", "Sub-Domain") ||
            null,
          mapping: departmentMappingLookup.get(
            buildDepartmentCodeKey(rosterHeaderValue(row, "Domain") || null)
          ),
        }),
        teamName: rosterHeaderValue(row, "Name of team", "Team") || null,
        band: rosterHeaderValue(row, "Band") || null,
        peoplePortalPositionId:
          rosterHeaderValue(row, "People Portal Position ID (internals)", "Position") ||
          null,
        resourceName: rosterHeaderValue(row, "Name of resource", "Name") || null,
        email: rosterHeaderValue(row, "Pandora email", "Email") || null,
        roleCategory: rosterHeaderValue(row, "Role category") || null,
        specificRole:
          rosterHeaderValue(row, "Specific role (dependent on role category)") || null,
        title: rosterHeaderValue(row, "Title") || null,
        status: rosterHeaderValue(row, "Status") || null,
        allocation:
          parseNumber(rosterHeaderValue(row, "FTE allocation to team (%)", "FTE")) ?? 0,
        resourceType:
          rosterHeaderValue(row, "Type of resource", "Resource type") || null,
        vendor: rosterHeaderValue(row, "Vendor (if external)", "Vendor") || null,
        dailyRate: parseNumber(rosterHeaderValue(row, "Daily rate (if external)")),
        lineManager:
          rosterHeaderValue(row, "Pandora line manager", "Manager") || null,
        location: rosterHeaderValue(row, "Location") || null,
        expectedFunding: rosterHeaderValue(row, "Expected funding") || null,
        expectedFunding2025: rosterHeaderValue(row, "Expected funding 2025") || null,
        expectedStartDate: parseDate(
          rosterHeaderValue(row, "Expected start date", "Start date")
        ),
        expectedEndDate: parseDate(
          rosterHeaderValue(row, "Expected end date", "End date")
        ),
        fundingType: rosterHeaderValue(row, "Funding type") || null,
        hourlyRate: parseNumber(rosterHeaderValue(row, "Hourly rate")),
      })),
    })

    return nextBatch
  })

  await deriveTrackerSeatsForYear(year)
  await writeAuditLog({
    trackingYearId: trackingYear.id,
    entityType: "RosterImport",
    entityId: batch.id,
    action: "IMPORT",
    actor,
    changes: [
      {
        field: "rosterImport",
        oldValue: JSON.stringify({
          previousImports: existingImports,
          previousPeople: existingPeople,
          previousSeats: existingSeats,
        }),
        newValue: JSON.stringify({
          fileName,
          sourceRowCount: rows.length,
          importedRowCount: dedupedRows.length,
          skippedBlankSeatRows: rows.length - rowsWithSeatId.length,
          skippedHistoricalRows,
          errorRowCount,
          importedPeople: dedupedRows.length,
        }),
      },
    ],
  })
  return {
    batch,
    errorRowCount,
    skippedHistoricalRows,
  }
}

export async function importBudgetMovementsCsv(
  year: number,
  fileName: string,
  content: string,
  actor?: AuditActor
) {
  const rows = parseCsv(content)
  if (rows.length === 0) {
    throw new Error("Budget movement file is empty.")
  }

  const sample = rows[0] ?? {}
  const hasCostCenterHeader =
    "Receiving Cost Center" in sample || "Receing Funding" in sample
  const hasProjectCodeHeader =
    "Receiving Project Code" in sample || "Receiving Pillar" in sample
  const missingHeaders = [
    !("Amount Given" in sample) ? "Amount Given" : null,
    !hasCostCenterHeader ? "Receiving Cost Center / Receing Funding" : null,
    !hasProjectCodeHeader ? "Receiving Project Code / Receiving Pillar" : null,
    !("Date of Change" in sample) ? "Date of Change" : null,
  ].filter(Boolean)

  if (missingHeaders.length > 0) {
    throw new Error(`Missing required columns: ${missingHeaders.join(", ")}`)
  }

  const trackingYear = await getOrCreateTrackingYear(year)
  const [existingBatches, existingMovements] = await Promise.all([
    prisma.budgetMovementBatch.count({
      where: {
        trackingYearId: trackingYear.id,
        isManual: false,
      },
    }),
    prisma.budgetMovement.count({
      where: {
        trackingYearId: trackingYear.id,
        batch: {
          isManual: false,
        },
      },
    }),
  ])
  const departmentMappings = await prisma.departmentMapping.findMany({
    where: {
      trackingYearId: trackingYear.id,
      codeType: "DEPARTMENT_CODE",
    },
  })
  const departmentCodeMappings = new Map(
    departmentMappings.map((mapping) => [mapping.sourceCode.trim().toLowerCase(), mapping])
  )

  await prisma.$transaction(async (transaction) => {
    await transaction.budgetMovement.deleteMany({
      where: {
        trackingYearId: trackingYear.id,
        batch: {
          isManual: false,
        },
      },
    })

    await transaction.budgetMovementBatch.deleteMany({
      where: {
        trackingYearId: trackingYear.id,
        isManual: false,
      },
    })

    const batch = await transaction.budgetMovementBatch.create({
      data: {
        trackingYearId: trackingYear.id,
        fileName,
        isManual: false,
        rowCount: rows.length,
      },
    })

    for (const row of rows) {
      const costCenter = budgetMovementHeaderValue(
        row,
        "Receiving Cost Center",
        "Receing Funding"
      ).trim()
      const projectCode = budgetMovementHeaderValue(
        row,
        "Receiving Project Code",
        "Receiving Pillar"
      ).trim()
      const funding = row["Funding"]?.trim() || null
      const pillar = row["Pillar"]?.trim() || null
      const mappedHierarchy = departmentCodeMappings.get(costCenter.toLowerCase())

      const budgetArea = await transaction.budgetArea.upsert({
        where: {
          trackingYearId_costCenter_projectCode: {
            trackingYearId: trackingYear.id,
            costCenter,
            projectCode,
          },
        },
        update: {
          domain: mappedHierarchy?.domain || undefined,
          subDomain: mappedHierarchy?.subDomain || undefined,
          funding: funding || undefined,
          pillar: pillar || undefined,
          displayName:
            row["Display Name"]?.trim() ||
            `${pillar || projectCode} · ${costCenter}`,
        },
        create: {
          trackingYearId: trackingYear.id,
          domain: mappedHierarchy?.domain || null,
          subDomain: mappedHierarchy?.subDomain || null,
          funding,
          pillar,
          costCenter,
          projectCode,
          displayName:
            row["Display Name"]?.trim() ||
            `${pillar || projectCode} · ${costCenter}`,
        },
      })

      await transaction.budgetMovement.create({
        data: {
          trackingYearId: trackingYear.id,
          batchId: batch.id,
          budgetAreaId: budgetArea.id,
          givingFunding: row["Giving Funding"] || null,
          givingPillar: row["Giving Pillar"] || null,
          amountGiven: parseNumber(row["Amount Given"]) ?? 0,
          receivingCostCenter: costCenter,
          receivingProjectCode: projectCode,
          notes: row["Notes"] || null,
          effectiveDate: parseDate(row["Date of Change"]),
          category: row["Category"] || null,
          fbpValidation: row["FBP Validation"] || null,
          financeViewAmount: parseNumber(row["Finance View"]),
          capexTarget: parseNumber(row["CAPEX target"]),
        },
      })
    }
  })

  await deriveTrackerSeatsForYear(year)
  const batch = await prisma.budgetMovementBatch.findFirstOrThrow({
    where: {
      trackingYearId: trackingYear.id,
      fileName,
      isManual: false,
    },
    orderBy: { importedAt: "desc" },
  })

  await writeAuditLog({
    trackingYearId: trackingYear.id,
    entityType: "BudgetMovementImport",
    entityId: batch.id,
    action: "IMPORT",
    actor,
    changes: [
      {
        field: "budgetMovementImport",
        oldValue: JSON.stringify({
          previousBatches: existingBatches,
          previousMovements: existingMovements,
        }),
        newValue: JSON.stringify({
          fileName,
          rowCount: rows.length,
        }),
      },
    ],
  })

  return batch
}

export async function importExternalActualsCsv(
  year: number,
  fileName: string,
  content: string,
  actor?: AuditActor
) {
  const rows = parseCsv(content)
  if (rows.length === 0) {
    throw new Error("External actuals file is empty.")
  }

  requireAnyHeader(rows, [
    { label: "Seat ID", headers: ["Seat ID"] },
    { label: "Team", headers: ["Team"] },
    { label: "In Seat", headers: ["In Seat"] },
    { label: "Description", headers: ["Description"] },
  ])

  const monthHeaders = Object.keys(rows[0] ?? {})
    .map((header) => parseExternalActualMonthHeader(header, year))
    .filter((header): header is NonNullable<typeof header> => Boolean(header))

  if (monthHeaders.length === 0) {
    throw new Error(`No month columns found for ${year}. Expected headers like Jan-${String(year).slice(-2)} ID.`)
  }

  const trackingYear = await getOrCreateTrackingYear(year)
  const trackerSeats = await prisma.trackerSeat.findMany({
    where: {
      trackingYearId: trackingYear.id,
      isActive: true,
    },
    select: {
      id: true,
      seatId: true,
    },
  })
  const trackerSeatBySeatId = new Map(
    trackerSeats.map((seat) => [seat.seatId.trim(), seat])
  )

  const importRows = rows.flatMap((row) => {
    const seatId = String(row["Seat ID"] ?? "").trim()
    if (!seatId) {
      return []
    }

    return monthHeaders.flatMap((monthHeader) => {
      const rawValue = row[monthHeader.header]
      if (!hasImportableExternalActualValue(rawValue)) {
        return []
      }
      const amount = parseNumber(rawValue)
      if (amount === null) {
        return []
      }

      return [
        {
          seatId,
          team: row["Team"]?.trim() || null,
          inSeat: row["In Seat"]?.trim() || null,
          description: row["Description"]?.trim() || null,
          monthIndex: monthHeader.monthIndex,
          monthLabel: monthHeader.monthLabel,
          amount,
          trackerSeatId: trackerSeatBySeatId.get(seatId)?.id ?? null,
        },
      ]
    })
  })

  if (importRows.length === 0) {
    throw new Error("External actuals file did not contain any importable month amounts.")
  }

  const batch = await prisma.$transaction(async (transaction) => {
    const nextBatch = await transaction.externalActualImport.create({
      data: {
        trackingYearId: trackingYear.id,
        fileName,
        importedByName: actor?.name ?? null,
        importedByEmail: actor?.email ?? null,
        rowCount: rows.length,
        entryCount: importRows.length,
      },
    })

    await transaction.externalActualEntry.createMany({
      data: importRows.map((row) => ({
        trackingYearId: trackingYear.id,
        importId: nextBatch.id,
        trackerSeatId: row.trackerSeatId,
        seatId: row.seatId,
        team: row.team,
        inSeat: row.inSeat,
        description: row.description,
        monthIndex: row.monthIndex,
        monthLabel: row.monthLabel,
        amount: row.amount,
      })),
    })

    for (const row of importRows) {
      if (!row.trackerSeatId) {
        continue
      }

      const isClearingActual = row.amount <= 0

      await transaction.seatMonth.upsert({
        where: {
          trackerSeatId_monthIndex: {
            trackerSeatId: row.trackerSeatId,
            monthIndex: row.monthIndex,
          },
        },
        update: {
          actualAmount: isClearingActual ? 0 : row.amount,
          actualAmountRaw: row.amount,
          actualCurrency: "DKK",
          exchangeRateUsed: isClearingActual ? null : 1,
          forecastIncluded: isClearingActual,
          notes: `Imported from external actuals: ${fileName} (${nextBatch.id})`,
        },
        create: {
          trackerSeatId: row.trackerSeatId,
          monthIndex: row.monthIndex,
          actualAmount: isClearingActual ? 0 : row.amount,
          actualAmountRaw: row.amount,
          actualCurrency: "DKK",
          exchangeRateUsed: isClearingActual ? null : 1,
          forecastIncluded: isClearingActual,
          notes: `Imported from external actuals: ${fileName} (${nextBatch.id})`,
        },
      })
    }

    return nextBatch
  })

  await writeAuditLog({
    trackingYearId: trackingYear.id,
    entityType: "ExternalActualImport",
    entityId: batch.id,
    action: "IMPORT",
    actor,
    changes: [
      {
        field: "externalActualImport",
        newValue: JSON.stringify({
          fileName,
          rowCount: rows.length,
          entryCount: importRows.length,
          matchedSeatCount: importRows.filter((row) => row.trackerSeatId).length,
          unmatchedSeatCount: importRows.filter((row) => !row.trackerSeatId).length,
        }),
      },
    ],
  })

  return batch
}
