import {
  ExternalActualSourceKind,
  ImportStatus,
  SeatReferenceValueType,
  SeatSourceType,
} from "@prisma/client"
import { MONTH_NAMES } from "@/lib/finance/constants"
import type { AuditActor } from "@/lib/finance/audit"
import { writeAuditLog } from "@/lib/finance/audit"
import { buildCostAssumptionLookup, deriveSeatMetrics } from "@/lib/finance/derive"
import type { SeatWithRelations } from "@/lib/finance/types"
import { prisma } from "@/lib/prisma"
import { parseCsv } from "@/lib/finance/csv"
import {
  deriveTrackerSeatsForYear,
  updateTrackerSeat,
  upsertSeatReferenceValue,
} from "@/lib/finance/queries"

type NormalizedRosterImportRow = {
  seatId: string
  domain: string | null
  productLine: string | null
  teamName: string | null
  band: string | null
  peoplePortalPositionId: string | null
  resourceName: string | null
  email: string | null
  roleCategory: string | null
  specificRole: string | null
  title: string | null
  status: string | null
  allocation: number | null
  resourceType: string | null
  vendor: string | null
  dailyRate: number | null
  lineManager: string | null
  location: string | null
  expectedFunding: string | null
  expectedFunding2025: string | null
  expectedStartDate: Date | null
  expectedEndDate: Date | null
  fundingType: string | null
  hourlyRate: number | null
}

type PersistRosterImportOptions = {
  sourceRowCount: number
  skippedBlankSeatRows?: number
  skippedHistoricalRows?: number
}

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

function isSupportedImportDate(date: Date) {
  const year = date.getUTCFullYear()
  return year >= 1900 && year <= 2100
}

function parseExcelSerialDate(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return null
  }

  const excelEpochUtc = Date.UTC(1899, 11, 30)
  const millisecondsPerDay = 24 * 60 * 60 * 1000
  const date = new Date(excelEpochUtc + value * millisecondsPerDay)

  return isSupportedImportDate(date) ? date : null
}

export function parseDate(value: string | undefined) {
  if (!value || value.trim().length === 0) {
    return null
  }

  const trimmed = value.trim()
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return parseExcelSerialDate(Number(trimmed))
  }

  const normalized = trimmed
    .replace(/\s+/g, " ")
    .replace(
      /^(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2})\.(\d{2})(?:\.(\d{2}))?$/,
      (_, datePart: string, hours: string, minutes: string, seconds?: string) =>
        `${datePart} ${hours}:${minutes}${seconds ? `:${seconds}` : ""}`
    )

  const dayFirstMatch = normalized.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  )
  if (dayFirstMatch) {
    const [, dayRaw, monthRaw, yearRaw, hourRaw, minuteRaw, secondRaw] = dayFirstMatch
    const day = Number(dayRaw)
    const monthIndex = Number(monthRaw) - 1
    const year = Number(yearRaw)
    const hours = hourRaw ? Number(hourRaw) : 0
    const minutes = minuteRaw ? Number(minuteRaw) : 0
    const seconds = secondRaw ? Number(secondRaw) : 0

    const date = new Date(year, monthIndex, day, hours, minutes, seconds)
    if (
      date.getFullYear() === year &&
      date.getMonth() === monthIndex &&
      date.getDate() === day &&
      isSupportedImportDate(date)
    ) {
      return date
    }
  }

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return isSupportedImportDate(parsed) ? parsed : null
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

function hasAnyHeader(
  rows: Record<string, string>[],
  headers: string[]
) {
  const sample = rows[0] ?? {}
  return headers.some((header) => header in sample)
}

function normalizeValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ""
}

function parseTeams(value: string | undefined) {
  return Array.from(
    new Set(
      (value || "")
        .split(",")
        .map((team) => team.trim())
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right))
}

function parseBoolean(value: string | undefined) {
  const normalized = normalizeValue(value)

  if (!normalized) {
    return null
  }

  if (["true", "yes", "1", "on"].includes(normalized)) {
    return true
  }

  if (["false", "no", "0", "off"].includes(normalized)) {
    return false
  }

  return null
}

function parseMonthIndex(row: Record<string, string>) {
  const monthNumber = csvHeaderValue(row, "Month Number", "monthNumber").trim()
  if (monthNumber) {
    const parsed = Number(monthNumber)
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 12) {
      return parsed - 1
    }
  }

  const monthIndex = csvHeaderValue(row, "Month Index", "monthIndex").trim()
  if (monthIndex) {
    const parsed = Number(monthIndex)
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 11) {
      return parsed
    }
  }

  const monthLabel = normalizeValue(csvHeaderValue(row, "Month", "month"))
  if (!monthLabel) {
    return null
  }

  const matchedIndex = MONTH_NAMES.findIndex(
    (candidate) =>
      normalizeValue(candidate) === monthLabel ||
      normalizeValue(candidate.slice(0, 3)) === monthLabel
  )

  return matchedIndex >= 0 ? matchedIndex : null
}

async function buildTrackerSeatLookup(year: number) {
  const trackingYear = await getOrCreateTrackingYear(year)
  const seats = await prisma.trackerSeat.findMany({
    where: {
      trackingYearId: trackingYear.id,
    },
    select: {
      id: true,
      sourceKey: true,
      seatId: true,
    },
  })

  return {
    byId: new Map(seats.map((seat) => [seat.id, seat])),
    bySourceKey: new Map(seats.map((seat) => [seat.sourceKey, seat])),
    bySeatId: seats.reduce<Map<string, typeof seats>>((map, seat) => {
      const current = map.get(seat.seatId) ?? []
      current.push(seat)
      map.set(seat.seatId, current)
      return map
    }, new Map()),
  }
}

function resolveTrackerSeat(
  row: Record<string, string>,
  lookup: Awaited<ReturnType<typeof buildTrackerSeatLookup>>
) {
  const trackerSeatId = csvHeaderValue(row, "Tracker Seat ID", "trackerSeatId").trim()
  if (trackerSeatId) {
    const seat = lookup.byId.get(trackerSeatId)
    if (!seat) {
      throw new Error(`Unknown tracker seat id: ${trackerSeatId}`)
    }

    return seat
  }

  const sourceKey = csvHeaderValue(row, "Source Key", "sourceKey").trim()
  if (sourceKey) {
    const seat = lookup.bySourceKey.get(sourceKey)
    if (!seat) {
      throw new Error(`Unknown source key: ${sourceKey}`)
    }

    return seat
  }

  const seatId = csvHeaderValue(row, "Seat ID", "seatId").trim()
  if (!seatId) {
    throw new Error("Each row must include Tracker Seat ID, Source Key, or Seat ID.")
  }

  const matches = lookup.bySeatId.get(seatId) ?? []
  if (matches.length === 0) {
    throw new Error(`Unknown seat id: ${seatId}`)
  }

  if (matches.length > 1) {
    throw new Error(`Seat ID ${seatId} is ambiguous. Use Tracker Seat ID or Source Key instead.`)
  }

  return matches[0]
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

function createDepartmentMappingLookup(
  departmentMappings: Awaited<ReturnType<typeof prisma.departmentMapping.findMany>>
) {
  return departmentMappings.reduce<Map<string, typeof departmentMappings>>((map, mapping) => {
    const key = buildDepartmentCodeKey(mapping.sourceCode)
    const current = map.get(key) || []
    current.push(mapping)
    map.set(key, current)
    return map
  }, new Map())
}

function resolveRosterImportValues(
  row: Pick<
    NormalizedRosterImportRow,
    "domain" | "productLine" | "resourceType" | "vendor"
  >,
  departmentMappings: Awaited<ReturnType<typeof prisma.departmentMapping.findMany>>,
  departmentMappingLookup: ReturnType<typeof createDepartmentMappingLookup>
) {
  const resourceValidation = normalizeRosterVendor(row.resourceType, row.vendor)
  const mapping =
    resolveDepartmentMapping(departmentMappingLookup as never, {
      sourceCode: row.domain,
      subDomain: row.productLine,
    }) ||
    resolveDepartmentMappingByDomain(departmentMappings as never, {
      domain: row.domain,
      subDomain: row.productLine,
    })

  return {
    domain: row.domain,
    resourceType: row.resourceType,
    vendor: resourceValidation.vendor,
    importError: getRosterImportError({
      departmentCode: row.domain,
      rosterSubDomain: row.productLine,
      resourceValidationError: resourceValidation.importError,
      mapping,
    }),
  }
}

function dedupeRosterRows(rows: NormalizedRosterImportRow[]) {
  return Array.from(
    new Map(rows.map((row) => [row.seatId.trim(), { ...row, seatId: row.seatId.trim() }])).values()
  )
}

function normalizeJsonText(value: unknown) {
  if (typeof value !== "string") {
    return value === null || value === undefined ? null : String(value)
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseJsonNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }

  return parseNumber(String(value))
}

function parseJsonDate(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  return parseDate(String(value))
}

async function persistRosterImportRows(
  year: number,
  fileName: string,
  rows: NormalizedRosterImportRow[],
  actor: AuditActor | undefined,
  options: PersistRosterImportOptions
) {
  if (rows.length === 0) {
    throw new Error("Roster payload is empty.")
  }

  const trackingYear = await getOrCreateTrackingYear(year)
  const departmentMappings = await prisma.departmentMapping.findMany({
    where: {
      trackingYearId: trackingYear.id,
      codeType: "DEPARTMENT_CODE",
    },
  })
  const departmentMappingLookup = createDepartmentMappingLookup(departmentMappings)
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

  const dedupedRows = dedupeRosterRows(rows)
  const fundingValues = Array.from(
    new Set(
      dedupedRows
        .map((row) => row.fundingType?.trim() ?? "")
        .filter((value) => value.length > 0)
    )
  )
  const errorRowCount = dedupedRows.filter((row) =>
    Boolean(
      resolveRosterImportValues(row, departmentMappings, departmentMappingLookup).importError
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
      data: dedupedRows.map((row) => {
        const resolved = resolveRosterImportValues(
          row,
          departmentMappings,
          departmentMappingLookup
        )

        return {
          trackingYearId: trackingYear.id,
          importId: nextBatch.id,
          seatId: row.seatId,
          domain: resolved.domain,
          productLine: row.productLine,
          importError: resolved.importError,
          teamName: row.teamName,
          band: row.band,
          peoplePortalPositionId: row.peoplePortalPositionId,
          resourceName: row.resourceName,
          email: row.email,
          roleCategory: row.roleCategory,
          specificRole: row.specificRole,
          title: row.title,
          status: row.status,
          allocation: row.allocation ?? 0,
          resourceType: resolved.resourceType,
          vendor: resolved.vendor,
          dailyRate: row.dailyRate,
          lineManager: row.lineManager,
          location: row.location,
          expectedFunding: row.expectedFunding,
          expectedFunding2025: row.expectedFunding2025,
          expectedStartDate: row.expectedStartDate,
          expectedEndDate: row.expectedEndDate,
          fundingType: row.fundingType,
          hourlyRate: row.hourlyRate,
        }
      }),
    })

    return nextBatch
  })

  for (const funding of fundingValues) {
    await upsertSeatReferenceValue(
      {
        year,
        type: "FUNDING" as SeatReferenceValueType,
        value: funding,
      },
      actor
    )
  }

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
          sourceRowCount: options.sourceRowCount,
          importedRowCount: dedupedRows.length,
          skippedBlankSeatRows: options.skippedBlankSeatRows ?? 0,
          skippedHistoricalRows: options.skippedHistoricalRows ?? 0,
          errorRowCount,
          importedPeople: dedupedRows.length,
        }),
      },
    ],
  })

  return {
    batch,
    errorRowCount,
    skippedHistoricalRows: options.skippedHistoricalRows ?? 0,
  }
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

  return persistRosterImportRows(
    year,
    fileName,
    activeRowsWithSeatId.map((row) => {
      const departmentCode =
        rosterHeaderValue(
          row,
          "Department Code",
          "Department code",
          "Department",
          "Cost Center",
          "Cost centre",
          "Cost center"
        ) || null
      const domain = rosterHeaderValue(row, "Domain") || null

      return {
        seatId: String(rosterHeaderValue(row, "Seat ID")).trim(),
        domain: departmentCode || domain,
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
      }
    }),
    actor,
    {
      sourceRowCount: rows.length,
      skippedBlankSeatRows: rows.length - rowsWithSeatId.length,
      skippedHistoricalRows,
    }
  )
}

export async function importRosterJson(
  year: number,
  fileName: string,
  payloadRows: unknown,
  actor?: AuditActor
) {
  const rows = Array.isArray(payloadRows) ? payloadRows : [payloadRows]
  if (rows.length === 0) {
    throw new Error("Roster payload is empty.")
  }

  const normalizedRows = rows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`Roster row ${index + 1} must be an object.`)
    }

    const body = row as Record<string, unknown>
    const seatId = normalizeJsonText(body.seatId)
    if (!seatId) {
      throw new Error(`Roster row ${index + 1} is missing seatId.`)
    }

    return {
      seatId,
      domain: normalizeJsonText(body.domain),
      productLine: normalizeJsonText(body.productLine),
      teamName: normalizeJsonText(body.teamName),
      band: normalizeJsonText(body.band),
      peoplePortalPositionId: normalizeJsonText(body.peoplePortalPositionId),
      resourceName: normalizeJsonText(body.resourceName),
      email: normalizeJsonText(body.email),
      roleCategory: normalizeJsonText(body.roleCategory),
      specificRole: normalizeJsonText(body.specificRole),
      title: normalizeJsonText(body.title),
      status: normalizeJsonText(body.status),
      allocation: parseJsonNumber(body.allocation),
      resourceType: normalizeJsonText(body.resourceType),
      vendor: normalizeJsonText(body.vendor),
      dailyRate: parseJsonNumber(body.dailyRate),
      lineManager: normalizeJsonText(body.lineManager),
      location: normalizeJsonText(body.location),
      expectedFunding: normalizeJsonText(body.expectedFunding),
      expectedFunding2025: normalizeJsonText(body.expectedFunding2025),
      expectedStartDate: parseJsonDate(body.expectedStartDate),
      expectedEndDate: parseJsonDate(body.expectedEndDate),
      fundingType: normalizeJsonText(body.fundingType),
      hourlyRate: parseJsonNumber(body.hourlyRate),
    } satisfies NormalizedRosterImportRow
  })

  return persistRosterImportRows(year, fileName, normalizedRows, actor, {
    sourceRowCount: rows.length,
  })
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
    !("Funding" in sample) ? "Funding" : null,
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
  const fundingValues = Array.from(
    new Set(
      rows
        .map((row) => row["Funding"]?.trim() ?? "")
        .filter((value) => value.length > 0)
    )
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
          funding,
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

  for (const funding of fundingValues) {
    await upsertSeatReferenceValue(
      {
        year,
        type: "FUNDING" as SeatReferenceValueType,
        value: funding,
      },
      actor
    )
  }

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
      teams: parseTeams(csvHeaderValue(row, "Teams", "teams")),
      notes: csvHeaderValue(row, "Notes", "notes").trim(),
    }))
    .filter(
      (row) =>
        row.sourceCode.length > 0 ||
        row.domain.length > 0 ||
        row.subDomain.length > 0 ||
        row.projectCode.length > 0 ||
        row.teams.length > 0
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
    normalizedRows.reduce<
      Map<
        string,
        {
          sourceCode: string
          domain: string
          subDomain: string
          projectCode: string
          teams: string[]
          notes: string
        }
      >
    >((map, row) => {
      const key = `${normalizeValue(row.sourceCode)}::${normalizeValue(row.subDomain)}::${normalizeValue(row.projectCode)}`
      const current = map.get(key)
      if (!current) {
        map.set(key, row)
        return map
      }

      map.set(key, {
        ...current,
        teams: Array.from(new Set([...current.teams, ...row.teams])).sort((left, right) =>
          left.localeCompare(right)
        ),
        notes: row.notes || current.notes,
      })
      return map
    }, new Map()).values()
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
          teams: row.teams,
          notes: row.notes || null,
        },
        create: {
          trackingYearId: trackingYear.id,
          codeType: "DEPARTMENT_CODE",
          sourceCode: row.sourceCode,
          domain: row.domain,
          subDomain: row.subDomain,
          projectCode: row.projectCode,
          teams: row.teams,
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
            field: "teams",
            oldValue: before?.teams ?? [],
            newValue: row.teams,
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

export async function importForecastOverridesCsv(
  year: number,
  content: string,
  actor?: AuditActor
) {
  const rows = parseCsv(content)
  if (rows.length === 0) {
    throw new Error("Forecast override file is empty.")
  }

  requireAnyHeader(rows, [
    {
      label: "Seat reference",
      headers: ["Tracker Seat ID", "Source Key", "Seat ID", "trackerSeatId", "sourceKey", "seatId"],
    },
    {
      label: "Month",
      headers: ["Month Number", "Month Index", "Month", "monthNumber", "monthIndex", "month"],
    },
    {
      label: "Forecast override data",
      headers: [
        "Forecast Override Amount",
        "Forecast Included",
        "forecastOverrideAmount",
        "forecastIncluded",
      ],
    },
  ])

  const hasOverrideAmountHeader = hasAnyHeader(rows, [
    "Forecast Override Amount",
    "forecastOverrideAmount",
  ])
  const hasForecastIncludedHeader = hasAnyHeader(rows, [
    "Forecast Included",
    "forecastIncluded",
  ])

  const normalizedRows = rows.filter((row) => {
    return (
      csvHeaderValue(row, "Tracker Seat ID", "Source Key", "Seat ID", "trackerSeatId", "sourceKey", "seatId")
        .trim()
        .length > 0
    )
  })

  if (normalizedRows.length === 0) {
    throw new Error("Forecast override file does not contain any importable rows.")
  }

  const seatLookup = await buildTrackerSeatLookup(year)

  for (const row of normalizedRows) {
    const seat = resolveTrackerSeat(row, seatLookup)
    const monthIndex = parseMonthIndex(row)
    if (monthIndex === null) {
      throw new Error(`Invalid month for seat ${seat.seatId}.`)
    }

    const overrideAmountRaw = csvHeaderValue(
      row,
      "Forecast Override Amount",
      "forecastOverrideAmount"
    )
    const overrideAmount = overrideAmountRaw.trim() ? parseNumber(overrideAmountRaw) : null
    if (overrideAmountRaw.trim() && overrideAmount === null) {
      throw new Error(`Invalid forecast override amount for seat ${seat.seatId}, ${MONTH_NAMES[monthIndex]}.`)
    }

    const forecastIncludedRaw = csvHeaderValue(
      row,
      "Forecast Included",
      "forecastIncluded"
    )
    const forecastIncluded = parseBoolean(forecastIncludedRaw)
    if (forecastIncludedRaw.trim() && forecastIncluded === null) {
      throw new Error(`Invalid forecast included value for seat ${seat.seatId}, ${MONTH_NAMES[monthIndex]}.`)
    }

    await updateTrackerSeat(
      seat.id,
      {
        monthIndex,
        forecastOverrideAmount: hasOverrideAmountHeader ? overrideAmount : undefined,
        forecastIncluded: hasForecastIncludedHeader ? (forecastIncluded ?? true) : undefined,
      },
      actor
    )
  }

  return { importedCount: normalizedRows.length }
}

export async function importTrackerOverridesCsv(
  year: number,
  content: string,
  actor?: AuditActor
) {
  const rows = parseCsv(content)
  if (rows.length === 0) {
    throw new Error("Tracker override file is empty.")
  }

  requireAnyHeader(rows, [
    {
      label: "Seat reference",
      headers: ["Tracker Seat ID", "Source Key", "Seat ID", "trackerSeatId", "sourceKey", "seatId"],
    },
    {
      label: "Tracker override fields",
      headers: [
        "Domain",
        "Sub-domain",
        "Funding",
        "Pillar",
        "Budget Area ID",
        "Cost Center",
        "Project Code",
        "Resource Type",
        "Team",
        "Name",
        "Description",
        "Band",
        "Location",
        "Vendor",
        "Manager",
        "Daily Rate",
        "RITM",
        "SOW",
        "Spend Plan ID",
        "Status",
        "Allocation",
        "Start Date",
        "End Date",
        "Notes",
      ],
    },
  ])

  const sample = rows[0] ?? {}
  const hasField = (...headers: string[]) => headers.some((header) => header in sample)
  const normalizedRows = rows.filter((row) => {
    const hasSeatReference = csvHeaderValue(
      row,
      "Tracker Seat ID",
      "Source Key",
      "Seat ID",
      "trackerSeatId",
      "sourceKey",
      "seatId"
    ).trim().length > 0
    const hasOverrideData = [
      "Domain",
      "Sub-domain",
      "Funding",
      "Pillar",
      "Budget Area ID",
      "Cost Center",
      "Project Code",
      "Resource Type",
      "Team",
      "Name",
      "Description",
      "Band",
      "Location",
      "Vendor",
      "Manager",
      "Daily Rate",
      "RITM",
      "SOW",
      "Spend Plan ID",
      "Status",
      "Allocation",
      "Start Date",
      "End Date",
      "Notes",
    ].some((header) => csvHeaderValue(row, header).trim().length > 0)

    return hasSeatReference && hasOverrideData
  })

  if (normalizedRows.length === 0) {
    throw new Error("Tracker override file does not contain any importable rows.")
  }

  const seatLookup = await buildTrackerSeatLookup(year)

  for (const row of normalizedRows) {
    const seat = resolveTrackerSeat(row, seatLookup)
    const allocationRaw = csvHeaderValue(row, "Allocation", "allocation")
    const allocation = allocationRaw.trim() ? parseNumber(allocationRaw) : null
    if (allocationRaw.trim() && allocation === null) {
      throw new Error(`Invalid allocation for seat ${seat.seatId}.`)
    }

    const startDateRaw = csvHeaderValue(row, "Start Date", "startDate")
    const startDate = startDateRaw.trim() ? parseDate(startDateRaw) : null
    if (startDateRaw.trim() && startDate === null) {
      throw new Error(`Invalid start date for seat ${seat.seatId}.`)
    }

    const endDateRaw = csvHeaderValue(row, "End Date", "endDate")
    const endDate = endDateRaw.trim() ? parseDate(endDateRaw) : null
    if (endDateRaw.trim() && endDate === null) {
      throw new Error(`Invalid end date for seat ${seat.seatId}.`)
    }

    await updateTrackerSeat(
      seat.id,
      {
        override: {
          domain: hasField("Domain", "domain") ? csvHeaderValue(row, "Domain", "domain").trim() || null : undefined,
          subDomain: hasField("Sub-domain", "SubDomain", "subDomain") ? csvHeaderValue(row, "Sub-domain", "SubDomain", "subDomain").trim() || null : undefined,
          funding: hasField("Funding", "funding") ? csvHeaderValue(row, "Funding", "funding").trim() || null : undefined,
          pillar: hasField("Pillar", "pillar") ? csvHeaderValue(row, "Pillar", "pillar").trim() || null : undefined,
          budgetAreaId: hasField("Budget Area ID", "budgetAreaId") ? csvHeaderValue(row, "Budget Area ID", "budgetAreaId").trim() || null : undefined,
          costCenter: hasField("Cost Center", "costCenter") ? csvHeaderValue(row, "Cost Center", "costCenter").trim() || null : undefined,
          projectCode: hasField("Project Code", "projectCode") ? csvHeaderValue(row, "Project Code", "projectCode").trim() || null : undefined,
          resourceType: hasField("Resource Type", "resourceType") ? csvHeaderValue(row, "Resource Type", "resourceType").trim() || null : undefined,
          team: hasField("Team", "team") ? csvHeaderValue(row, "Team", "team").trim() || null : undefined,
          inSeat: hasField("Name", "name", "inSeat") ? csvHeaderValue(row, "Name", "name", "inSeat").trim() || null : undefined,
          description: hasField("Description", "description") ? csvHeaderValue(row, "Description", "description").trim() || null : undefined,
          band: hasField("Band", "band") ? csvHeaderValue(row, "Band", "band").trim() || null : undefined,
          location: hasField("Location", "location") ? csvHeaderValue(row, "Location", "location").trim() || null : undefined,
          vendor: hasField("Vendor", "vendor") ? csvHeaderValue(row, "Vendor", "vendor").trim() || null : undefined,
          manager: hasField("Manager", "manager") ? csvHeaderValue(row, "Manager", "manager").trim() || null : undefined,
          dailyRate: hasField("Daily Rate", "dailyRate")
            ? parseNumber(csvHeaderValue(row, "Daily Rate", "dailyRate"))
            : undefined,
          ritm: hasField("RITM", "ritm") ? csvHeaderValue(row, "RITM", "ritm").trim() || null : undefined,
          sow: hasField("SOW", "sow") ? csvHeaderValue(row, "SOW", "sow").trim() || null : undefined,
          spendPlanId: hasField("Spend Plan ID", "spendPlanId") ? csvHeaderValue(row, "Spend Plan ID", "spendPlanId").trim() || null : undefined,
          status: hasField("Status", "status") ? csvHeaderValue(row, "Status", "status").trim() || null : undefined,
          allocation: hasField("Allocation", "allocation") ? allocation : undefined,
          startDate: hasField("Start Date", "startDate") ? startDate : undefined,
          endDate: hasField("End Date", "endDate") ? endDate : undefined,
          notes: hasField("Notes", "notes") ? csvHeaderValue(row, "Notes", "notes").trim() || null : undefined,
        },
      },
      actor
    )
  }

  return { importedCount: normalizedRows.length }
}

export async function importSeatReferenceValuesCsv(
  year: number,
  type: SeatReferenceValueType,
  content: string,
  actor?: AuditActor
) {
  const rows = parseCsv(content)
  if (rows.length === 0) {
    throw new Error("Reference value file is empty.")
  }

  requireAnyHeader(rows, [
    {
      label: "Value",
      headers: ["Value", "value"],
    },
  ])

  const values = Array.from(
    new Set(
      rows
        .map((row) => csvHeaderValue(row, "Value", "value").trim())
        .filter((value) => value.length > 0)
    )
  )

  if (values.length === 0) {
    throw new Error("Reference value file does not contain any importable rows.")
  }

  for (const value of values) {
    await upsertSeatReferenceValue(
      {
        year,
        type,
        value,
      },
      actor
    )
  }

  return { importedCount: values.length }
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
  const [trackerSeats, assumptions, exchangeRates] = await Promise.all([
    prisma.trackerSeat.findMany({
      where: {
        trackingYearId: trackingYear.id,
        isActive: true,
      },
      include: {
        months: {
          orderBy: { monthIndex: "asc" },
        },
        override: true,
        budgetArea: true,
      },
    }),
    prisma.costAssumption.findMany({
      where: { trackingYearId: trackingYear.id },
    }),
    prisma.exchangeRate.findMany({
      where: { trackingYearId: trackingYear.id },
      orderBy: { effectiveDate: "desc" },
    }),
  ])
  const assumptionLookup = buildCostAssumptionLookup(assumptions)
  const usedForecastBySeatMonth = new Map<string, number>()
  for (const seat of trackerSeats as SeatWithRelations[]) {
    const metrics = deriveSeatMetrics(seat, assumptionLookup, exchangeRates, year)
    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
      usedForecastBySeatMonth.set(
        `${seat.id}:${monthIndex}`,
        metrics.monthlyForecast[monthIndex] ?? 0
      )
    }
  }
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
          usedForecastAmount:
            trackerSeatBySeatId.get(seatId)?.id
              ? usedForecastBySeatMonth.get(
                  `${trackerSeatBySeatId.get(seatId)?.id}:${monthHeader.monthIndex}`
                ) ?? 0
              : null,
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
        sourceKind: ExternalActualSourceKind.CSV,
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
        sourceKind: ExternalActualSourceKind.CSV,
        seatId: row.seatId,
        team: row.team,
        inSeat: row.inSeat,
        description: row.description,
        monthIndex: row.monthIndex,
        monthLabel: row.monthLabel,
        amount: row.amount,
        originalAmount: row.amount,
        originalCurrency: "DKK",
        usedForecastAmount: row.usedForecastAmount,
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
          usedForecastAmount: isClearingActual ? null : row.usedForecastAmount,
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
          usedForecastAmount: isClearingActual ? null : row.usedForecastAmount,
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
