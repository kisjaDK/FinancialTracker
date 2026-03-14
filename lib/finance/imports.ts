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

function csvHeaderValue(row: Record<string, string>, ...headers: string[]) {
  for (const header of headers) {
    const value = row[header]
    if (value !== undefined) {
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

  return trimmed
}

function normalizeDomainLabel(value: string | null | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) {
    return ""
  }

  return normalizeValue(trimmed) === "data and analytics"
    ? "Data & Analytics"
    : trimmed
}

function normalizeCostBandLabel(value: string | null | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) {
    return ""
  }

  return normalizeValue(trimmed).startsWith("band ")
    ? trimmed.slice(5).trim()
    : trimmed
}

function isInternalResourceType(value: string | null | undefined) {
  return normalizeValue(value).includes("internal")
}

function isInternalVendorValue(value: string | null | undefined) {
  const normalized = normalizeValue(value)
  return (
    normalized.length === 0 ||
    normalized === "internal" ||
    normalized === "employee" ||
    normalized === "permanent"
  )
}

export function normalizeRosterVendor(
  resourceType: string | null | undefined,
  vendor: string | null | undefined
) {
  const trimmedVendor = vendor?.trim() || null

  if (!isInternalResourceType(resourceType)) {
    return {
      vendor: trimmedVendor,
      importError: null as string | null,
    }
  }

  if (isInternalVendorValue(trimmedVendor)) {
    return {
      vendor: null,
      importError: null as string | null,
    }
  }

  return {
    vendor: null,
    importError: `Internal resource type cannot use external vendor '${trimmedVendor}'.`,
  }
}

function buildDepartmentCodeKey(sourceCode: string | null | undefined) {
  return normalizeValue(sourceCode)
}

function resolveDepartmentMapping(
  lookup: Map<string, Array<{ subDomain: string; projectCode?: string | null } & Record<string, unknown>>>,
  input: {
    sourceCode: string | null | undefined
    subDomain?: string | null | undefined
  }
) {
  const candidates = lookup.get(buildDepartmentCodeKey(input.sourceCode)) || []
  const normalizedSubDomain = normalizeValue(normalizeSubDomainLabel(input.subDomain))

  if (!normalizedSubDomain) {
    return candidates[0]
  }

  return (
    candidates.find((mapping) => normalizeValue(normalizeSubDomainLabel(String(mapping.subDomain || ""))) === normalizedSubDomain) ||
    candidates.find((mapping) => normalizeValue(normalizeSubDomainLabel(String(mapping.subDomain || ""))).includes(normalizedSubDomain)) ||
    candidates[0]
  )
}

function resolveDepartmentMappingByDomain(
  mappings: Array<{ domain?: string | null; subDomain: string } & Record<string, unknown>>,
  input: {
    domain: string | null | undefined
    subDomain?: string | null | undefined
  }
) {
  const normalizedSubDomain = normalizeValue(normalizeSubDomainLabel(input.subDomain))

  const domainMatches = mappings.filter(
    (mapping) =>
      normalizeValue(normalizeDomainLabel(String(mapping.domain || ""))) ===
      normalizeValue(normalizeDomainLabel(input.domain))
  )

  if (domainMatches.length === 0) {
    return undefined
  }

  if (!normalizedSubDomain) {
    return domainMatches[0]
  }

  return (
    domainMatches.find(
      (mapping) =>
        normalizeValue(normalizeSubDomainLabel(String(mapping.subDomain || ""))) ===
        normalizedSubDomain
    ) ||
    domainMatches.find((mapping) =>
      normalizeValue(normalizeSubDomainLabel(String(mapping.subDomain || ""))).includes(
        normalizedSubDomain
      )
    ) ||
    domainMatches[0]
  )
}

function getRosterImportError(input: {
  departmentCode: string | null
  rosterSubDomain: string | null
  resourceValidationError?: string | null
  mapping?: {
    subDomain: string
  }
}) {
  if (input.resourceValidationError) {
    return input.resourceValidationError
  }

  if (!input.departmentCode) {
    return "Missing department code"
  }

  if (!input.mapping) {
    return `No hierarchy mapping for ${input.departmentCode}`
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
  const departmentMappingLookup = departmentMappings.reduce<
    Map<string, typeof departmentMappings>
  >((map, mapping) => {
    const key = buildDepartmentCodeKey(mapping.sourceCode)
    const current = map.get(key) || []
    current.push(mapping)
    map.set(key, current)
    return map
  }, new Map())
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
    Boolean((() => {
      const departmentCode = rosterHeaderValue(
        row,
        "Department Code",
        "Department code",
        "Department",
        "Cost Center",
        "Cost centre",
        "Cost center"
      ) || null
      const domain = rosterHeaderValue(row, "Domain") || null
      const rosterSubDomain =
        rosterHeaderValue(row, "Name of Product line / Project", "Sub-Domain") || null
      const resourceType =
        rosterHeaderValue(row, "Type of resource", "Resource type") || null
      const vendor = rosterHeaderValue(row, "Vendor (if external)", "Vendor") || null
      const resourceValidation = normalizeRosterVendor(resourceType, vendor)
      const mapping =
        resolveDepartmentMapping(departmentMappingLookup as never, {
          sourceCode: departmentCode,
          subDomain: rosterSubDomain,
        }) ||
        resolveDepartmentMappingByDomain(departmentMappings as never, {
          domain,
          subDomain: rosterSubDomain,
        })

      return getRosterImportError({
        departmentCode: departmentCode || domain,
        rosterSubDomain,
        resourceValidationError: resourceValidation.importError,
        mapping,
      })
    })())
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
        ...(() => {
          const departmentCode = rosterHeaderValue(
            row,
            "Department Code",
            "Department code",
            "Department",
            "Cost Center",
            "Cost centre",
            "Cost center"
          ) || null
          const domain = rosterHeaderValue(row, "Domain") || null
          const rosterSubDomain =
            rosterHeaderValue(row, "Name of Product line / Project", "Sub-Domain") ||
            null
          const resourceType =
            rosterHeaderValue(row, "Type of resource", "Resource type") || null
          const vendor = rosterHeaderValue(row, "Vendor (if external)", "Vendor") || null
          const resourceValidation = normalizeRosterVendor(resourceType, vendor)
          const mapping =
            resolveDepartmentMapping(departmentMappingLookup as never, {
              sourceCode: departmentCode,
              subDomain: rosterSubDomain,
            }) ||
            resolveDepartmentMappingByDomain(departmentMappings as never, {
              domain,
              subDomain: rosterSubDomain,
            })

          return {
            domain: departmentCode || domain,
            importError: getRosterImportError({
              departmentCode: departmentCode || domain,
              rosterSubDomain,
              resourceValidationError: resourceValidation.importError,
              mapping,
            }),
            resourceType,
            vendor: resourceValidation.vendor,
          }
        })(),
        trackingYearId: trackingYear.id,
        importId: nextBatch.id,
        seatId: String(rosterHeaderValue(row, "Seat ID")).trim(),
        productLine:
          rosterHeaderValue(row, "Name of Product line / Project", "Sub-Domain") ||
          null,
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

export async function importDepartmentMappingsCsv(
  year: number,
  content: string,
  actor?: AuditActor
) {
  const rows = parseCsv(content)
  if (rows.length === 0) {
    throw new Error("Hierarchy mapping file is empty.")
  }

  requireAnyHeader(rows, [
    {
      label: "Department code",
      headers: ["Department Code", "Source Code", "sourceCode"],
    },
    { label: "Domain", headers: ["Domain", "domain"] },
    { label: "Sub-domain", headers: ["Sub-domain", "SubDomain", "subDomain"] },
    {
      label: "Project code",
      headers: ["Project Code", "Project code", "projectCode"],
    },
  ])

  const trackingYear = await getOrCreateTrackingYear(year)
  const normalizedRows = rows
    .map((row) => ({
      sourceCode: csvHeaderValue(row, "Department Code", "Source Code", "sourceCode").trim(),
      domain: csvHeaderValue(row, "Domain", "domain").trim(),
      subDomain: csvHeaderValue(row, "Sub-domain", "SubDomain", "subDomain").trim(),
      projectCode: csvHeaderValue(row, "Project Code", "Project code", "projectCode").trim(),
      notes: csvHeaderValue(row, "Notes", "notes").trim(),
    }))
    .filter(
      (row) =>
        row.sourceCode.length > 0 ||
        row.domain.length > 0 ||
        row.subDomain.length > 0 ||
        row.projectCode.length > 0
    )

  if (normalizedRows.length === 0) {
    throw new Error("Hierarchy mapping file does not contain any importable rows.")
  }

  for (const row of normalizedRows) {
    if (!row.sourceCode || !row.domain || !row.subDomain || !row.projectCode) {
      throw new Error(
        `Hierarchy mapping rows must include department code, domain, sub-domain, and project code for ${row.sourceCode || "every row"}.`
      )
    }
  }

  const uniqueRows = Array.from(
    new Map(
      normalizedRows.map((row) => [
        `${normalizeValue(row.sourceCode)}::${normalizeValue(row.subDomain)}::${normalizeValue(row.projectCode)}`,
        row,
      ])
    ).values()
  )
  const existingMappings = await prisma.departmentMapping.findMany({
    where: {
      trackingYearId: trackingYear.id,
      codeType: "DEPARTMENT_CODE",
      sourceCode: { in: uniqueRows.map((row) => row.sourceCode) },
    },
  })
  const existingBySourceCode = new Map(
    existingMappings.map((mapping) => [
      `${normalizeValue(mapping.sourceCode)}::${normalizeValue(mapping.subDomain)}::${normalizeValue(mapping.projectCode)}`,
      mapping,
    ])
  )

  await prisma.$transaction(
    uniqueRows.map((row) =>
      prisma.departmentMapping.upsert({
        where: {
          id: existingBySourceCode.get(
            `${normalizeValue(row.sourceCode)}::${normalizeValue(row.subDomain)}::${normalizeValue(row.projectCode)}`
          )?.id || "__create_new_mapping__",
        },
        update: {
          domain: row.domain,
          subDomain: row.subDomain,
          projectCode: row.projectCode,
          notes: row.notes || null,
        },
        create: {
          trackingYearId: trackingYear.id,
          codeType: "DEPARTMENT_CODE",
          sourceCode: row.sourceCode,
          domain: row.domain,
          subDomain: row.subDomain,
          projectCode: row.projectCode,
          notes: row.notes || null,
        },
      })
    )
  )

  await prisma.$transaction(
    uniqueRows.map((row) =>
      prisma.budgetArea.updateMany({
        where: {
          trackingYearId: trackingYear.id,
          costCenter: row.sourceCode,
        },
        data: {
          domain: row.domain,
          subDomain: row.subDomain,
        },
      })
    )
  )

  await deriveTrackerSeatsForYear(year)

  await Promise.all(
    uniqueRows.map((row) => {
      const before = existingBySourceCode.get(
        `${normalizeValue(row.sourceCode)}::${normalizeValue(row.subDomain)}::${normalizeValue(row.projectCode)}`
      )

      return writeAuditLog({
        trackingYearId: trackingYear.id,
        entityType: "DepartmentMapping",
        entityId: before?.id ?? null,
        action: before ? "UPDATE" : "CREATE",
        actor,
        changes: [
          {
            field: "sourceCode",
            oldValue: before?.sourceCode ?? null,
            newValue: row.sourceCode,
          },
          {
            field: "domain",
            oldValue: before?.domain ?? null,
            newValue: row.domain,
          },
          {
            field: "subDomain",
            oldValue: before?.subDomain ?? null,
            newValue: row.subDomain,
          },
          {
            field: "projectCode",
            oldValue: before?.projectCode ?? null,
            newValue: row.projectCode,
          },
          {
            field: "notes",
            oldValue: before?.notes ?? null,
            newValue: row.notes || null,
          },
        ],
      })
    })
  )

  return { importedCount: uniqueRows.length }
}

export async function importCostAssumptionsCsv(
  year: number,
  content: string,
  actor?: AuditActor
) {
  const rows = parseCsv(content)
  if (rows.length === 0) {
    throw new Error("Internal cost file is empty.")
  }

  requireAnyHeader(rows, [
    { label: "Location", headers: ["Location", "location"] },
    { label: "Band", headers: ["Band", "band"] },
    {
      label: "Yearly cost",
      headers: ["Yearly Cost (DKK)", "Yearly Cost", "yearlyCost"],
    },
  ])

  const trackingYear = await getOrCreateTrackingYear(year)
  const normalizedRows = rows
    .map((row) => ({
      location: csvHeaderValue(row, "Location", "location").trim(),
      band: normalizeCostBandLabel(csvHeaderValue(row, "Band", "band")),
      yearlyCost: parseNumber(
        csvHeaderValue(row, "Yearly Cost (DKK)", "Yearly Cost", "yearlyCost")
      ),
    }))
    .filter((row) => row.location.length > 0 || row.band.length > 0 || row.yearlyCost !== null)

  if (normalizedRows.length === 0) {
    throw new Error("Internal cost file does not contain any importable rows.")
  }

  for (const row of normalizedRows) {
    if (!row.location || !row.band || row.yearlyCost === null) {
      throw new Error(
        `Internal cost rows must include location, band, and yearly cost for ${row.location || row.band || "every row"}.`
      )
    }
  }

  const uniqueRows = Array.from(
    new Map(
      normalizedRows.map((row) => [
        `${normalizeValue(row.location)}:${normalizeValue(row.band)}`,
        row,
      ])
    ).values()
  )
  const existingAssumptions = await prisma.costAssumption.findMany({
    where: {
      trackingYearId: trackingYear.id,
      OR: uniqueRows.map((row) => ({
        location: row.location,
        band: row.band,
      })),
    },
  })
  const existingByKey = new Map(
    existingAssumptions.map((assumption) => [
      `${normalizeValue(assumption.location)}:${normalizeValue(assumption.band)}`,
      assumption,
    ])
  )

  await prisma.$transaction(
    uniqueRows.map((row) =>
      prisma.costAssumption.upsert({
        where: {
          trackingYearId_band_location: {
            trackingYearId: trackingYear.id,
            band: row.band,
            location: row.location,
          },
        },
        update: {
          yearlyCost: row.yearlyCost!,
        },
        create: {
          trackingYearId: trackingYear.id,
          band: row.band,
          location: row.location,
          yearlyCost: row.yearlyCost!,
        },
      })
    )
  )

  await Promise.all(
    uniqueRows.map((row) => {
      const before = existingByKey.get(
        `${normalizeValue(row.location)}:${normalizeValue(row.band)}`
      )

      return writeAuditLog({
        trackingYearId: trackingYear.id,
        entityType: "CostAssumption",
        entityId: before?.id ?? null,
        action: before ? "UPDATE" : "CREATE",
        actor,
        changes: [
          {
            field: "location",
            oldValue: before?.location ?? null,
            newValue: row.location,
          },
          {
            field: "band",
            oldValue: before?.band ?? null,
            newValue: row.band,
          },
          {
            field: "yearlyCost",
            oldValue: before?.yearlyCost ?? null,
            newValue: row.yearlyCost!,
          },
        ],
      })
    })
  )

  return { importedCount: uniqueRows.length }
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
