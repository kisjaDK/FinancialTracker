import type {
  BudgetArea,
  BudgetMovement,
  CostAssumption,
  CurrencyCode,
  DepartmentMapping,
  ExchangeRate,
  Prisma,
  SeatReferenceValueType,
  ServiceMessageKey,
  StaffingTargetScopeLevel,
} from "@prisma/client"
import {
  ALLOWED_SEAT_STATUSES,
  CLOUD_CATEGORY,
  DEFAULT_ACTIVE_SEAT_STATUSES,
  MONTH_NAMES,
  WORK_DAYS_PER_YEAR,
} from "@/lib/finance/constants"
import type { AuditActor } from "@/lib/finance/audit"
import { buildAuditChanges, writeAuditLog } from "@/lib/finance/audit"
import { buildAccrualsPageModel } from "@/lib/finance/accruals"
import {
  buildExchangeRateLookup,
  convertAmountToDkk,
  findClosestPriorExchangeRate,
} from "@/lib/finance/currency"
import {
  buildCostAssumptionLookup,
  deriveSeatMetrics,
  getEffectiveSeat,
  isMonthActiveForSeat,
  isTrackerCancelledSeat,
  isExternalSeat,
  monthLabel,
} from "@/lib/finance/derive"
import type {
  BudgetAreaSummary,
  ExternalActualImportBatchView,
  ExternalActualImportFilters,
  ExternalActualImportView,
  BudgetMovementImportBatchView,
  AccrualFilters,
  AccrualAccountMappingView,
  BudgetMovementFilters,
  BudgetMovementFilterOption,
  AccrualSummaryRow,
  BudgetMovementView,
  DepartmentMappingView,
  LatestExchangeRate,
  PeopleRosterFilters,
  PeopleRosterView,
  SeatMonthView,
  SeatReferenceValueView,
  SeatWithRelations,
  StaffingMonthBucket,
  StaffingOverviewGroup,
  StaffingOverviewRow,
  StaffingTargetView,
  StatusDefinitionView,
} from "@/lib/finance/types"
import { filterByScopes, hasScopeRestrictions, type AppViewer } from "@/lib/authz"
import { getPrismaClient, prisma } from "@/lib/prisma"

export const INTERNAL_ACTUALS_SERVICE_MESSAGE_KEY: ServiceMessageKey =
  "INTERNAL_ACTUALS"

export const TRACKER_DOMAIN_EXPORT_HEADERS = [
  "Tracker Seat ID",
  "Source Key",
  "Seat ID",
  "Source Type",
  "Budget Area ID",
  "Domain",
  "Sub-domain",
  "Funding",
  "Pillar",
  "Cost Center",
  "Project Code",
  "Team",
  "In Seat",
  "Description",
  "Resource Type",
  "Band",
  "Location",
  "Vendor",
  "Daily Rate",
  "Status",
  "Allocation",
  "Start Date",
  "End Date",
  "Spend Plan ID",
  "RITM",
  "SOW",
  "Notes",
  "Total Spent DKK",
  "Total Forecast DKK",
  "Yearly Cost Internal DKK",
  "Yearly Cost External DKK",
  "Has Forecast Adjustments",
  "Roster Seat ID",
  "Roster Import File",
  "Roster Domain",
  "Roster Product Line",
  "Roster Team",
  "Roster Name",
  "Roster Email",
  "Roster Role Category",
  "Roster Specific Role",
  "Roster Title",
  "Roster Status",
  "Roster Allocation",
  "Roster Resource Type",
  "Roster Vendor",
  "Roster Daily Rate",
  "Roster Manager",
  "Roster Location",
  "Roster Expected Funding",
  "Roster Expected Funding 2025",
  "Roster Funding Type",
  "Roster Hourly Rate",
  "Roster Start Date",
  "Roster End Date",
  "Roster Import Error",
  ...MONTH_NAMES.flatMap((label) => [
    `${label} Forecast`,
    `${label} Actual DKK`,
    `${label} Actual Raw`,
    `${label} Actual Currency`,
    `${label} Actual FX Rate`,
    `${label} Forecast Included`,
    `${label} Forecast Override`,
    `${label} Used Forecast`,
    `${label} Month Notes`,
  ]),
] as const

const trackerSeatDerivationByYear = new Map<number, Promise<void>>()

type TrackerYearSnapshot = {
  budgetAreas: BudgetArea[]
  budgetMovements: BudgetMovement[]
  seats: SeatWithRelations[]
  assumptions: CostAssumption[]
  exchangeRates: ExchangeRate[]
  departmentMappings: DepartmentMapping[]
}

function logTrackerSummaryTiming(input: {
  durationMs: number
  activeYear: number
  summaryCount: number
  selectedAreaId: string | null
}) {
  if (process.env.NODE_ENV === "production") {
    return
  }

  console.info(
    `[tracker.summary] ${input.durationMs.toFixed(1)}ms year=${input.activeYear} summary=${input.summaryCount} selectedArea=${input.selectedAreaId ?? "none"}`
  )
}

function normalizeValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ""
}

function filterScopedItems<T>(
  items: T[],
  viewer: Pick<AppViewer, "role" | "scopes"> | undefined,
  getScope: (item: T) => {
    domain: string | null | undefined
    subDomain: string | null | undefined
  }
) {
  if (!viewer) {
    return items
  }

  return filterByScopes(items, viewer, getScope)
}

function buildTrackerSeatScopeWhere(
  viewer?: Pick<AppViewer, "role" | "scopes">
): Prisma.TrackerSeatWhereInput | undefined {
  if (!viewer || !hasScopeRestrictions(viewer)) {
    return undefined
  }

  const scopeFilters: Prisma.TrackerSeatWhereInput[] = []

  for (const scope of viewer.scopes) {
      const domain = scope.domain.trim()
      const subDomain = scope.subDomain?.trim() || null

      if (!domain) {
        continue
      }

      scopeFilters.push(
        subDomain
          ? {
            domain: { equals: domain, mode: "insensitive" as const },
            subDomain: { equals: subDomain, mode: "insensitive" as const },
          }
          : {
            domain: { equals: domain, mode: "insensitive" as const },
          },
      )
    }

  if (scopeFilters.length === 0) {
    return undefined
  }

  return {
    OR: scopeFilters,
  }
}

function normalizeDomainLabel(value: string | null | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) {
    return null
  }

  return normalizeValue(trimmed) === "data and analytics"
    ? "Data & Analytics"
    : trimmed
}

function normalizeSubDomainLabel(value: string | null | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) {
    return null
  }

  return trimmed
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

function buildSourceKey(seatId: string) {
  return `roster:${seatId}`
}

function normalizeAllocation(value: number | null | undefined) {
  if (!value) {
    return 0
  }

  return value > 1 ? value / 100 : value
}

function formatExportDate(value: Date | string | null | undefined) {
  if (!value) {
    return ""
  }

  return new Date(value).toISOString().slice(0, 10)
}

async function computeSeatMonthForecastSnapshot(input: {
  seat: SeatWithRelations
  year: number
  monthIndex: number
  assumptions: CostAssumption[]
  exchangeRates: ExchangeRate[]
}) {
  const assumptionLookup = buildCostAssumptionLookup(input.assumptions)
  const metrics = deriveSeatMetrics(
    input.seat,
    assumptionLookup,
    input.exchangeRates,
    input.year
  )

  return metrics.monthlyForecast[input.monthIndex] ?? 0
}

function computeAreaDisplayName(area: {
  displayName: string | null
  subDomain?: string | null
  pillar: string | null
  projectCode: string
  costCenter: string
}) {
  return (
    area.displayName ||
    `${area.subDomain || area.pillar || area.projectCode} · ${area.costCenter}`
  )
}

function buildDepartmentCodeKey(sourceCode: string | null | undefined) {
  return normalizeValue(sourceCode)
}

function buildDepartmentMappingLookup(
  mappings: {
    id?: string
    sourceCode: string
    domain: string
    subDomain: string
    projectCode?: string | null
    teams?: string[]
  }[]
) {
  return mappings.reduce<
    Record<string, { id?: string; domain: string; subDomain: string; projectCode: string; teams: string[] }[]>
  >(
    (accumulator, mapping) => {
      const key = buildDepartmentCodeKey(mapping.sourceCode)
      accumulator[key] ||= []
      accumulator[key].push({
        id: mapping.id,
        domain: normalizeDomainLabel(mapping.domain) || mapping.domain,
        subDomain: normalizeSubDomainLabel(mapping.subDomain) || mapping.subDomain,
        projectCode: mapping.projectCode?.trim() || "",
        teams: collectSortedValues(mapping.teams ?? []),
      })

      return accumulator
    },
    {}
  )
}

function normalizeDepartmentMappingTeams(input: Array<string | null | undefined>) {
  return collectSortedValues(input.map((team) => normalizeOptionalString(team)))
}

function resolveDepartmentMapping(
  mappingLookup: ReturnType<typeof buildDepartmentMappingLookup>,
  input: {
    sourceCode: string | null | undefined
    subDomain?: string | null | undefined
    projectCode?: string | null | undefined
  }
) {
  const candidates = mappingLookup[buildDepartmentCodeKey(input.sourceCode)] || []

  if (candidates.length === 0) {
    return undefined
  }

  const normalizedProjectCode = normalizeValue(input.projectCode)
  const normalizedSubDomain = normalizeValue(normalizeSubDomainLabel(input.subDomain))

  if (normalizedProjectCode) {
    const projectMatch = candidates.find(
      (mapping) => normalizeValue(mapping.projectCode) === normalizedProjectCode
    )
    if (projectMatch) {
      return projectMatch
    }
  }

  if (normalizedSubDomain) {
    const exactSubDomain = candidates.find(
      (mapping) => normalizeValue(mapping.subDomain) === normalizedSubDomain
    )
    if (exactSubDomain) {
      return exactSubDomain
    }

    const fuzzySubDomain = candidates.find((mapping) =>
      normalizeValue(mapping.subDomain).includes(normalizedSubDomain)
    )
    if (fuzzySubDomain) {
      return fuzzySubDomain
    }
  }

  return candidates[0]
}

function resolveDepartmentMappingByDomain(
  mappings: Array<{ domain?: string | null; subDomain: string; projectCode?: string | null }>,
  input: {
    domain: string | null | undefined
    subDomain?: string | null | undefined
    projectCode?: string | null | undefined
  }
) {
  const normalizedDomain = normalizeValue(normalizeDomainLabel(input.domain))
  const normalizedSubDomain = normalizeValue(normalizeSubDomainLabel(input.subDomain))
  const normalizedProjectCode = normalizeValue(input.projectCode)

  const domainMatches = mappings.filter(
    (mapping) =>
      normalizeValue(normalizeDomainLabel(mapping.domain)) === normalizedDomain
  )

  if (domainMatches.length === 0) {
    return undefined
  }

  if (normalizedProjectCode) {
    const projectMatch = domainMatches.find(
      (mapping) => normalizeValue(mapping.projectCode) === normalizedProjectCode
    )

    if (projectMatch) {
      return projectMatch
    }
  }

  if (normalizedSubDomain) {
    const exactSubDomain = domainMatches.find(
      (mapping) =>
        normalizeValue(normalizeSubDomainLabel(mapping.subDomain)) === normalizedSubDomain
    )

    if (exactSubDomain) {
      return exactSubDomain
    }

    const fuzzySubDomain = domainMatches.find((mapping) =>
      normalizeValue(normalizeSubDomainLabel(mapping.subDomain)).includes(
        normalizedSubDomain
      )
    )

    if (fuzzySubDomain) {
      return fuzzySubDomain
    }
  }

  return domainMatches[0]
}

function normalizeOptionalString(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeOptionalNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function parseNextSeatId(seatIds: string[]) {
  const numericSeatIds = seatIds
    .map((seatId) => seatId.trim())
    .filter((seatId) => /^\d+$/.test(seatId))
    .map((seatId) => Number(seatId))
    .filter((seatId) => Number.isSafeInteger(seatId))

  const highestSeatId = numericSeatIds.length > 0 ? Math.max(...numericSeatIds) : 0
  return String(highestSeatId + 1)
}

function normalizeSeatReferenceValue(value: string | null | undefined) {
  return value?.trim() || null
}

function formatDateOnly(value: Date | null | undefined) {
  if (!value) {
    return ""
  }

  const date = new Date(value)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function isPermRosterPerson(person: Pick<PeopleRosterView, "band" | "resourceType" | "vendor">) {
  const band = normalizeValue(person.band)
  const resourceType = normalizeValue(person.resourceType)
  const vendor = normalizeValue(person.vendor)
  const hasExternalVendor =
    vendor.length > 0 &&
    vendor !== "internal" &&
    vendor !== "employee" &&
    vendor !== "permanent"

  return !(
    band === "external" ||
    resourceType.includes("external") ||
    resourceType.includes("managed services") ||
    hasExternalVendor
  )
}

function normalizeBudgetMovementDate(value: Date | string | null | undefined) {
  if (!value) {
    return null
  }

  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function ensureValidYear(year: number) {
  if (!Number.isInteger(year)) {
    throw new Error("Year is required.")
  }
}

function buildSummaryKey(input: {
  subDomain: string | null | undefined
  projectCode: string | null | undefined
}) {
  return `${input.subDomain?.trim() || "Unmapped"}::${input.projectCode?.trim() || "Unassigned"}`
}

function parseSummaryKey(summaryKey: string) {
  const [subDomain, projectCode] = summaryKey.split("::")

  return {
    subDomain: subDomain === "Unmapped" ? null : subDomain || null,
    projectCode: projectCode === "Unassigned" ? null : projectCode || null,
  }
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

async function ensureStatusDefinitions(year: number) {
  const trackingYear = await getOrCreateTrackingYear(year)

  await Promise.all(
    ALLOWED_SEAT_STATUSES.map((label, index) =>
      prisma.statusDefinition.upsert({
        where: {
          trackingYearId_label: {
            trackingYearId: trackingYear.id,
            label,
          },
        },
        update: {
          sortOrder: index,
        },
        create: {
          trackingYearId: trackingYear.id,
          label,
          sortOrder: index,
          isActiveStatus: DEFAULT_ACTIVE_SEAT_STATUSES.some(
            (status) => status === label
          ),
        },
      })
    )
  )

  return prisma.statusDefinition.findMany({
    where: { trackingYearId: trackingYear.id },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  })
}

function buildActiveStatusLookup(statusDefinitions: StatusDefinitionView[]) {
  return new Set(
    statusDefinitions
      .filter((status) => status.isActiveStatus)
      .map((status) => normalizeValue(status.label))
  )
}

export function emptyStaffingMonthBuckets(): StaffingMonthBucket[] {
  return Array.from({ length: 12 }, () => ({
    active: 0,
    onLeave: 0,
    open: 0,
  }))
}

function sumStaffingMonthBuckets(
  left: StaffingMonthBucket[],
  right: StaffingMonthBucket[]
) {
  return left.map((month, index) => ({
    active: month.active + (right[index]?.active ?? 0),
    onLeave: month.onLeave + (right[index]?.onLeave ?? 0),
    open: month.open + (right[index]?.open ?? 0),
  }))
}

function matchesActiveBucket(
  normalizedStatus: string,
  normalizedInSeat: string,
  activeStatuses: Set<string>
) {
  return (
    activeStatuses.has(normalizedStatus) ||
    (normalizedStatus.length === 0 &&
      normalizedInSeat.length > 0 &&
      normalizedInSeat !== "vacant")
  )
}

function normalizeStaffingProjectCode(value: string | null | undefined) {
  return value?.trim() || null
}

function buildStaffingRowKey(input: {
  subDomain: string | null | undefined
  projectCode: string | null | undefined
}) {
  return `${input.subDomain?.trim() || "Unmapped"}::${input.projectCode?.trim() || "Unassigned"}`
}

function buildStaffingTargetLookup(targets: StaffingTargetView[]) {
  return targets.reduce(
    (accumulator, target) => {
      const key = [
        target.scopeLevel,
        normalizeValue(target.domain),
        normalizeValue(target.subDomain),
        normalizeValue(target.projectCode),
      ].join("::")
      accumulator.set(key, target.permTarget)
      return accumulator
    },
    new Map<string, number>()
  )
}

function getStaffingTargetValue(
  lookup: Map<string, number>,
  scopeLevel: StaffingTargetScopeLevel,
  domain: string | null | undefined,
  subDomain: string | null | undefined,
  projectCode: string | null | undefined
) {
  if (!domain) {
    return null
  }

  const key = [
    scopeLevel,
    normalizeValue(domain),
    normalizeValue(subDomain),
    normalizeValue(projectCode),
  ].join("::")

  return lookup.get(key) ?? null
}

export function buildStaffingOverviewRows(input: {
  seats: SeatWithRelations[]
  year: number
  activeStatuses: Set<string>
  mappingLookup: ReturnType<typeof buildDepartmentMappingLookup>
  targets: StaffingTargetView[]
}) {
  const rowMap = new Map<string, StaffingOverviewRow>()
  const targetLookup = buildStaffingTargetLookup(input.targets)

  for (const seat of input.seats) {
    const effectiveSeat = getEffectiveSeat(seat)
    if (isExternalSeat(effectiveSeat)) {
      continue
    }

    const mappedHierarchy = resolveDepartmentMapping(input.mappingLookup, {
      sourceCode: effectiveSeat.costCenter,
      subDomain: effectiveSeat.subDomain,
      projectCode: effectiveSeat.projectCode,
    })
    const domain = normalizeDomainLabel(mappedHierarchy?.domain || effectiveSeat.domain || null)
    if (!domain) {
      continue
    }

    const subDomain = normalizeSubDomainLabel(
      mappedHierarchy?.subDomain || effectiveSeat.subDomain || null
    )
    const projectCode = normalizeStaffingProjectCode(
      mappedHierarchy?.projectCode || effectiveSeat.projectCode
    )
    const rowKey = buildStaffingRowKey({ subDomain, projectCode })
    const existing = rowMap.get(rowKey)
    const row =
      existing ??
      {
        id: rowKey,
        domain,
        subDomain,
        projectCode,
        permTarget: getStaffingTargetValue(
          targetLookup,
          "PROJECT",
          domain,
          subDomain,
          projectCode
        ),
        months: emptyStaffingMonthBuckets(),
      }

    const normalizedStatus = normalizeValue(effectiveSeat.status)
    const normalizedInSeat = normalizeValue(effectiveSeat.inSeat)

    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
      if (
        !isMonthActiveForSeat(
          input.year,
          monthIndex,
          effectiveSeat.startDate,
          effectiveSeat.endDate
        )
      ) {
        continue
      }

      if (normalizedStatus === "open") {
        row.months[monthIndex].open += effectiveSeat.allocation ?? 0
        continue
      }

      if (normalizedStatus === "on leave") {
        row.months[monthIndex].onLeave += effectiveSeat.allocation ?? 0
        continue
      }

      if (
        matchesActiveBucket(
          normalizedStatus,
          normalizedInSeat,
          input.activeStatuses
        )
      ) {
        row.months[monthIndex].active += effectiveSeat.allocation ?? 0
      }
    }

    rowMap.set(rowKey, row)
  }

  return Array.from(rowMap.values()).sort((left, right) => {
    const subDomainOrder = (left.subDomain || "Unmapped").localeCompare(
      right.subDomain || "Unmapped"
    )

    if (subDomainOrder !== 0) {
      return subDomainOrder
    }

    return (left.projectCode || "Unassigned").localeCompare(
      right.projectCode || "Unassigned"
    )
  })
}

function buildStaffingOverviewGroups(
  rows: StaffingOverviewRow[],
  domain: string,
  targets: StaffingTargetView[]
): StaffingOverviewGroup[] {
  const targetLookup = buildStaffingTargetLookup(targets)
  const grouped = new Map<string, StaffingOverviewGroup>()

  for (const row of rows) {
    const groupKey = row.subDomain || "Unmapped"
    const current = grouped.get(groupKey)
    const nextMonths = current
      ? sumStaffingMonthBuckets(current.months, row.months)
      : row.months

    grouped.set(groupKey, {
      subDomain: row.subDomain,
      permTarget:
        current?.permTarget ??
        getStaffingTargetValue(targetLookup, "SUB_DOMAIN", domain, row.subDomain, null),
      months: nextMonths,
      rows: [...(current?.rows ?? []), row],
    })
  }

  return Array.from(grouped.values()).sort((left, right) =>
    (left.subDomain || "Unmapped").localeCompare(right.subDomain || "Unmapped")
  )
}

export function validateStaffingTargetInput(input: {
  scopeLevel: StaffingTargetScopeLevel
  domain: string
  subDomain?: string | null
  projectCode?: string | null
  permTarget: number
}) {
  const domain = input.domain.trim()
  const subDomain = normalizeOptionalString(input.subDomain)
  const projectCode = normalizeOptionalString(input.projectCode)

  if (!domain) {
    throw new Error("Domain is required.")
  }

  if (!Number.isFinite(input.permTarget) || input.permTarget < 0) {
    throw new Error("PERM target must be zero or greater.")
  }

  if (input.scopeLevel === "DOMAIN") {
    return {
      scopeLevel: input.scopeLevel,
      domain,
      subDomain: null,
      projectCode: null,
      permTarget: input.permTarget,
    }
  }

  if (!subDomain) {
    throw new Error("Sub-domain is required for this target.")
  }

  if (input.scopeLevel === "SUB_DOMAIN") {
    return {
      scopeLevel: input.scopeLevel,
      domain,
      subDomain,
      projectCode: null,
      permTarget: input.permTarget,
    }
  }

  if (!projectCode) {
    throw new Error("Project code is required for project targets.")
  }

  return {
    scopeLevel: input.scopeLevel,
    domain,
    subDomain,
    projectCode,
    permTarget: input.permTarget,
  }
}

async function ensureFreshTrackerDerivation(year: number) {
  const trackingYear = await getOrCreateTrackingYear(year)
  const staleSeat = await prisma.trackerSeat.findFirst({
    where: {
      trackingYearId: trackingYear.id,
      sourceType: "ROSTER",
      isActive: true,
      budgetAreaId: null,
      rosterPerson: {
        productLine: {
          not: null,
        },
      },
    },
    select: { id: true },
  })

  if (staleSeat) {
    await deriveTrackerSeatsForYear(year)
  }
}

async function loadTrackerYearSnapshot(
  trackingYearId: string,
  options?: {
    includeBudgetMovements?: boolean
    seatOrderBy?: Prisma.TrackerSeatOrderByWithRelationInput[]
  }
): Promise<TrackerYearSnapshot> {
  const includeBudgetMovements = options?.includeBudgetMovements ?? true

  const [budgetAreas, budgetMovements, seats, assumptions, exchangeRates, departmentMappings] =
    await Promise.all([
      prisma.budgetArea.findMany({
        where: { trackingYearId },
        orderBy: [{ domain: "asc" }, { subDomain: "asc" }, { costCenter: "asc" }],
      }),
      includeBudgetMovements
        ? prisma.budgetMovement.findMany({
            where: { trackingYearId },
          })
        : Promise.resolve([]),
      prisma.trackerSeat.findMany({
        where: {
          trackingYearId,
          isActive: true,
        },
        include: {
          months: {
            orderBy: { monthIndex: "asc" },
          },
          override: true,
          budgetArea: true,
        },
        orderBy: options?.seatOrderBy,
      }),
      prisma.costAssumption.findMany({
        where: { trackingYearId },
      }),
      prisma.exchangeRate.findMany({
        where: { trackingYearId },
        orderBy: { effectiveDate: "desc" },
      }),
      prisma.departmentMapping.findMany({
        where: {
          trackingYearId,
          codeType: "DEPARTMENT_CODE",
        },
      }),
    ])

  return {
    budgetAreas,
    budgetMovements,
    seats: seats as SeatWithRelations[],
    assumptions,
    exchangeRates,
    departmentMappings,
  }
}

async function ensureSeatMonthsForSeats(trackerSeatIds: string[]) {
  if (trackerSeatIds.length === 0) {
    return
  }

  const existingMonths = await prisma.seatMonth.findMany({
    where: {
      trackerSeatId: {
        in: trackerSeatIds,
      },
    },
    select: {
      trackerSeatId: true,
      monthIndex: true,
    },
  })

  const existingBySeatId = new Map<string, Set<number>>()

  for (const month of existingMonths) {
    const existing = existingBySeatId.get(month.trackerSeatId) ?? new Set<number>()
    existing.add(month.monthIndex)
    existingBySeatId.set(month.trackerSeatId, existing)
  }

  const missingMonths = trackerSeatIds.flatMap((trackerSeatId) => {
    const existing = existingBySeatId.get(trackerSeatId) ?? new Set<number>()

    return Array.from({ length: 12 }, (_, monthIndex) => monthIndex)
      .filter((monthIndex) => !existing.has(monthIndex))
      .map((monthIndex) => ({
        trackerSeatId,
        monthIndex,
      }))
  })

  if (missingMonths.length === 0) {
    return
  }

  await prisma.seatMonth.createMany({
    data: missingMonths,
  })
}

function collectSortedValues(values: (string | null | undefined)[]) {
  return Array.from(
    new Set(
      values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))
    )
  ).sort((left, right) => left.localeCompare(right))
}

export type ActualsScopeSelectionInput = {
  budgetAreaId?: string | null
  domain?: string | null
  subDomain?: string | null
  projectCode?: string | null
}

export function resolveActualsScopeSelection(
  summary: Pick<BudgetAreaSummary, "id" | "domain" | "subDomain" | "projectCode">[],
  input?: ActualsScopeSelectionInput
) {
  const requestedArea =
    input?.budgetAreaId && summary.find((row) => row.id === input.budgetAreaId)
      ? summary.find((row) => row.id === input?.budgetAreaId) ?? null
      : null

  const requestedDomain = input?.domain?.trim() || null
  const selectedDomain =
    (requestedDomain &&
    summary.some((row) => normalizeValue(row.domain) === normalizeValue(requestedDomain))
      ? summary.find((row) => normalizeValue(row.domain) === normalizeValue(requestedDomain))
          ?.domain ?? requestedDomain
      : requestedArea?.domain) ??
    summary[0]?.domain ??
    null

  const rowsForDomain = summary.filter(
    (row) => normalizeValue(row.domain) === normalizeValue(selectedDomain)
  )

  const requestedSubDomain = input?.subDomain?.trim() || null
  const selectedSubDomain =
    (requestedSubDomain &&
    rowsForDomain.some(
      (row) => normalizeValue(row.subDomain) === normalizeValue(requestedSubDomain)
    )
      ? rowsForDomain.find(
          (row) => normalizeValue(row.subDomain) === normalizeValue(requestedSubDomain)
        )?.subDomain ?? requestedSubDomain
      : requestedArea &&
          normalizeValue(requestedArea.domain) === normalizeValue(selectedDomain)
        ? requestedArea.subDomain
        : null) ??
    rowsForDomain[0]?.subDomain ??
    null

  const rowsForSubDomain = rowsForDomain.filter(
    (row) => normalizeValue(row.subDomain) === normalizeValue(selectedSubDomain)
  )

  const requestedProjectCode = input?.projectCode?.trim() || null
  const selectedProjectCode =
    (requestedProjectCode &&
    rowsForSubDomain.some(
      (row) => normalizeValue(row.projectCode) === normalizeValue(requestedProjectCode)
    )
      ? rowsForSubDomain.find(
          (row) => normalizeValue(row.projectCode) === normalizeValue(requestedProjectCode)
        )?.projectCode ?? requestedProjectCode
      : requestedArea &&
          normalizeValue(requestedArea.domain) === normalizeValue(selectedDomain) &&
          normalizeValue(requestedArea.subDomain) === normalizeValue(selectedSubDomain)
        ? requestedArea.projectCode
        : null) ??
    rowsForSubDomain[0]?.projectCode ??
    null

  const selectedRow =
    rowsForSubDomain.find(
      (row) => normalizeValue(row.projectCode) === normalizeValue(selectedProjectCode)
    ) ??
    rowsForSubDomain[0] ??
    requestedArea ??
    summary[0] ??
    null

  const projectCodeOptions = collectSortedValues(
    rowsForSubDomain.map((row) => row.projectCode)
  )

  return {
    selectedAreaId: selectedRow?.id ?? null,
    selectedDomain: selectedRow?.domain ?? selectedDomain,
    selectedSubDomain: selectedRow?.subDomain ?? selectedSubDomain,
    selectedProjectCode: selectedRow?.projectCode ?? selectedProjectCode,
    projectCodeOptions,
    showProjectCodeSelector: projectCodeOptions.length > 1,
  }
}

function normalizeValues(values: string[]) {
  return new Set(values.map((value) => normalizeValue(value)).filter(Boolean))
}

function getAccrualAccountMappingDelegate() {
  const currentPrisma = getPrismaClient()
  const delegate = (currentPrisma as typeof prisma & {
    accrualAccountMapping?: {
      findMany: typeof prisma.departmentMapping.findMany
      findFirst: typeof prisma.departmentMapping.findFirst
      findFirstOrThrow: typeof prisma.departmentMapping.findFirstOrThrow
      create: typeof prisma.departmentMapping.create
      update: typeof prisma.departmentMapping.update
      delete: typeof prisma.departmentMapping.delete
    }
  }).accrualAccountMapping

  return delegate ?? null
}

export function shouldHideForecastSeatForInactiveStatus(input: {
  hideInactiveStatuses: boolean
  status: string | null | undefined
  hasSeatIdSearch: boolean
  hasNameSearch: boolean
}) {
  if (!input.hideInactiveStatuses) {
    return false
  }

  const normalizedStatus = normalizeValue(input.status)
  const isCancelled =
    normalizedStatus === "cancelled" ||
    normalizedStatus === "cancelled- account still active in ad"
  const isClosed =
    normalizedStatus === "closed" ||
    normalizedStatus === "closed- account still active in ad"

  if (isCancelled) {
    return true
  }

  if (isClosed && !input.hasSeatIdSearch && !input.hasNameSearch) {
    return true
  }

  return false
}

function findMatchingBudgetArea(
  budgetAreas: {
    id: string
    domain: string | null
    subDomain: string | null
    displayName?: string | null
    funding: string | null
    pillar: string | null
    costCenter: string
    projectCode: string
  }[],
  productLine: string | null,
  fundingType: string | null
) {
  const normalizedProductLine = normalizeValue(productLine)
  const normalizedFunding = normalizeValue(fundingType)

  const exactSubDomain = budgetAreas.find(
    (area) => normalizeValue(area.subDomain) === normalizedProductLine
  )

  if (exactSubDomain) {
    return exactSubDomain
  }

  const subDomainContains = budgetAreas.find((area) =>
    normalizeValue(area.subDomain).includes(normalizedProductLine)
  )

  if (subDomainContains) {
    return subDomainContains
  }

  const displayNameContains = budgetAreas.find((area) =>
    normalizeValue(area.displayName).includes(normalizedProductLine)
  )

  if (displayNameContains) {
    return displayNameContains
  }

  const exactPillar = budgetAreas.find(
    (area) => normalizeValue(area.pillar) === normalizedProductLine
  )

  if (exactPillar) {
    return exactPillar
  }

  const pillarContains = budgetAreas.find((area) =>
    normalizeValue(area.pillar).includes(normalizedProductLine)
  )

  if (pillarContains) {
    return pillarContains
  }

  return budgetAreas.find(
    (area) =>
      normalizedFunding.length > 0 &&
      normalizeValue(area.funding) === normalizedFunding
  )
}

export function resolveRosterSeatAssignment(
  person: {
    domain: string | null
    productLine: string | null
    fundingType: string | null
    seatId: string
  },
  budgetAreas: {
    id: string
    domain: string | null
    subDomain: string | null
    funding: string | null
    pillar: string | null
    costCenter: string
    projectCode: string
  }[],
  mappingLookup: ReturnType<typeof buildDepartmentMappingLookup>,
  mappingsByDomain: Array<{
    domain?: string | null
    subDomain: string
    projectCode?: string | null
  }>,
  existingSeat?: {
    sourceKey: string
    projectCode: string | null
    override?: {
      projectCode: string | null
    } | null
  } | null
) {
  const fallbackBudgetArea = findMatchingBudgetArea(
    budgetAreas,
    person.productLine,
    person.fundingType
  )
  const mappedHierarchy =
    resolveDepartmentMapping(mappingLookup, {
      sourceCode: person.domain,
      subDomain: person.productLine,
      projectCode: fallbackBudgetArea?.projectCode,
    }) ||
    resolveDepartmentMappingByDomain(mappingsByDomain, {
      domain: person.domain,
      subDomain: person.productLine,
      projectCode: fallbackBudgetArea?.projectCode,
    }) ||
    resolveDepartmentMapping(mappingLookup, {
      sourceCode: fallbackBudgetArea?.costCenter,
      subDomain: person.productLine,
      projectCode: fallbackBudgetArea?.projectCode,
    })
  const mappedBudgetArea =
    mappedHierarchy?.projectCode && person.domain
      ? budgetAreas.find(
          (area) =>
            normalizeValue(area.costCenter) === normalizeValue(person.domain) &&
            normalizeValue(area.projectCode) === normalizeValue(mappedHierarchy.projectCode)
        )
      : null
  const budgetArea = mappedBudgetArea || fallbackBudgetArea
  const derivedProjectCode = mappedHierarchy?.projectCode || budgetArea?.projectCode || null
  const projectCode =
    existingSeat?.override?.projectCode && existingSeat.sourceKey === buildSourceKey(person.seatId)
      ? existingSeat.projectCode
      : derivedProjectCode

  return {
    mappedHierarchy,
    budgetArea,
    projectCode,
    domain: normalizeDomainLabel(
      mappedHierarchy?.domain || budgetArea?.domain || person.domain || null
    ),
    subDomain: normalizeSubDomainLabel(
      mappedHierarchy?.subDomain || budgetArea?.subDomain || person.productLine || null
    ),
    funding: person.fundingType || budgetArea?.funding || null,
    pillar: budgetArea?.pillar || person.productLine || null,
    costCenter: budgetArea?.costCenter || null,
  }
}

export async function deriveTrackerSeatsForYear(year: number) {
  const existingDerivation = trackerSeatDerivationByYear.get(year)
  if (existingDerivation) {
    await existingDerivation
    return
  }

  const derivation = deriveTrackerSeatsForYearInternal(year).finally(() => {
    trackerSeatDerivationByYear.delete(year)
  })

  trackerSeatDerivationByYear.set(year, derivation)
  await derivation
}

async function deriveTrackerSeatsForYearInternal(year: number) {
  const trackingYear = await getOrCreateTrackingYear(year)
  const rosterPeople = await prisma.rosterPerson.findMany({
    where: {
      trackingYearId: trackingYear.id,
      import: {
        status: "APPROVED",
      },
    },
    include: {
      import: true,
    },
    orderBy: [{ import: { importedAt: "desc" } }, { createdAt: "desc" }],
  })
  const latestPeopleBySeatId = Array.from(
    rosterPeople
      .reduce<Map<string, (typeof rosterPeople)[number]>>((latestPeople, person) => {
        if (!latestPeople.has(person.seatId)) {
          latestPeople.set(person.seatId, person)
        }

        return latestPeople
      }, new Map())
      .values()
  )

  const [budgetAreas, departmentMappings, existingRosterSeats] = await Promise.all([
    prisma.budgetArea.findMany({
      where: { trackingYearId: trackingYear.id },
    }),
    prisma.departmentMapping.findMany({
      where: {
        trackingYearId: trackingYear.id,
        codeType: "DEPARTMENT_CODE",
      },
    }),
    prisma.trackerSeat.findMany({
      where: {
        trackingYearId: trackingYear.id,
        sourceType: "ROSTER",
      },
      include: {
        override: true,
      },
    }),
  ])
  const mappingLookup = buildDepartmentMappingLookup(departmentMappings)
  const existingSeatBySourceKey = new Map(
    existingRosterSeats.map((seat) => [seat.sourceKey, seat])
  )
  const latestSourceKeys = latestPeopleBySeatId.map((person) => buildSourceKey(person.seatId))

  await prisma.trackerSeat.updateMany({
    where: {
      trackingYearId: trackingYear.id,
      sourceType: "ROSTER",
      isActive: true,
      ...(latestSourceKeys.length > 0
        ? {
            sourceKey: {
              notIn: latestSourceKeys,
            },
          }
        : {}),
    },
    data: {
      isActive: false,
    },
  })

  if (latestPeopleBySeatId.length === 0) {
    return
  }

  const touchedTrackerSeatIds: string[] = []

  for (const person of latestPeopleBySeatId) {
    const existingSeat = existingSeatBySourceKey.get(buildSourceKey(person.seatId))
    const assignment = resolveRosterSeatAssignment(
      person,
      budgetAreas,
      mappingLookup,
      departmentMappings,
      existingSeat
    )

    const trackerSeat = await prisma.trackerSeat.upsert({
      where: {
        trackingYearId_sourceKey: {
          trackingYearId: trackingYear.id,
          sourceKey: buildSourceKey(person.seatId),
        },
      },
      update: {
        rosterPersonId: person.id,
        budgetAreaId: assignment.budgetArea?.id ?? null,
        isActive: true,
        domain: assignment.domain,
        subDomain: assignment.subDomain,
        funding: assignment.funding,
        pillar: assignment.pillar,
        costCenter: assignment.costCenter,
        projectCode: assignment.projectCode,
        resourceType: person.resourceType,
        team: person.teamName,
        inSeat: person.resourceName,
        description: person.title,
        band: person.band,
        ppid: person.peoplePortalPositionId,
        location: person.location,
        vendor: person.vendor,
        manager: person.lineManager,
        dailyRate: person.dailyRate,
        status: person.status,
        allocation: normalizeAllocation(person.allocation),
        startDate: person.expectedStartDate,
        endDate: person.expectedEndDate,
      },
      create: {
        trackingYearId: trackingYear.id,
        rosterPersonId: person.id,
        budgetAreaId: assignment.budgetArea?.id ?? null,
        sourceType: "ROSTER",
        seatId: person.seatId,
        sourceKey: buildSourceKey(person.seatId),
        isActive: true,
        domain: assignment.domain,
        subDomain: assignment.subDomain,
        funding: assignment.funding,
        pillar: assignment.pillar,
        costCenter: assignment.costCenter,
        projectCode: assignment.projectCode,
        resourceType: person.resourceType,
        team: person.teamName,
        inSeat: person.resourceName,
        description: person.title,
        band: person.band,
        ppid: person.peoplePortalPositionId,
        location: person.location,
        vendor: person.vendor,
        manager: person.lineManager,
        dailyRate: person.dailyRate,
        status: person.status,
        allocation: normalizeAllocation(person.allocation),
        startDate: person.expectedStartDate,
        endDate: person.expectedEndDate,
      },
    })

    touchedTrackerSeatIds.push(trackerSeat.id)
  }

  await ensureSeatMonthsForSeats(touchedTrackerSeatIds)
}

export async function getFinanceWorkspaceData(
  year?: number,
  budgetAreaId?: string,
  trackerTeams?: string[],
  missingActualMonths?: string[],
  openSeatsOnly?: boolean,
  viewer?: Pick<AppViewer, "role" | "scopes">,
  actualsScopeInput?: ActualsScopeSelectionInput
) {
  const startedAt = performance.now()
  const trackingYears = await prisma.trackingYear.findMany({
    orderBy: { year: "asc" },
  })

  const activeYear =
    year ??
    trackingYears.find((trackingYear) => trackingYear.isActive)?.year ??
    trackingYears.at(-1)?.year ??
    new Date().getFullYear()

  const trackingYear = await getOrCreateTrackingYear(activeYear)
  await ensureFreshTrackerDerivation(activeYear)
  const statusDefinitions = await ensureStatusDefinitions(activeYear)
  const snapshot = await loadTrackerYearSnapshot(trackingYear.id, {
    includeBudgetMovements: true,
    seatOrderBy: [{ team: "asc" }, { inSeat: "asc" }],
  })

  const [summary, budgetAreas, departmentMappings, selectedAreaId] =
    await Promise.all([
      Promise.resolve(
        buildBudgetAreaSummaryFromSnapshot(activeYear, statusDefinitions, snapshot, viewer)
      ),
      Promise.resolve(snapshot.budgetAreas),
      Promise.resolve(snapshot.departmentMappings),
      Promise.resolve(budgetAreaId),
    ])

  const mappingLookup = buildDepartmentMappingLookup(departmentMappings)
  const resolvedBudgetAreas = budgetAreas.map((area) => {
    const mappedHierarchy = resolveDepartmentMapping(mappingLookup, {
      sourceCode: area.costCenter,
      subDomain: area.subDomain,
      projectCode: area.projectCode,
    })

    const subDomain =
      normalizeSubDomainLabel(mappedHierarchy?.subDomain || area.subDomain || null) || null
    const domain =
      normalizeDomainLabel(mappedHierarchy?.domain || area.domain || null) || null

    return {
      ...area,
      domain,
      subDomain,
      pillar: subDomain || area.pillar,
      displayName: subDomain || area.displayName,
    }
  })

  const scopedBudgetAreas = filterScopedItems(
    resolvedBudgetAreas,
    viewer,
    (area) => ({ domain: area.domain, subDomain: area.subDomain })
  )
  const scopedSeats = filterScopedItems(
    snapshot.seats as SeatWithRelations[],
    viewer,
    (seat) => {
      const effectiveSeat = getEffectiveSeat(seat)
      return { domain: effectiveSeat.domain, subDomain: effectiveSeat.subDomain }
    }
  )
  const availableAreaIds = new Set(summary.map((entry) => entry.id))
  const resolvedActualsScope = resolveActualsScopeSelection(summary, {
    budgetAreaId: selectedAreaId,
    domain: actualsScopeInput?.domain,
    subDomain: actualsScopeInput?.subDomain,
    projectCode: actualsScopeInput?.projectCode,
  })
  const effectiveAreaId =
    resolvedActualsScope.selectedAreaId &&
    availableAreaIds.has(resolvedActualsScope.selectedAreaId)
      ? resolvedActualsScope.selectedAreaId
        : selectedAreaId && availableAreaIds.has(selectedAreaId)
        ? selectedAreaId
        : summary[0]?.id ?? null
  const assumptionLookup = buildCostAssumptionLookup(snapshot.assumptions)
  const exchangeRateLookup = buildExchangeRateLookup(snapshot.exchangeRates)
  const seats =
    effectiveAreaId === null
      ? []
      : scopedSeats
          .map((seat) => {
            const effectiveSeat = getEffectiveSeat(seat)
            const summaryKey = buildSummaryKey({
              subDomain: effectiveSeat.subDomain,
              projectCode: effectiveSeat.projectCode,
            })

            return {
              seat,
              effectiveSeat,
              summaryKey,
            }
          })
          .filter(({ summaryKey, effectiveSeat }) => {
            if (summaryKey !== effectiveAreaId) {
              return false
            }

            return normalizeValue(effectiveSeat.resourceType) !== "cloud"
          })
          .map(({ seat, effectiveSeat }) => {
            const metrics = deriveSeatMetrics(
              seat,
              assumptionLookup,
              snapshot.exchangeRates,
              activeYear,
              {
                exchangeRateLookup,
              }
            )
            const cancelled = isTrackerCancelledSeat(effectiveSeat)

            return {
              ...effectiveSeat,
              months: seat.months.map((month) => {
                const converted =
                  month.actualAmountRaw !== null && month.actualAmountRaw !== undefined
                    ? convertAmountToDkk(
                        month.actualAmountRaw,
                        month.actualCurrency,
                        exchangeRateLookup
                      )
                    : {
                        amountDkk: month.actualAmount,
                        exchangeRateUsed: month.exchangeRateUsed,
                      }

                return {
                  monthIndex: month.monthIndex,
                  actualAmountDkk: cancelled ? 0 : (converted.amountDkk ?? 0),
                  actualAmountRaw: cancelled ? null : month.actualAmountRaw,
                  actualCurrency: month.actualCurrency,
                  exchangeRateUsed: converted.exchangeRateUsed ?? null,
                  forecastIncluded: month.forecastIncluded,
                  notes: month.notes,
                }
              }),
              totalSpent: metrics.totalSpent,
              totalForecast: metrics.totalForecast,
              permFte: metrics.permFte,
              extFte: metrics.extFte,
              yearlyCostInternal: metrics.yearlyCostInternal,
              yearlyCostExternal: metrics.yearlyCostExternal,
              monthlyForecast: metrics.monthlyForecast,
            }
          })
          .sort((left, right) => {
            const teamCompare = (left.team || "").localeCompare(right.team || "", undefined, {
              sensitivity: "base",
            })

            if (teamCompare !== 0) {
              return teamCompare
            }

            const nameCompare = (left.inSeat || "").localeCompare(right.inSeat || "", undefined, {
              sensitivity: "base",
            })

            if (nameCompare !== 0) {
              return nameCompare
            }

            return left.seatId.localeCompare(right.seatId, undefined, {
              sensitivity: "base",
            })
          })
  const internalActualsMessage = await prisma.serviceMessage.findUnique({
    where: {
      trackingYearId_key: {
        trackingYearId: trackingYear.id,
        key: INTERNAL_ACTUALS_SERVICE_MESSAGE_KEY,
      },
    },
  })

  const result = {
    activeYear,
    trackingYears,
    summary,
    seats,
    internalActualsMessage: internalActualsMessage?.content ?? null,
    budgetAreas: scopedBudgetAreas,
    selectedAreaId: effectiveAreaId,
    statusDefinitions,
    trackerTeamFilters: trackerTeams ?? [],
    trackerTeamOptions: [],
    missingActualMonthFilters: missingActualMonths ?? [],
    missingActualMonthOptions: MONTH_NAMES,
    openSeatsOnly: Boolean(openSeatsOnly),
  }

  logTrackerSummaryTiming({
    durationMs: performance.now() - startedAt,
    activeYear: result.activeYear,
    summaryCount: result.summary.length,
    selectedAreaId: result.selectedAreaId,
  })

  return result
}

export async function getForecastsPageData(input?: {
  year?: number
  domains?: string[]
  subDomains?: string[]
  teams?: string[]
  seatIds?: string[]
  names?: string[]
  statuses?: string[]
  hideInactiveStatuses?: boolean
  nonMonthStart?: boolean
  nonMonthEnd?: boolean
  reducedOnLeaveForecast?: boolean
  selectedSeatId?: string
}, viewer?: Pick<AppViewer, "role" | "scopes">) {
  const trackingYears = await prisma.trackingYear.findMany({
    orderBy: { year: "asc" },
  })

  const activeYear =
    input?.year ??
    trackingYears.find((trackingYear) => trackingYear.isActive)?.year ??
    trackingYears.at(-1)?.year ??
    new Date().getFullYear()

  const trackingYear = await getOrCreateTrackingYear(activeYear)
  await ensureFreshTrackerDerivation(activeYear)

  const [seats, assumptions, exchangeRates, internalActualsMessage] =
    await Promise.all([
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
        orderBy: [{ inSeat: "asc" }, { seatId: "asc" }],
      }),
      prisma.costAssumption.findMany({
        where: {
          trackingYearId: trackingYear.id,
        },
      }),
      prisma.exchangeRate.findMany({
        where: { trackingYearId: trackingYear.id },
        orderBy: { effectiveDate: "desc" },
      }),
      prisma.serviceMessage.findUnique({
        where: {
          trackingYearId_key: {
            trackingYearId: trackingYear.id,
            key: INTERNAL_ACTUALS_SERVICE_MESSAGE_KEY,
          },
        },
      }),
    ])

  const scopedSeats = filterScopedItems(
    seats as SeatWithRelations[],
    viewer,
    (seat) => {
      const effectiveSeat = getEffectiveSeat(seat)
      return { domain: effectiveSeat.domain, subDomain: effectiveSeat.subDomain }
    }
  )
  const assumptionLookup = buildCostAssumptionLookup(assumptions)
  const exchangeRateLookup = buildExchangeRateLookup(exchangeRates)
  const mappedSeats = scopedSeats.map((seat) => {
    const effectiveSeat = getEffectiveSeat(seat)
    const metrics = deriveSeatMetrics(seat, assumptionLookup, exchangeRates, activeYear, {
      exchangeRateLookup,
    })
    const baseMetrics = deriveSeatMetrics(seat, assumptionLookup, exchangeRates, activeYear, {
      exchangeRateLookup,
      ignoreForecastOverrides: true,
    })
    const cancelled = isTrackerCancelledSeat(effectiveSeat)

    return {
      ...effectiveSeat,
      months: seat.months.map((month) => {
        const converted =
          month.actualAmountRaw !== null && month.actualAmountRaw !== undefined
            ? convertAmountToDkk(
                month.actualAmountRaw,
                month.actualCurrency,
                exchangeRateLookup
              )
            : {
                amountDkk: month.actualAmount,
                exchangeRateUsed: month.exchangeRateUsed,
              }

        return {
          monthIndex: month.monthIndex,
          actualAmountDkk: cancelled ? 0 : (converted.amountDkk ?? 0),
          actualAmountRaw: cancelled ? null : month.actualAmountRaw,
          actualCurrency: month.actualCurrency,
          exchangeRateUsed: converted.exchangeRateUsed ?? null,
          forecastOverrideAmount: month.forecastOverrideAmount ?? null,
          forecastIncluded: month.forecastIncluded,
          usedForecastAmount: month.usedForecastAmount ?? null,
          comparisonForecastAmount:
            month.usedForecastAmount ?? (metrics.monthlyForecast[month.monthIndex] ?? 0),
          notes: month.notes,
        }
      }),
      totalSpent: metrics.totalSpent,
      totalForecast: metrics.totalForecast,
      baseTotalForecast: baseMetrics.totalForecast,
      baseMonthlyForecast: baseMetrics.monthlyForecast,
      monthlyForecast: metrics.monthlyForecast,
    }
  })

  const filters = {
    domains: (input?.domains ?? []).map((value) => value.trim()).filter(Boolean),
    subDomains: (input?.subDomains ?? []).map((value) => value.trim()).filter(Boolean),
    teams: (input?.teams ?? []).map((value) => value.trim()).filter(Boolean),
    seatIds: (input?.seatIds ?? []).map((value) => value.trim()).filter(Boolean),
    names: (input?.names ?? []).map((value) => value.trim()).filter(Boolean),
    statuses: (input?.statuses ?? []).map((value) => value.trim()).filter(Boolean),
    hideInactiveStatuses: input?.hideInactiveStatuses !== false,
    nonMonthStart: Boolean(input?.nonMonthStart),
    nonMonthEnd: Boolean(input?.nonMonthEnd),
    reducedOnLeaveForecast: Boolean(input?.reducedOnLeaveForecast),
  }
  const domainFilter = normalizeValues(filters.domains)
  const subDomainFilter = normalizeValues(filters.subDomains)
  const teamFilter = normalizeValues(filters.teams)
  const statusFilter = normalizeValues(filters.statuses)
  const seatIdFilter = normalizeValues(filters.seatIds)
  const nameFilter = normalizeValues(filters.names)
  const reducedOnLeaveLocations = new Set(["denmark", "uk", "poland", "usa"])
  const filteredSeats = mappedSeats
    .filter((seat) => {
      if (
        shouldHideForecastSeatForInactiveStatus({
          hideInactiveStatuses: filters.hideInactiveStatuses,
          status: seat.status,
          hasSeatIdSearch: seatIdFilter.size > 0,
          hasNameSearch: nameFilter.size > 0,
        })
      ) {
        return false
      }

      if (subDomainFilter.size > 0 && !subDomainFilter.has(normalizeValue(seat.subDomain))) {
        return false
      }

      if (domainFilter.size > 0 && !domainFilter.has(normalizeValue(seat.domain))) {
        return false
      }

      if (teamFilter.size > 0 && !teamFilter.has(normalizeValue(seat.team))) {
        return false
      }

      if (statusFilter.size > 0 && !statusFilter.has(normalizeValue(seat.status))) {
        return false
      }

      if (seatIdFilter.size > 0 && !seatIdFilter.has(normalizeValue(seat.seatId))) {
        return false
      }

      if (nameFilter.size > 0 && !nameFilter.has(normalizeValue(seat.inSeat))) {
        return false
      }

      if (filters.nonMonthStart) {
        if (!seat.startDate) {
          return false
        }

        const startDate = seat.startDate instanceof Date ? seat.startDate : new Date(seat.startDate)
        if (
          Number.isNaN(startDate.getTime()) ||
          startDate.getFullYear() !== activeYear ||
          startDate.getDate() === 1
        ) {
          return false
        }
      }

      if (filters.nonMonthEnd) {
        if (!seat.endDate) {
          return false
        }

        const endDate = seat.endDate instanceof Date ? seat.endDate : new Date(seat.endDate)
        const lastDayOfMonth = new Date(
          endDate.getFullYear(),
          endDate.getMonth() + 1,
          0
        ).getDate()

        if (Number.isNaN(endDate.getTime()) || endDate.getDate() === lastDayOfMonth) {
          return false
        }
      }

      if (filters.reducedOnLeaveForecast) {
        if (
          normalizeValue(seat.status) !== "on leave" ||
          !reducedOnLeaveLocations.has(normalizeValue(seat.location))
        ) {
          return false
        }
      }

      return true
    })
    .sort((left, right) => {
      const nameCompare = (left.inSeat || "").localeCompare(right.inSeat || "", undefined, {
        sensitivity: "base",
      })

      if (nameCompare !== 0) {
        return nameCompare
      }

      return left.seatId.localeCompare(right.seatId, undefined, {
        sensitivity: "base",
      })
    })

  const selectedSeatId = filteredSeats.some((seat) => seat.id === input?.selectedSeatId)
    ? input?.selectedSeatId ?? null
    : filteredSeats[0]?.id ?? null

  return {
    activeYear,
    trackingYears,
    seats: filteredSeats,
    totalSeatCount: mappedSeats.length,
    selectedSeatId,
    filters,
    filterOptions: {
      domains: collectSortedValues(mappedSeats.map((seat) => seat.domain)),
      subDomains: collectSortedValues(mappedSeats.map((seat) => seat.subDomain)),
      teams: collectSortedValues(mappedSeats.map((seat) => seat.team)),
      statuses: collectSortedValues(mappedSeats.map((seat) => seat.status)),
      seats: mappedSeats.map((seat) => ({
        id: seat.id,
        seatId: seat.seatId,
        domain: seat.domain || "",
        subDomain: seat.subDomain || "",
        team: seat.team || "",
        name: seat.inSeat || "",
        status: seat.status || "",
      })),
    },
    internalCostServiceMessage: internalActualsMessage?.content ?? null,
  }
}

export async function getAccrualsPageData(input?: {
  year?: number
  domain?: string
  pillar?: string
  months?: string[]
}, viewer?: Pick<AppViewer, "role" | "scopes"> & { name?: string | null }) {
  const trackingYears = await prisma.trackingYear.findMany({
    orderBy: { year: "asc" },
  })

  const activeYear =
    input?.year ??
    trackingYears.find((trackingYear) => trackingYear.isActive)?.year ??
    trackingYears.at(-1)?.year ??
    new Date().getFullYear()

  const trackingYear = await getOrCreateTrackingYear(activeYear)
  await ensureFreshTrackerDerivation(activeYear)

  const snapshot = await loadTrackerYearSnapshot(trackingYear.id, {
    includeBudgetMovements: false,
    seatOrderBy: [{ vendor: "asc" }, { team: "asc" }, { inSeat: "asc" }],
  })

  const scopedSeats = filterScopedItems(
    snapshot.seats,
    viewer,
    (seat) => {
      const effectiveSeat = getEffectiveSeat(seat)
      return { domain: effectiveSeat.domain, subDomain: effectiveSeat.subDomain }
    }
  )

  const filters: AccrualFilters = {
    domain: input?.domain?.trim() ?? "",
    pillar: input?.pillar?.trim() ?? "",
    months: (input?.months ?? []).map((month) => month.trim()).filter(Boolean),
  }

  const accountMappings = await getAccrualAccountMappings(activeYear)

  const model = buildAccrualsPageModel({
    year: activeYear,
    seats: scopedSeats,
    assumptions: snapshot.assumptions,
    exchangeRates: snapshot.exchangeRates,
    accountMappings: Object.fromEntries(
      accountMappings.map((mapping) => [normalizeValue(mapping.resourceType), mapping.accountCode])
    ),
    filters,
    submittedBy: viewer?.name?.trim() || "Finance",
  })

  return {
    activeYear,
    trackingYears,
    filters: model.filters,
    filterOptions: model.filterOptions,
    rows: model.summaryRows as AccrualSummaryRow[],
    totals: model.totals,
  }
}

export async function getBudgetMovementsPageData(input?: {
  year?: number
  search?: string
  category?: string
  receivingFunding?: string
  givingPillar?: string
}, viewer?: Pick<AppViewer, "role" | "scopes">) {
  const trackingYears = await prisma.trackingYear.findMany({
    orderBy: { year: "asc" },
  })
  const requestedYear = Number.isInteger(input?.year) ? input?.year : undefined

  const activeYear =
    requestedYear ??
    trackingYears.find((trackingYear) => trackingYear.isActive)?.year ??
    trackingYears.at(-1)?.year ??
    new Date().getFullYear()

  const trackingYear = await getOrCreateTrackingYear(activeYear)
  const filters: BudgetMovementFilters = {
    search: input?.search?.trim() ?? "",
    category: input?.category?.trim() ?? "",
    receivingFunding: input?.receivingFunding?.trim() ?? "",
    givingPillar: input?.givingPillar?.trim() ?? "",
  }

  const [budgetMovements, departmentMappings, importBatches] = await Promise.all([
    prisma.budgetMovement.findMany({
      where: { trackingYearId: trackingYear.id },
      include: {
        batch: true,
        budgetArea: true,
      },
      orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    }),
    prisma.departmentMapping.findMany({
      where: {
        trackingYearId: trackingYear.id,
        codeType: "DEPARTMENT_CODE",
      },
    }),
    prisma.budgetMovementBatch.findMany({
      where: {
        trackingYearId: trackingYear.id,
        isManual: false,
      },
      orderBy: { importedAt: "desc" },
    }),
  ])
  const mappingLookup = buildDepartmentMappingLookup(departmentMappings)

  const movementViews: BudgetMovementView[] = budgetMovements.map((movement) => {
    const mappedHierarchy = resolveDepartmentMapping(mappingLookup, {
      sourceCode: movement.receivingCostCenter,
      projectCode: movement.receivingProjectCode,
    })

    return {
      id: movement.id,
      batchFileName: movement.batch.fileName,
      isManual: movement.batch.isManual,
      effectiveDate: movement.effectiveDate,
      category: movement.category,
      givingFunding: movement.givingFunding,
      givingPillar: movement.givingPillar,
      receivingFunding: movement.receivingCostCenter,
      receivingProjectCode: movement.receivingProjectCode,
      receivingDomainCode: movement.receivingCostCenter,
      amountGiven: movement.amountGiven,
      financeViewAmount: movement.financeViewAmount,
      capexTarget: movement.capexTarget,
      notes: movement.notes,
      areaDisplayName: movement.budgetArea
        ? computeAreaDisplayName(movement.budgetArea)
        : mappedHierarchy?.subDomain || null,
      areaDomain: normalizeDomainLabel(
        mappedHierarchy?.domain ?? movement.budgetArea?.domain ?? null
      ),
      areaSubDomain:
        mappedHierarchy?.subDomain ?? movement.budgetArea?.subDomain ?? null,
    }
  })

  const normalizedSearch = normalizeValue(filters.search)
  const scopedMovements = filterScopedItems(
    movementViews,
    viewer,
    (movement) => ({
      domain: movement.areaDomain,
      subDomain: movement.areaSubDomain,
    })
  )
  const filteredMovements = scopedMovements.filter((movement) => {
    if (
      normalizedSearch &&
      !normalizeValue(movement.notes).includes(normalizedSearch)
    ) {
      return false
    }

    if (
      filters.category &&
      normalizeValue(movement.category) !== normalizeValue(filters.category)
    ) {
      return false
    }

    if (
      filters.receivingFunding &&
      normalizeValue(movement.receivingFunding) !==
        normalizeValue(filters.receivingFunding)
    ) {
      return false
    }

    if (
      filters.givingPillar &&
      normalizeValue(movement.givingPillar) !== normalizeValue(filters.givingPillar)
    ) {
      return false
    }

    return true
  })

  return {
    activeYear,
    trackingYears,
    filters,
    movements: filteredMovements,
    filterOptions: {
      categories: collectSortedValues(scopedMovements.map((movement) => movement.category)),
      receivingFunding: Array.from(
        new Map(
          scopedMovements.map((movement) => [
            movement.receivingFunding,
            {
              value: movement.receivingFunding,
              label: movement.areaSubDomain
                ? `${movement.receivingFunding} · ${movement.areaSubDomain}`
                : movement.receivingFunding,
            } satisfies BudgetMovementFilterOption,
          ])
        ).values()
      ).sort((left, right) => left.label.localeCompare(right.label)),
      givingPillars: collectSortedValues(
        scopedMovements.map((movement) => movement.givingPillar)
      ),
    },
    totals: {
      movementCount: filteredMovements.length,
      financeViewAmount: filteredMovements.reduce(
        (sum, movement) => sum + (movement.financeViewAmount ?? movement.amountGiven),
        0
      ),
      amountGiven: filteredMovements.reduce(
        (sum, movement) => sum + movement.amountGiven,
        0
      ),
    },
    imports: importBatches.map(
      (batch): BudgetMovementImportBatchView => ({
        id: batch.id,
        fileName: batch.fileName,
        importedAt: batch.importedAt,
        rowCount: batch.rowCount,
      })
    ),
  }
}

async function getOrCreateManualBudgetMovementBatch(
  transaction: Prisma.TransactionClient,
  trackingYearId: string
) {
  const existingBatch = await transaction.budgetMovementBatch.findFirst({
    where: {
      trackingYearId,
      isManual: true,
    },
    orderBy: { importedAt: "asc" },
  })

  if (existingBatch) {
    return existingBatch
  }

  return transaction.budgetMovementBatch.create({
    data: {
      trackingYearId,
      fileName: "Manual entries",
      isManual: true,
      rowCount: 0,
    },
  })
}

async function syncBudgetMovementBatchRowCount(
  transaction: Prisma.TransactionClient,
  batchId: string
) {
  const rowCount = await transaction.budgetMovement.count({
    where: { batchId },
  })

  await transaction.budgetMovementBatch.update({
    where: { id: batchId },
    data: { rowCount },
  })
}

async function findOrCreateBudgetAreaForMovement(
  transaction: Prisma.TransactionClient,
  input: {
    trackingYearId: string
    receivingCostCenter: string
    receivingProjectCode: string
  }
) {
  const existingArea = await transaction.budgetArea.findUnique({
    where: {
      trackingYearId_costCenter_projectCode: {
        trackingYearId: input.trackingYearId,
        costCenter: input.receivingCostCenter,
        projectCode: input.receivingProjectCode,
      },
    },
  })

  if (existingArea) {
    return existingArea
  }

  const mapping = await transaction.departmentMapping.findFirst({
    where: {
      trackingYearId: input.trackingYearId,
      codeType: "DEPARTMENT_CODE",
      sourceCode: input.receivingCostCenter,
      projectCode: input.receivingProjectCode,
    },
  })

  return transaction.budgetArea.create({
    data: {
      trackingYearId: input.trackingYearId,
      domain: normalizeDomainLabel(mapping?.domain) || null,
      subDomain: normalizeSubDomainLabel(mapping?.subDomain) || null,
      costCenter: input.receivingCostCenter,
      projectCode: input.receivingProjectCode,
      displayName: `${input.receivingProjectCode} · ${input.receivingCostCenter}`,
    },
  })
}

function buildBudgetMovementAuditShape(movement: {
  givingFunding: string | null
  givingPillar: string | null
  amountGiven: number
  receivingCostCenter: string
  receivingProjectCode: string
  notes: string | null
  effectiveDate: Date | null
  category: string | null
  financeViewAmount: number | null
  capexTarget: number | null
  budgetAreaId: string | null
  batchId: string
}) {
  return {
    givingFunding: movement.givingFunding,
    givingPillar: movement.givingPillar,
    amountGiven: movement.amountGiven,
    receivingCostCenter: movement.receivingCostCenter,
    receivingProjectCode: movement.receivingProjectCode,
    notes: movement.notes,
    effectiveDate: movement.effectiveDate,
    category: movement.category,
    financeViewAmount: movement.financeViewAmount,
    capexTarget: movement.capexTarget,
    budgetAreaId: movement.budgetAreaId,
    batchId: movement.batchId,
  }
}

function validateBudgetMovementInput(input: {
  amountGiven: number
  receivingCostCenter: string
  receivingProjectCode: string
}) {
  if (!Number.isFinite(input.amountGiven)) {
    throw new Error("Amount given is required.")
  }

  if (!input.receivingCostCenter.trim()) {
    throw new Error("Receiving cost center is required.")
  }

  if (!input.receivingProjectCode.trim()) {
    throw new Error("Receiving project code is required.")
  }
}

export async function createBudgetMovement(input: {
  year: number
  givingFunding?: string | null
  givingPillar?: string | null
  amountGiven: number
  receivingCostCenter: string
  receivingProjectCode: string
  notes?: string | null
  effectiveDate?: Date | string | null
  category?: string | null
  financeViewAmount?: number | null
  capexTarget?: number | null
}, actor?: AuditActor) {
  ensureValidYear(input.year)
  const trackingYear = await getOrCreateTrackingYear(input.year)
  validateBudgetMovementInput(input)

  const movement = await prisma.$transaction(async (transaction) => {
    const batch = await getOrCreateManualBudgetMovementBatch(transaction, trackingYear.id)
    const budgetArea = await findOrCreateBudgetAreaForMovement(transaction, {
      trackingYearId: trackingYear.id,
      receivingCostCenter: input.receivingCostCenter.trim(),
      receivingProjectCode: input.receivingProjectCode.trim(),
    })

    const created = await transaction.budgetMovement.create({
      data: {
        trackingYearId: trackingYear.id,
        batchId: batch.id,
        budgetAreaId: budgetArea.id,
        givingFunding: normalizeOptionalString(input.givingFunding),
        givingPillar: normalizeOptionalString(input.givingPillar),
        amountGiven: input.amountGiven,
        receivingCostCenter: input.receivingCostCenter.trim(),
        receivingProjectCode: input.receivingProjectCode.trim(),
        notes: normalizeOptionalString(input.notes),
        effectiveDate: normalizeBudgetMovementDate(input.effectiveDate),
        category: normalizeOptionalString(input.category),
        financeViewAmount: normalizeOptionalNumber(input.financeViewAmount),
        capexTarget: normalizeOptionalNumber(input.capexTarget),
      },
    })

    await syncBudgetMovementBatchRowCount(transaction, batch.id)
    return created
  })

  await deriveTrackerSeatsForYear(input.year)
  await writeAuditLog({
    trackingYearId: trackingYear.id,
    entityType: "BudgetMovement",
    entityId: movement.id,
    action: "CREATE",
    actor,
    changes: buildAuditChanges(null, buildBudgetMovementAuditShape(movement), [
      "givingFunding",
      "givingPillar",
      "amountGiven",
      "receivingCostCenter",
      "receivingProjectCode",
      "notes",
      "effectiveDate",
      "category",
      "financeViewAmount",
      "capexTarget",
      "budgetAreaId",
      "batchId",
    ]),
  })

  return movement
}

export async function updateBudgetMovement(input: {
  year: number
  id: string
  givingFunding?: string | null
  givingPillar?: string | null
  amountGiven: number
  receivingCostCenter: string
  receivingProjectCode: string
  notes?: string | null
  effectiveDate?: Date | string | null
  category?: string | null
  financeViewAmount?: number | null
  capexTarget?: number | null
}, actor?: AuditActor) {
  ensureValidYear(input.year)
  const trackingYear = await getOrCreateTrackingYear(input.year)
  validateBudgetMovementInput(input)

  const before = await prisma.budgetMovement.findFirstOrThrow({
    where: {
      id: input.id,
      trackingYearId: trackingYear.id,
    },
  })

  const movement = await prisma.$transaction(async (transaction) => {
    const budgetArea = await findOrCreateBudgetAreaForMovement(transaction, {
      trackingYearId: trackingYear.id,
      receivingCostCenter: input.receivingCostCenter.trim(),
      receivingProjectCode: input.receivingProjectCode.trim(),
    })

    return transaction.budgetMovement.update({
      where: { id: input.id },
      data: {
        budgetAreaId: budgetArea.id,
        givingFunding: normalizeOptionalString(input.givingFunding),
        givingPillar: normalizeOptionalString(input.givingPillar),
        amountGiven: input.amountGiven,
        receivingCostCenter: input.receivingCostCenter.trim(),
        receivingProjectCode: input.receivingProjectCode.trim(),
        notes: normalizeOptionalString(input.notes),
        effectiveDate: normalizeBudgetMovementDate(input.effectiveDate),
        category: normalizeOptionalString(input.category),
        financeViewAmount: normalizeOptionalNumber(input.financeViewAmount),
        capexTarget: normalizeOptionalNumber(input.capexTarget),
      },
    })
  })

  await deriveTrackerSeatsForYear(input.year)
  await writeAuditLog({
    trackingYearId: trackingYear.id,
    entityType: "BudgetMovement",
    entityId: movement.id,
    action: "UPDATE",
    actor,
    changes: buildAuditChanges(
      buildBudgetMovementAuditShape(before),
      buildBudgetMovementAuditShape(movement),
      [
        "givingFunding",
        "givingPillar",
        "amountGiven",
        "receivingCostCenter",
        "receivingProjectCode",
        "notes",
        "effectiveDate",
        "category",
        "financeViewAmount",
        "capexTarget",
        "budgetAreaId",
      ]
    ),
  })

  return movement
}

export async function deleteBudgetMovement(input: {
  year: number
  id: string
}, actor?: AuditActor) {
  ensureValidYear(input.year)
  const trackingYear = await getOrCreateTrackingYear(input.year)
  const before = await prisma.budgetMovement.findFirstOrThrow({
    where: {
      id: input.id,
      trackingYearId: trackingYear.id,
    },
  })

  await prisma.$transaction(async (transaction) => {
    await transaction.budgetMovement.delete({
      where: { id: input.id },
    })

    await syncBudgetMovementBatchRowCount(transaction, before.batchId)
  })

  await deriveTrackerSeatsForYear(input.year)
  await writeAuditLog({
    trackingYearId: trackingYear.id,
    entityType: "BudgetMovement",
    entityId: before.id,
    action: "DELETE",
    actor,
    changes: buildAuditChanges(
      buildBudgetMovementAuditShape(before),
      null,
      [
        "givingFunding",
        "givingPillar",
        "amountGiven",
        "receivingCostCenter",
        "receivingProjectCode",
        "notes",
        "effectiveDate",
        "category",
        "financeViewAmount",
        "capexTarget",
        "budgetAreaId",
        "batchId",
      ]
    ),
  })

  return before
}

function splitAmountByWeights(amount: number, weights: number[]) {
  if (weights.length === 0) {
    return []
  }

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
  if (totalWeight <= 0) {
    throw new Error("Matching seats must have allocation greater than zero.")
  }

  const rawShares = weights.map((weight) => (amount * weight) / totalWeight)
  const roundedShares = rawShares.map((share) => Math.round(share * 100) / 100)
  const roundedTotal = roundedShares.reduce((sum, share) => sum + share, 0)
  const remainder = Math.round((amount - roundedTotal) * 100) / 100

  if (Math.abs(remainder) >= 0.01) {
    const targetIndex = weights.reduce(
      (bestIndex, weight, index, collection) =>
        weight > collection[bestIndex] ? index : bestIndex,
      0
    )
    roundedShares[targetIndex] =
      Math.round((roundedShares[targetIndex] + remainder) * 100) / 100
  }

  return roundedShares
}

function parseCurrencyCode(value: string) {
  const normalized = value.trim().toUpperCase()
  if (normalized !== "DKK" && normalized !== "EUR" && normalized !== "USD") {
    throw new Error(`Unsupported currency '${value}'.`)
  }

  return normalized as CurrencyCode
}

function getMonthEndLookupDate(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999))
}

async function getLatestExchangeRateOnOrBeforeDate(
  trackingYearId: string,
  currency: CurrencyCode,
  effectiveOn: Date
) {
  if (currency === "DKK") {
    return {
      rateToDkk: 1,
      effectiveDate: effectiveOn,
    }
  }

  const rates = await prisma.exchangeRate.findMany({
    where: { trackingYearId, currency },
    orderBy: [{ effectiveDate: "desc" }],
  })
  const rate = findClosestPriorExchangeRate(currency, rates, effectiveOn)

  if (!rate) {
    const formattedLookupDate = effectiveOn.toISOString().slice(0, 10)
    throw new Error(
      `No exchange rate is configured for ${currency} on or before ${formattedLookupDate}.`
    )
  }

  return rate
}

type ExternalActualSpendPlanMatch = {
  trackerSeatId: string
  seatId: string
  team: string | null
  inSeat: string | null
  description: string | null
  allocation: number
  dailyRate: number | null
  usedForecastAmount: number | null
}

type ExternalActualSpendPlanSeatCandidate = {
  seat: SeatWithRelations
  effectiveSeat: ReturnType<typeof getEffectiveSeat>
  metrics: ReturnType<typeof deriveSeatMetrics>
}

type ExternalActualNameSearchResult = {
  trackerSeatId: string
  seatId: string
  inSeat: string | null
  team: string | null
  status: string | null
  spendPlanId: string | null
  allocation: number
}

async function getExternalActualSpendPlanMatches(input: {
  year: number
  spendPlanId: string
  monthIndex: number
}, viewer?: Pick<AppViewer, "role" | "scopes">): Promise<ExternalActualSpendPlanMatch[]> {
  const trackingYear = await getOrCreateTrackingYear(input.year)
  const [seats, assumptions, exchangeRates] = await Promise.all([
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
  const now = new Date()
  const scopedSeats = filterScopedItems(
    seats as SeatWithRelations[],
    viewer,
    (seat) => {
      const effectiveSeat = getEffectiveSeat(seat)
      return { domain: effectiveSeat.domain, subDomain: effectiveSeat.subDomain }
    }
  )

  const candidates = scopedSeats
    .map<ExternalActualSpendPlanSeatCandidate | null>((seat) => {
      const effectiveSeat = getEffectiveSeat(seat)
      if (!isExternalSeat(effectiveSeat)) {
        return null
      }

      if (normalizeValue(effectiveSeat.spendPlanId) !== normalizeValue(input.spendPlanId)) {
        return null
      }

      if (!effectiveSeat.startDate || effectiveSeat.startDate > now) {
        return null
      }

      return {
        seat,
        effectiveSeat,
        metrics: deriveSeatMetrics(seat, assumptionLookup, exchangeRates, input.year),
      }
    })
    .filter((candidate): candidate is ExternalActualSpendPlanSeatCandidate => candidate !== null)

  const matches = candidates
    .map<ExternalActualSpendPlanMatch | null>(({ seat, effectiveSeat, metrics }) => {
      const hasEligibleForecast = Array.from(
        { length: input.monthIndex + 1 },
        (_, monthIndex) => monthIndex
      ).some((monthIndex) => {
        const month = seat.months.find((entry) => entry.monthIndex === monthIndex)
        return (
          (metrics.monthlyForecast[monthIndex] ?? 0) > 0 ||
          (month?.usedForecastAmount ?? 0) > 0
        )
      })

      if (!hasEligibleForecast) {
        return null
      }

      return {
        trackerSeatId: seat.id,
        seatId: seat.seatId,
        team: effectiveSeat.team,
        inSeat: effectiveSeat.inSeat,
        description: effectiveSeat.description,
        allocation: normalizeAllocation(effectiveSeat.allocation),
        dailyRate: effectiveSeat.dailyRate ?? null,
        usedForecastAmount:
          seat.months.find((month) => month.monthIndex === input.monthIndex)?.usedForecastAmount ??
          (metrics.monthlyForecast[input.monthIndex] ?? 0),
      }
    })
    .filter((seat): seat is ExternalActualSpendPlanMatch => seat !== null)

  return matches
}

async function getExternalActualSpendPlanCandidates(input: {
  year: number
  spendPlanId: string
}, viewer?: Pick<AppViewer, "role" | "scopes">): Promise<ExternalActualSpendPlanSeatCandidate[]> {
  const trackingYear = await getOrCreateTrackingYear(input.year)
  const [seats, assumptions, exchangeRates] = await Promise.all([
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
  const now = new Date()

  return filterScopedItems(
    seats as SeatWithRelations[],
    viewer,
    (seat) => {
      const effectiveSeat = getEffectiveSeat(seat)
      return { domain: effectiveSeat.domain, subDomain: effectiveSeat.subDomain }
    }
  )
    .map<ExternalActualSpendPlanSeatCandidate | null>((seat) => {
      const effectiveSeat = getEffectiveSeat(seat)
      if (!isExternalSeat(effectiveSeat)) {
        return null
      }

      if (normalizeValue(effectiveSeat.spendPlanId) !== normalizeValue(input.spendPlanId)) {
        return null
      }

      if (!effectiveSeat.startDate || effectiveSeat.startDate > now) {
        return null
      }

      return {
        seat,
        effectiveSeat,
        metrics: deriveSeatMetrics(seat, assumptionLookup, exchangeRates, input.year),
      }
    })
    .filter((candidate): candidate is ExternalActualSpendPlanSeatCandidate => candidate !== null)
}

function getExternalActualMonthLimit(year: number) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonthIndex = now.getMonth()

  if (year < currentYear) {
    return 11
  }

  return currentMonthIndex
}

async function getExternalActualMonthSelection(input: {
  year: number
  spendPlanId: string
}, viewer?: Pick<AppViewer, "role" | "scopes">) {
  const candidates = await getExternalActualSpendPlanCandidates(input, viewer)
  const maxMonthIndex = getExternalActualMonthLimit(input.year)
  const monthOptions = Array.from({ length: maxMonthIndex + 1 }, (_, monthIndex) => {
    const hasActual = candidates.some(({ seat }) => {
      const month = seat.months.find((entry) => entry.monthIndex === monthIndex)
      const rawActual = month?.actualAmountRaw
      const actualAmount = month?.actualAmount ?? 0
      return rawActual !== null && rawActual !== undefined ? rawActual > 0 : actualAmount > 0
    })
    const isEligible = candidates.some(({ seat, metrics }) =>
      Array.from({ length: monthIndex + 1 }, (_, candidateMonthIndex) => candidateMonthIndex).some(
        (candidateMonthIndex) => {
          const month = seat.months.find((entry) => entry.monthIndex === candidateMonthIndex)
          return (
            (metrics.monthlyForecast[candidateMonthIndex] ?? 0) > 0 ||
            (month?.usedForecastAmount ?? 0) > 0
          )
        }
      )
    )

    return {
      monthIndex,
      monthLabel: monthLabel(input.year, monthIndex),
      hasActual,
      isEligible,
    }
  })

  return {
    candidates,
    monthOptions,
    suggestedMonthIndex:
      monthOptions.find((option) => option.isEligible && !option.hasActual)?.monthIndex ?? null,
  }
}

async function createExternalActualBatchForMatches(input: {
  year: number
  monthIndex: number
  spendPlanId: string
  amount: number
  currency: CurrencyCode
  conversionDate?: Date
  sourceKind: "MANUAL" | "PASTE"
  fileName: string
  invoiceNumber?: string | null
  supplierName?: string | null
  description?: string | null
  rawContent?: string | null
}, actor?: AuditActor, viewer?: Pick<AppViewer, "role" | "scopes">) {
  const trackingYear = await getOrCreateTrackingYear(input.year)
  const matches = await getExternalActualSpendPlanMatches(
    {
      year: input.year,
      spendPlanId: input.spendPlanId,
      monthIndex: input.monthIndex,
    },
    viewer
  )

  if (matches.length === 0) {
    throw new Error("No matching external seats were found for that spend plan and month.")
  }

  const rate = await getLatestExchangeRateOnOrBeforeDate(
    trackingYear.id,
    input.currency,
    input.conversionDate ?? new Date()
  )
  const originalShares = splitAmountByWeights(
    input.amount,
    matches.map((seat) => seat.allocation)
  )

  const batch = await prisma.$transaction(async (transaction) => {
    const nextBatch = await transaction.externalActualImport.create({
      data: {
        trackingYearId: trackingYear.id,
        fileName: input.fileName,
        sourceKind: input.sourceKind,
        importedByName: actor?.name ?? null,
        importedByEmail: actor?.email ?? null,
        rowCount: 1,
        entryCount: matches.length,
      },
    })

    const matchedEntries = matches.map((match, index) => {
      const originalAmount = originalShares[index]
      const dkkAmount = Math.round(originalAmount * rate.rateToDkk * 100) / 100
      const noteSegments = [
        input.sourceKind === "PASTE" ? "Pasted external actual" : "Manual external actual",
        input.invoiceNumber ? `invoice ${input.invoiceNumber}` : null,
        input.supplierName ? input.supplierName : null,
        `spend plan ${input.spendPlanId}`,
      ].filter(Boolean)

      return {
        entry: {
          trackingYearId: trackingYear.id,
          importId: nextBatch.id,
          trackerSeatId: match.trackerSeatId,
          sourceKind: input.sourceKind,
          seatId: match.seatId,
          team: match.team,
          inSeat: match.inSeat,
          description: input.description ?? match.description,
          monthIndex: input.monthIndex,
          monthLabel: monthLabel(input.year, input.monthIndex),
          amount: dkkAmount,
          originalAmount,
          originalCurrency: input.currency,
          spendPlanId: input.spendPlanId,
          invoiceNumber: input.invoiceNumber ?? null,
          supplierName: input.supplierName ?? null,
          rawContent: input.rawContent ?? null,
          usedForecastAmount: match.usedForecastAmount,
        },
        seatMonth: {
          trackerSeatId: match.trackerSeatId,
          monthIndex: input.monthIndex,
          actualAmount: dkkAmount <= 0 ? 0 : dkkAmount,
          actualAmountRaw: originalAmount,
          actualCurrency: input.currency,
          exchangeRateUsed: dkkAmount <= 0 ? null : rate.rateToDkk,
          forecastIncluded: dkkAmount <= 0,
          usedForecastAmount: dkkAmount <= 0 ? null : match.usedForecastAmount,
          notes: noteSegments.join(" · "),
        },
      }
    })

    await transaction.externalActualEntry.createMany({
      data: matchedEntries.map((row) => row.entry),
    })

    for (const row of matchedEntries) {
      await transaction.seatMonth.upsert({
        where: {
          trackerSeatId_monthIndex: {
            trackerSeatId: row.seatMonth.trackerSeatId,
            monthIndex: input.monthIndex,
          },
        },
        update: {
          actualAmount: row.seatMonth.actualAmount,
          actualAmountRaw: row.seatMonth.actualAmountRaw,
          actualCurrency: row.seatMonth.actualCurrency,
          exchangeRateUsed: row.seatMonth.exchangeRateUsed,
          forecastIncluded: row.seatMonth.forecastIncluded,
          usedForecastAmount: row.seatMonth.usedForecastAmount,
          notes: row.seatMonth.notes,
        },
        create: {
          ...row.seatMonth,
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
          fileName: input.fileName,
          sourceKind: input.sourceKind,
          spendPlanId: input.spendPlanId,
          entryCount: matches.length,
          originalAmount: input.amount,
          currency: input.currency,
        }),
      },
    ],
  })

  return batch
}

async function previewExternalActualBatchForMatches(input: {
  year: number
  monthIndex: number
  spendPlanId: string
  amount: number
  currency: CurrencyCode
  conversionDate?: Date
  invoiceNumber?: string | null
  supplierName?: string | null
  description?: string | null
  rawContent?: string | null
}, viewer?: Pick<AppViewer, "role" | "scopes">) {
  const trackingYear = await getOrCreateTrackingYear(input.year)
  const matches = await getExternalActualSpendPlanMatches(
    {
      year: input.year,
      spendPlanId: input.spendPlanId,
      monthIndex: input.monthIndex,
    },
    viewer
  )

  const rate = await getLatestExchangeRateOnOrBeforeDate(
    trackingYear.id,
    input.currency,
    input.conversionDate ?? new Date()
  )
  if (matches.length === 0) {
    return {
      status: "needs_mapping" as const,
      year: input.year,
      monthIndex: input.monthIndex,
      monthLabel: monthLabel(input.year, input.monthIndex),
      spendPlanId: input.spendPlanId,
      invoiceNumber: input.invoiceNumber ?? null,
      supplierName: input.supplierName ?? null,
      originalAmount: input.amount,
      originalCurrency: input.currency,
      rateToDkk: rate.rateToDkk,
      rateEffectiveDate: rate.effectiveDate,
      totalDkk: Math.round(input.amount * rate.rateToDkk * 100) / 100,
      seats: [],
    }
  }

  const originalShares = splitAmountByWeights(input.amount, matches.map((seat) => seat.allocation))

  return {
    status: "matched" as const,
    year: input.year,
    monthIndex: input.monthIndex,
    monthLabel: monthLabel(input.year, input.monthIndex),
    spendPlanId: input.spendPlanId,
    invoiceNumber: input.invoiceNumber ?? null,
    supplierName: input.supplierName ?? null,
    originalAmount: input.amount,
    originalCurrency: input.currency,
    rateToDkk: rate.rateToDkk,
    rateEffectiveDate: rate.effectiveDate,
    totalDkk: Math.round(input.amount * rate.rateToDkk * 100) / 100,
    seats: matches.map((match, index) => {
      const originalAmount = originalShares[index]
      const amountDkk = Math.round(originalAmount * rate.rateToDkk * 100) / 100

      return {
        trackerSeatId: match.trackerSeatId,
        seatId: match.seatId,
        team: match.team,
        inSeat: match.inSeat,
        description: input.description ?? match.description,
        allocation: match.allocation,
        dailyRate: match.dailyRate,
        originalAmount,
        amountDkk,
        daysEquivalent:
          match.dailyRate && match.dailyRate > 0
            ? Math.round((amountDkk / match.dailyRate) * 100) / 100
            : null,
        usedForecastAmount: match.usedForecastAmount,
      }
    }),
  }
}

function parsePastedInvoiceText(content: string) {
  const getValue = (label: string) => {
    const match = content.match(new RegExp(`${label}\\s*:\\s*(.+)`, "i"))
    return match?.[1]?.trim() ?? null
  }

  const spendPlanId = getValue("Spend plan")
  const spendPlanReference = getValue("Spend plan reference")
  const invoiceNumber = getValue("InvoiceNO")
  const supplierName = getValue("Supplier Name")
  const netTotal = getValue("Net Total")
  const currencyValue = getValue("Currency")

  if (!spendPlanId) {
    throw new Error("Could not find a spend plan in the pasted content.")
  }

  if (!netTotal) {
    throw new Error("Could not find a net total in the pasted content.")
  }

  if (!currencyValue) {
    throw new Error("Could not find a currency in the pasted content.")
  }

  const amount = Number(netTotal.replace(/\./g, "").replace(",", "."))
  if (!Number.isFinite(amount)) {
    throw new Error("Could not parse the net total from the pasted content.")
  }

  return {
    spendPlanId,
    spendPlanReference,
    invoiceNumber,
    supplierName,
    amount,
    currency: parseCurrencyCode(currencyValue),
  }
}

export async function createManualExternalActual(input: {
  year: number
  monthIndex: number
  spendPlanId: string
  amount: number
  currency: CurrencyCode
  invoiceNumber?: string | null
  supplierName?: string | null
  description?: string | null
}, actor?: AuditActor, viewer?: Pick<AppViewer, "role" | "scopes">) {
  return createExternalActualBatchForMatches(
    {
      ...input,
      fileName: "Manual external actual",
      sourceKind: "MANUAL",
    },
    actor,
    viewer
  )
}

export async function createPastedExternalActual(input: {
  year: number
  monthIndex: number
  content: string
}, actor?: AuditActor, viewer?: Pick<AppViewer, "role" | "scopes">) {
  const parsed = parsePastedInvoiceText(input.content)
  const conversionDate = getMonthEndLookupDate(input.year, input.monthIndex)

  return createExternalActualBatchForMatches(
    {
      year: input.year,
      monthIndex: input.monthIndex,
      spendPlanId: parsed.spendPlanId,
      amount: parsed.amount,
      currency: parsed.currency,
      conversionDate,
      invoiceNumber: parsed.invoiceNumber,
      supplierName: parsed.supplierName,
      rawContent: input.content,
      fileName: "Pasted invoice actual",
      sourceKind: "PASTE",
    },
    actor,
    viewer
  )
}

export async function previewPastedExternalActual(input: {
  year: number
  monthIndex?: number
  content: string
}, viewer?: Pick<AppViewer, "role" | "scopes">) {
  const parsed = parsePastedInvoiceText(input.content)
  const trackingYear = await getOrCreateTrackingYear(input.year)
  const monthSelection = await getExternalActualMonthSelection(
    {
      year: input.year,
      spendPlanId: parsed.spendPlanId,
    },
    viewer
  )
  const previewMonthIndex =
    input.monthIndex ??
    (monthSelection.candidates.length > 0 ? monthSelection.suggestedMonthIndex : undefined)
  const conversionDate =
    previewMonthIndex === undefined || previewMonthIndex === null
      ? new Date()
      : getMonthEndLookupDate(input.year, previewMonthIndex)
  const rate = await getLatestExchangeRateOnOrBeforeDate(
    trackingYear.id,
    parsed.currency,
    conversionDate
  )
  const totalDkk = Math.round(parsed.amount * rate.rateToDkk * 100) / 100

  const preview =
    monthSelection.candidates.length === 0
      ? {
          status: "needs_mapping" as const,
          year: input.year,
          monthIndex: null,
          monthLabel: null,
          spendPlanId: parsed.spendPlanId,
          invoiceNumber: parsed.invoiceNumber ?? null,
          supplierName: parsed.supplierName ?? null,
          originalAmount: parsed.amount,
          originalCurrency: parsed.currency,
          rateToDkk: rate.rateToDkk,
          rateEffectiveDate: rate.effectiveDate,
          totalDkk,
          seats: [],
        }
      : input.monthIndex === undefined
        ? {
            status: "matched" as const,
            year: input.year,
            monthIndex: null,
            monthLabel: null,
            spendPlanId: parsed.spendPlanId,
            invoiceNumber: parsed.invoiceNumber ?? null,
            supplierName: parsed.supplierName ?? null,
            originalAmount: parsed.amount,
            originalCurrency: parsed.currency,
            rateToDkk: rate.rateToDkk,
            rateEffectiveDate: rate.effectiveDate,
            totalDkk,
            seats: [],
          }
        : await previewExternalActualBatchForMatches(
            {
              year: input.year,
              monthIndex: input.monthIndex,
              spendPlanId: parsed.spendPlanId,
              amount: parsed.amount,
              currency: parsed.currency,
              conversionDate,
              invoiceNumber: parsed.invoiceNumber,
              supplierName: parsed.supplierName,
              rawContent: input.content,
            },
            viewer
          )

  const suggestedName =
    parsed.spendPlanReference?.includes("-")
      ? parsed.spendPlanReference.split("-").at(-1)?.trim() || null
      : null

  return {
    ...preview,
    monthOptions: monthSelection.monthOptions,
    suggestedMonthIndex: monthSelection.suggestedMonthIndex,
    spendPlanReference: parsed.spendPlanReference ?? null,
    suggestedName,
  }
}

export async function searchExternalSeatsByName(input: {
  year: number
  query: string
}, viewer?: Pick<AppViewer, "role" | "scopes">): Promise<ExternalActualNameSearchResult[]> {
  const trackingYear = await getOrCreateTrackingYear(input.year)
  const seats = await prisma.trackerSeat.findMany({
    where: {
      trackingYearId: trackingYear.id,
      isActive: true,
    },
    include: {
      months: true,
      override: true,
      budgetArea: true,
    },
    orderBy: [{ inSeat: "asc" }, { seatId: "asc" }],
  })

  const normalizedQuery = normalizeValue(input.query)
  if (!normalizedQuery) {
    return []
  }

  return filterScopedItems(
    seats as SeatWithRelations[],
    viewer,
    (seat) => {
      const effectiveSeat = getEffectiveSeat(seat)
      return { domain: effectiveSeat.domain, subDomain: effectiveSeat.subDomain }
    }
  )
    .map((seat) => {
      const effectiveSeat = getEffectiveSeat(seat)
      if (!isExternalSeat(effectiveSeat)) {
        return null
      }

      if (!normalizeValue(effectiveSeat.inSeat).includes(normalizedQuery)) {
        return null
      }

      return {
        trackerSeatId: seat.id,
        seatId: seat.seatId,
        inSeat: effectiveSeat.inSeat,
        team: effectiveSeat.team,
        status: effectiveSeat.status,
        spendPlanId: effectiveSeat.spendPlanId,
        allocation: normalizeAllocation(effectiveSeat.allocation),
      }
    })
    .filter((seat): seat is ExternalActualNameSearchResult => seat !== null)
}

export async function assignSpendPlanToTrackerSeats(input: {
  trackerSeatIds: string[]
  spendPlanId: string
}, actor?: AuditActor) {
  const trackerSeatIds = Array.from(
    new Set(input.trackerSeatIds.map((seatId) => seatId.trim()).filter(Boolean))
  )

  if (trackerSeatIds.length === 0) {
    throw new Error("Select at least one seat to map the spend plan to.")
  }

  const [seats, existingOverrides] = await Promise.all([
    prisma.trackerSeat.findMany({
      where: {
        id: {
          in: trackerSeatIds,
        },
      },
      select: {
        id: true,
        trackingYearId: true,
      },
    }),
    prisma.trackerOverride.findMany({
      where: {
        trackerSeatId: {
          in: trackerSeatIds,
        },
      },
    }),
  ])

  if (seats.length !== trackerSeatIds.length) {
    const foundSeatIds = new Set(seats.map((seat) => seat.id))
    const missingSeatIds = trackerSeatIds.filter((seatId) => !foundSeatIds.has(seatId))
    throw new Error(`Unknown tracker seat id(s): ${missingSeatIds.join(", ")}`)
  }

  const existingOverrideBySeatId = new Map(
    existingOverrides.map((override) => [override.trackerSeatId, override])
  )
  const existingSeatIds = existingOverrides.map((override) => override.trackerSeatId)
  const missingSeatIds = trackerSeatIds.filter((seatId) => !existingOverrideBySeatId.has(seatId))

  await prisma.$transaction(async (transaction) => {
    if (existingSeatIds.length > 0) {
      await transaction.trackerOverride.updateMany({
        where: {
          trackerSeatId: {
            in: existingSeatIds,
          },
        },
        data: {
          spendPlanId: input.spendPlanId,
        },
      })
    }

    if (missingSeatIds.length > 0) {
      await transaction.trackerOverride.createMany({
        data: missingSeatIds.map((trackerSeatId) => ({
          trackerSeatId,
          spendPlanId: input.spendPlanId,
        })),
      })
    }
  })

  const updatedOverrides = await prisma.trackerOverride.findMany({
    where: {
      trackerSeatId: {
        in: trackerSeatIds,
      },
    },
  })
  const seatById = new Map(seats.map((seat) => [seat.id, seat]))

  await Promise.all(
    updatedOverrides.map((override) =>
      writeAuditLog({
        trackingYearId: seatById.get(override.trackerSeatId)?.trackingYearId ?? null,
        entityType: "TrackerOverride",
        entityId: override.id,
        action: existingOverrideBySeatId.has(override.trackerSeatId) ? "UPDATE" : "CREATE",
        actor,
        changes: buildAuditChanges(
          existingOverrideBySeatId.get(override.trackerSeatId),
          override,
          ["spendPlanId"]
        ),
      })
    )
  )

  return { updatedCount: trackerSeatIds.length }
}

export async function getExternalActualImportsPageData(input?: {
  year?: number
  user?: string
  fileName?: string
  seatId?: string
  team?: string
  importedFrom?: string
  importedTo?: string
}, viewer?: Pick<AppViewer, "role" | "scopes">) {
  const trackingYears = await prisma.trackingYear.findMany({
    orderBy: { year: "asc" },
  })

  const activeYear =
    input?.year ??
    trackingYears.find((trackingYear) => trackingYear.isActive)?.year ??
    trackingYears.at(-1)?.year ??
    new Date().getFullYear()

  const trackingYear = await getOrCreateTrackingYear(activeYear)
  const filters: ExternalActualImportFilters = {
    user: input?.user?.trim() ?? "",
    fileName: input?.fileName?.trim() ?? "",
    seatId: input?.seatId?.trim() ?? "",
    team: input?.team?.trim() ?? "",
    importedFrom: input?.importedFrom?.trim() ?? "",
    importedTo: input?.importedTo?.trim() ?? "",
  }

  const importedFrom = filters.importedFrom ? new Date(filters.importedFrom) : null
  const importedTo = filters.importedTo ? new Date(filters.importedTo) : null

  const normalizedUser = normalizeValue(filters.user)
  const normalizedFileName = normalizeValue(filters.fileName)
  const normalizedSeatId = normalizeValue(filters.seatId)
  const normalizedTeam = normalizeValue(filters.team)

  const trackerSeatScopeWhere = buildTrackerSeatScopeWhere(viewer)
  const baseImportWhere: Prisma.ExternalActualImportWhereInput = {
    trackingYearId: trackingYear.id,
    importedAt: {
      gte: importedFrom ?? undefined,
      lte: importedTo ?? undefined,
    },
    fileName: normalizedFileName
      ? {
          contains: filters.fileName.trim(),
          mode: "insensitive",
        }
      : undefined,
    OR: normalizedUser
      ? [
          {
            importedByName: {
              contains: filters.user.trim(),
              mode: "insensitive",
            },
          },
          {
            importedByEmail: {
              contains: filters.user.trim(),
              mode: "insensitive",
            },
          },
        ]
      : undefined,
  }
  const importWhere: Prisma.ExternalActualImportWhereInput = {
    ...baseImportWhere,
    entries: trackerSeatScopeWhere
      ? {
          some: {
            trackerSeat: {
              is: trackerSeatScopeWhere,
            },
          },
        }
      : undefined,
  }
  const scopedEntryWhere: Prisma.ExternalActualEntryWhereInput = trackerSeatScopeWhere
    ? {
        trackerSeat: {
          is: trackerSeatScopeWhere,
        },
      }
    : {}
  const filteredEntryWhere: Prisma.ExternalActualEntryWhereInput = {
    ...scopedEntryWhere,
    seatId: normalizedSeatId
      ? {
          contains: filters.seatId.trim(),
          mode: "insensitive",
        }
      : undefined,
    team: normalizedTeam
      ? {
          contains: filters.team.trim(),
          mode: "insensitive",
        }
      : undefined,
    import: baseImportWhere,
  }

  const [imports, entries] = await Promise.all([
    prisma.externalActualImport.findMany({
      where: importWhere,
      include: {
        entries: {
          where: scopedEntryWhere,
          select: {
            amount: true,
            trackerSeatId: true,
          },
        },
      },
      orderBy: [{ importedAt: "desc" }],
    }),
    prisma.externalActualEntry.findMany({
      where: filteredEntryWhere,
      include: {
        import: {
          select: {
            id: true,
            importedAt: true,
            fileName: true,
            importedByName: true,
            importedByEmail: true,
          },
        },
      },
      orderBy: [
        { import: { importedAt: "desc" } },
        { seatId: "asc" },
        { monthIndex: "asc" },
      ],
    }),
  ])

  const importViews: ExternalActualImportBatchView[] = imports.map((importBatch) => ({
    id: importBatch.id,
    importedAt: importBatch.importedAt,
    fileName: importBatch.fileName,
    importedByName: importBatch.importedByName,
    importedByEmail: importBatch.importedByEmail,
    rowCount: importBatch.rowCount,
    entryCount: importBatch.entryCount,
    amount: importBatch.entries.reduce((sum, entry) => sum + entry.amount, 0),
    matchedCount: importBatch.entries.filter((entry) => Boolean(entry.trackerSeatId)).length,
  }))

  const views: ExternalActualImportView[] = entries.map((entry) => ({
    id: entry.id,
    importedAt: entry.import.importedAt,
    fileName: entry.import.fileName,
    importedByName: entry.import.importedByName,
    importedByEmail: entry.import.importedByEmail,
    seatId: entry.seatId,
    team: entry.team,
    inSeat: entry.inSeat,
    description: entry.description,
    monthIndex: entry.monthIndex,
    monthLabel: entry.monthLabel,
    amount: entry.amount,
    originalAmount: entry.originalAmount,
    originalCurrency: entry.originalCurrency,
    invoiceNumber: entry.invoiceNumber,
    supplierName: entry.supplierName,
    matchedTrackerSeatId: entry.trackerSeatId,
  }))

  return {
    activeYear,
    trackingYears,
    filters,
    imports: importViews,
    entries: views,
    filterOptions: {
      users: collectSortedValues(
        views.flatMap((entry) => [entry.importedByName, entry.importedByEmail])
      ),
      fileNames: collectSortedValues(views.map((entry) => entry.fileName)),
      seatIds: collectSortedValues(views.map((entry) => entry.seatId)),
      teams: collectSortedValues(views.map((entry) => entry.team)),
    },
    totals: {
      entryCount: views.length,
      amount: views.reduce((sum, entry) => sum + entry.amount, 0),
      matchedCount: views.filter((entry) => entry.matchedTrackerSeatId).length,
    },
  }
}

async function syncSeatMonthFromLatestExternalActualEntry(
  transaction: Prisma.TransactionClient,
  trackerSeatId: string,
  monthIndex: number
) {
  const replacement = await transaction.externalActualEntry.findFirst({
    where: {
      trackerSeatId,
      monthIndex,
    },
    include: {
      import: true,
    },
    orderBy: [{ import: { importedAt: "desc" } }, { createdAt: "desc" }],
  })

  await transaction.seatMonth.upsert({
    where: {
      trackerSeatId_monthIndex: {
        trackerSeatId,
        monthIndex,
      },
    },
    update: replacement
      ? {
          actualAmount: replacement.amount <= 0 ? 0 : replacement.amount,
          actualAmountRaw: replacement.originalAmount ?? replacement.amount,
          actualCurrency: replacement.originalCurrency ?? "DKK",
          exchangeRateUsed:
            replacement.amount <= 0
              ? null
              : replacement.originalCurrency &&
                  replacement.originalCurrency !== "DKK" &&
                  replacement.originalAmount &&
                  replacement.originalAmount > 0
                ? replacement.amount / replacement.originalAmount
                : 1,
          forecastIncluded: replacement.amount <= 0,
          usedForecastAmount: replacement.usedForecastAmount,
          notes: `Imported from external actuals: ${replacement.import.fileName} (${replacement.import.id})`,
        }
      : {
          actualAmount: 0,
          actualAmountRaw: null,
          actualCurrency: "DKK",
          exchangeRateUsed: null,
          forecastIncluded: true,
          usedForecastAmount: null,
          notes: null,
        },
    create: replacement
      ? {
          trackerSeatId,
          monthIndex,
          actualAmount: replacement.amount <= 0 ? 0 : replacement.amount,
          actualAmountRaw: replacement.originalAmount ?? replacement.amount,
          actualCurrency: replacement.originalCurrency ?? "DKK",
          exchangeRateUsed:
            replacement.amount <= 0
              ? null
              : replacement.originalCurrency &&
                  replacement.originalCurrency !== "DKK" &&
                  replacement.originalAmount &&
                  replacement.originalAmount > 0
                ? replacement.amount / replacement.originalAmount
                : 1,
          forecastIncluded: replacement.amount <= 0,
          usedForecastAmount: replacement.usedForecastAmount,
          notes: `Imported from external actuals: ${replacement.import.fileName} (${replacement.import.id})`,
        }
      : {
          trackerSeatId,
          monthIndex,
          actualAmount: 0,
          actualAmountRaw: null,
          actualCurrency: "DKK",
          exchangeRateUsed: null,
          forecastIncluded: true,
          usedForecastAmount: null,
          notes: null,
        },
  })
}

export async function updateExternalActualEntry(
  input: {
    entryId: string
    amount: number
    invoiceNumber?: string | null
    supplierName?: string | null
  },
  actor?: AuditActor
) {
  const entry = await prisma.externalActualEntry.findUniqueOrThrow({
    where: { id: input.entryId },
    include: {
      import: true,
    },
  })

  const actorEmail = normalizeValue(actor?.email)
  if (!actorEmail || actorEmail !== normalizeValue(entry.import.importedByEmail)) {
    throw new Error("Only the user who created this external actual can edit it.")
  }

  const currency = entry.originalCurrency ?? "DKK"
  const exchangeRate =
    currency !== "DKK" && entry.originalAmount && entry.originalAmount > 0
      ? entry.amount / entry.originalAmount
      : 1
  const originalAmount = input.amount
  const amount =
    currency !== "DKK"
      ? Math.round(originalAmount * exchangeRate * 100) / 100
      : originalAmount

  const updated = await prisma.$transaction(async (transaction) => {
    const nextEntry = await transaction.externalActualEntry.update({
      where: { id: input.entryId },
      data: {
        amount,
        originalAmount,
        originalCurrency: currency,
        invoiceNumber: input.invoiceNumber ?? null,
        supplierName: input.supplierName ?? null,
      },
      include: {
        import: true,
      },
    })

    if (nextEntry.trackerSeatId) {
      await syncSeatMonthFromLatestExternalActualEntry(
        transaction,
        nextEntry.trackerSeatId,
        nextEntry.monthIndex
      )
    }

    await transaction.externalActualImport.update({
      where: { id: nextEntry.importId },
      data: {
        entryCount: await transaction.externalActualEntry.count({
          where: { importId: nextEntry.importId },
        }),
      },
    })

    return nextEntry
  })

  await writeAuditLog({
    trackingYearId: entry.trackingYearId,
    entityType: "ExternalActualEntry",
    entityId: entry.id,
    action: "UPDATE",
    actor,
    changes: buildAuditChanges(
      {
        amount: entry.amount,
        originalAmount: entry.originalAmount,
        invoiceNumber: entry.invoiceNumber,
        supplierName: entry.supplierName,
      },
      {
        amount: updated.amount,
        originalAmount: updated.originalAmount,
        invoiceNumber: updated.invoiceNumber,
        supplierName: updated.supplierName,
      }
    ),
  })

  return updated
}

export async function deleteExternalActualEntry(
  input: {
    entryId: string
  },
  actor?: AuditActor
) {
  const entry = await prisma.externalActualEntry.findUniqueOrThrow({
    where: { id: input.entryId },
    include: {
      import: true,
    },
  })

  const actorEmail = normalizeValue(actor?.email)
  if (!actorEmail || actorEmail !== normalizeValue(entry.import.importedByEmail)) {
    throw new Error("Only the user who created this external actual can delete it.")
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.externalActualEntry.delete({
      where: { id: input.entryId },
    })

    if (entry.trackerSeatId) {
      await syncSeatMonthFromLatestExternalActualEntry(
        transaction,
        entry.trackerSeatId,
        entry.monthIndex
      )
    }

    const remainingCount = await transaction.externalActualEntry.count({
      where: { importId: entry.importId },
    })

    if (remainingCount === 0) {
      await transaction.externalActualImport.delete({
        where: { id: entry.importId },
      })
      return
    }

    await transaction.externalActualImport.update({
      where: { id: entry.importId },
      data: {
        entryCount: remainingCount,
      },
    })
  })

  await writeAuditLog({
    trackingYearId: entry.trackingYearId,
    entityType: "ExternalActualEntry",
    entityId: entry.id,
    action: "DELETE",
    actor,
    changes: [
      {
        field: "externalActualEntry",
        oldValue: JSON.stringify({
          amount: entry.amount,
          originalAmount: entry.originalAmount,
          originalCurrency: entry.originalCurrency,
          invoiceNumber: entry.invoiceNumber,
          supplierName: entry.supplierName,
          importId: entry.importId,
          trackerSeatId: entry.trackerSeatId,
          monthIndex: entry.monthIndex,
        }),
      },
    ],
  })

  return { deletedId: entry.id }
}

export async function getPeopleRosterPageData(input?: {
  year?: number
  seatIds?: string[]
  names?: string[]
  emails?: string[]
  domains?: string[]
  teams?: string[]
  subDomains?: string[]
  projectCodes?: string[]
  vendors?: string[]
  locations?: string[]
  statuses?: string[]
  roles?: string[]
  bands?: string[]
  month?: string
  staffingBucket?: string
  validation?: string
}, viewer?: Pick<AppViewer, "role" | "scopes">) {
  const trackingYears = await prisma.trackingYear.findMany({
    orderBy: { year: "asc" },
  })

  const activeYear =
    input?.year ??
    trackingYears.find((trackingYear) => trackingYear.isActive)?.year ??
    trackingYears.at(-1)?.year ??
    new Date().getFullYear()

  const trackingYear = await getOrCreateTrackingYear(activeYear)
  const statusDefinitions = await ensureStatusDefinitions(activeYear)
  const activeStatuses = buildActiveStatusLookup(statusDefinitions)
  const filters: PeopleRosterFilters = {
    seatIds: input?.seatIds ?? [],
    names: input?.names ?? [],
    emails: input?.emails ?? [],
    domains: input?.domains ?? [],
    teams: input?.teams ?? [],
    subDomains: input?.subDomains ?? [],
    projectCodes: input?.projectCodes ?? [],
    vendors: input?.vendors ?? [],
    locations: input?.locations ?? [],
    statuses: input?.statuses ?? [],
    roles: input?.roles ?? [],
    bands: input?.bands ?? [],
    month: input?.month?.trim() ?? "",
    staffingBucket: input?.staffingBucket?.trim() ?? "",
    validation: input?.validation?.trim() ?? "",
  }

  const [people, departmentMappings, rosterImports, trackerSeats, budgetAreas, seatReferenceValues] =
    await Promise.all([
    prisma.rosterPerson.findMany({
      where: {
        trackingYearId: trackingYear.id,
        import: {
          status: "APPROVED",
        },
      },
      include: {
        import: true,
      },
      orderBy: [{ import: { importedAt: "desc" } }, { teamName: "asc" }, { seatId: "asc" }],
    }),
    getDepartmentMappings(activeYear),
    prisma.rosterImport.findMany({
      where: {
        trackingYearId: trackingYear.id,
        status: "APPROVED",
      },
      orderBy: [{ importedAt: "desc" }],
      take: 20,
    }),
    prisma.trackerSeat.findMany({
      where: {
        trackingYearId: trackingYear.id,
        isActive: true,
      },
      include: {
        months: true,
        override: true,
        budgetArea: true,
      },
    }),
    prisma.budgetArea.findMany({
      where: {
        trackingYearId: trackingYear.id,
      },
      orderBy: [{ domain: "asc" }, { subDomain: "asc" }, { projectCode: "asc" }],
    }),
    getSeatReferenceValues(activeYear),
  ])

  const latestPeople = Array.from(
    people
      .reduce<Map<string, (typeof people)[number]>>((latestBySeat, person) => {
        if (!latestBySeat.has(person.seatId)) {
          latestBySeat.set(person.seatId, person)
        }

        return latestBySeat
      }, new Map())
      .values()
  )
  const latestRosterSeatIds = new Set(latestPeople.map((person) => person.seatId))
  const mappingLookup = buildDepartmentMappingLookup(departmentMappings)
  const trackerSeatBySeatId = new Map(trackerSeats.map((seat) => [seat.seatId, seat]))
  const rosterViews: PeopleRosterView[] = latestPeople.map((person) => {
    const trackerSeat = trackerSeatBySeatId.get(person.seatId)
    const effectiveSeat = trackerSeat ? getEffectiveSeat(trackerSeat as SeatWithRelations) : null
    const mappedHierarchy = resolveDepartmentMapping(mappingLookup, {
      sourceCode: person.domain,
      subDomain: person.productLine,
      projectCode: effectiveSeat?.projectCode,
    })

    return {
      id: person.id,
      trackerSeatId: trackerSeat?.id ?? null,
      sourceType: trackerSeat?.sourceType ?? "ROSTER",
      importFileName: person.import.fileName,
      seatId: person.seatId,
      budgetAreaId: effectiveSeat?.budgetAreaId ?? trackerSeat?.budgetAreaId ?? null,
      overrideBudgetAreaId: trackerSeat?.override?.budgetAreaId ?? null,
      departmentCode: person.domain,
      domain: normalizeDomainLabel(effectiveSeat?.domain || mappedHierarchy?.domain || person.domain),
      projectCode: effectiveSeat?.projectCode || mappedHierarchy?.projectCode || null,
      name: effectiveSeat?.inSeat || person.resourceName,
      email: person.email,
      team: effectiveSeat?.team || person.teamName,
      subDomain: normalizeSubDomainLabel(effectiveSeat?.subDomain || person.productLine),
      mappedSubDomain: normalizeSubDomainLabel(
        effectiveSeat?.subDomain || mappedHierarchy?.subDomain || null
      ),
      vendor: effectiveSeat?.vendor || person.vendor,
      dailyRate: effectiveSeat?.dailyRate ?? person.dailyRate,
      location: effectiveSeat?.location || person.location,
      band: effectiveSeat?.band || person.band,
      role: effectiveSeat?.description || person.title,
      resourceType: effectiveSeat?.resourceType || person.resourceType,
      status: effectiveSeat?.status || person.status,
      manager: effectiveSeat?.manager || person.lineManager,
      fte: effectiveSeat?.allocation ?? person.allocation,
      spendPlanId: effectiveSeat?.spendPlanId || null,
      ritm: effectiveSeat?.ritm || null,
      sow: effectiveSeat?.sow || null,
      notes: effectiveSeat?.notes || null,
      startDate: person.expectedStartDate,
      endDate: person.expectedEndDate,
      effectiveStatus: effectiveSeat?.status || person.status,
      effectiveInSeat: effectiveSeat?.inSeat || person.resourceName,
      effectiveStartDate: effectiveSeat?.startDate || person.expectedStartDate,
      effectiveEndDate: effectiveSeat?.endDate || person.expectedEndDate,
      importError: person.importError,
    }
  })
  const manualSeatViews: PeopleRosterView[] = trackerSeats
    .filter((seat) => seat.sourceType === "MANUAL")
    .filter((seat) => !latestRosterSeatIds.has(seat.seatId))
    .map((seat) => {
      const effectiveSeat = getEffectiveSeat(seat as SeatWithRelations)
      return {
        id: seat.id,
        trackerSeatId: seat.id,
        sourceType: "MANUAL",
        importFileName: "Manual seat",
        seatId: seat.seatId,
        budgetAreaId: effectiveSeat.budgetAreaId,
        overrideBudgetAreaId: seat.override?.budgetAreaId ?? null,
        departmentCode: effectiveSeat.costCenter ?? null,
        domain: normalizeDomainLabel(effectiveSeat.domain),
        projectCode: effectiveSeat.projectCode ?? null,
        name: effectiveSeat.inSeat ?? null,
        email: null,
        team: effectiveSeat.team ?? null,
        subDomain: normalizeSubDomainLabel(effectiveSeat.subDomain),
        mappedSubDomain: normalizeSubDomainLabel(effectiveSeat.subDomain),
        vendor: effectiveSeat.vendor ?? null,
        dailyRate: effectiveSeat.dailyRate ?? null,
        location: effectiveSeat.location ?? null,
        band: effectiveSeat.band ?? null,
        role: effectiveSeat.description ?? null,
        resourceType: effectiveSeat.resourceType ?? null,
        status: effectiveSeat.status ?? null,
        manager: effectiveSeat.manager ?? null,
        fte: effectiveSeat.allocation ?? 0,
        spendPlanId: effectiveSeat.spendPlanId ?? null,
        ritm: effectiveSeat.ritm ?? null,
        sow: effectiveSeat.sow ?? null,
        notes: effectiveSeat.notes ?? null,
        startDate: effectiveSeat.startDate ?? null,
        endDate: effectiveSeat.endDate ?? null,
        effectiveStatus: effectiveSeat.status ?? null,
        effectiveInSeat: effectiveSeat.inSeat ?? null,
        effectiveStartDate: effectiveSeat.startDate ?? null,
        effectiveEndDate: effectiveSeat.endDate ?? null,
        importError: null,
      }
    })

  const allRosterViews = [...rosterViews, ...manualSeatViews]
  const scopedRosterViews = filterScopedItems(
    allRosterViews,
    viewer,
    (person) => ({
      domain: person.domain,
      subDomain: person.mappedSubDomain || person.subDomain,
    })
  )
  const projectCodeLabels = new Map(
    budgetAreas
      .filter((area) => area.projectCode.trim().length > 0)
      .map((area) => [
        normalizeValue(area.projectCode),
        [
          area.projectCode,
          area.pillar ||
            area.subDomain ||
            area.displayName ||
            area.domain ||
            "No pillar",
        ].join(" · "),
      ])
  )
  const seatIdFilter = normalizeValues(filters.seatIds)
  const nameFilter = normalizeValues(filters.names)
  const emailFilter = normalizeValues(filters.emails)
  const domainFilter = normalizeValues(filters.domains)
  const teamFilter = normalizeValues(filters.teams)
  const subDomainFilter = normalizeValues(filters.subDomains)
  const projectCodeFilter = normalizeValues(filters.projectCodes)
  const vendorFilter = normalizeValues(filters.vendors)
  const locationFilter = normalizeValues(filters.locations)
  const statusFilter = normalizeValues(filters.statuses)
  const roleFilter = normalizeValues(filters.roles)
  const bandFilter = normalizeValues(filters.bands)
  const monthIndex =
    filters.month
      ? MONTH_NAMES.findIndex((month) => month === filters.month)
      : -1
  const staffingBucket = normalizeValue(filters.staffingBucket)

  const filteredPeople = scopedRosterViews.filter((person) => {
    if (seatIdFilter.size > 0 && !seatIdFilter.has(normalizeValue(person.seatId))) {
      return false
    }

    if (nameFilter.size > 0 && !nameFilter.has(normalizeValue(person.name))) {
      return false
    }

    if (emailFilter.size > 0 && !emailFilter.has(normalizeValue(person.email))) {
      return false
    }

    if (domainFilter.size > 0 && !domainFilter.has(normalizeValue(person.domain))) {
      return false
    }

    if (teamFilter.size > 0 && !teamFilter.has(normalizeValue(person.team))) {
      return false
    }

    if (
      subDomainFilter.size > 0 &&
      !subDomainFilter.has(normalizeValue(person.mappedSubDomain || person.subDomain))
    ) {
      return false
    }

    if (
      projectCodeFilter.size > 0 &&
      !projectCodeFilter.has(normalizeValue(person.projectCode))
    ) {
      return false
    }

    if (vendorFilter.size > 0 && !vendorFilter.has(normalizeValue(person.vendor))) {
      return false
    }

    if (
      locationFilter.size > 0 &&
      !locationFilter.has(normalizeValue(person.location))
    ) {
      return false
    }

    if (statusFilter.size > 0 && !statusFilter.has(normalizeValue(person.status))) {
      return false
    }

    if (roleFilter.size > 0 && !roleFilter.has(normalizeValue(person.role))) {
      return false
    }

    if (bandFilter.size > 0 && !bandFilter.has(normalizeValue(person.band))) {
      return false
    }

    if (
      monthIndex >= 0 &&
      !isMonthActiveForSeat(
        activeYear,
        monthIndex,
        person.effectiveStartDate,
        person.effectiveEndDate
      )
    ) {
      return false
    }

    if (staffingBucket) {
      const normalizedStatus = normalizeValue(person.effectiveStatus)
      const normalizedInSeat = normalizeValue(person.effectiveInSeat)
      const isPermPerson = isPermRosterPerson(person)

      if (staffingBucket === "ext total" || staffingBucket === "ext-total") {
        return !isPermPerson
      }

      if (!isPermPerson) {
        return false
      }

      const matchesBucket =
        staffingBucket === "perm total" || staffingBucket === "perm-total"
          ? (
              normalizedStatus === "open" ||
              normalizedStatus === "on leave" ||
              matchesActiveBucket(normalizedStatus, normalizedInSeat, activeStatuses)
            )
          : staffingBucket === "open"
          ? normalizedStatus === "open"
          : staffingBucket === "on leave"
            ? normalizedStatus === "on leave"
            : (
                normalizedStatus !== "open" &&
                normalizedStatus !== "on leave" &&
                matchesActiveBucket(normalizedStatus, normalizedInSeat, activeStatuses)
              )

      if (!matchesBucket) {
        return false
      }
    }

    if (filters.validation === "error" && !person.importError) {
      return false
    }

    if (filters.validation === "ok" && person.importError) {
      return false
    }

    return true
  })

  return {
    activeYear,
    trackingYears,
    filters,
    people: filteredPeople,
    filterOptions: {
      seatIds: collectSortedValues(scopedRosterViews.map((person) => person.seatId)),
      names: collectSortedValues(scopedRosterViews.map((person) => person.name)),
      emails: collectSortedValues(scopedRosterViews.map((person) => person.email)),
      domains: collectSortedValues(scopedRosterViews.map((person) => person.domain)),
      teams: collectSortedValues(scopedRosterViews.map((person) => person.team)),
      subDomains: collectSortedValues(
        scopedRosterViews.map((person) => person.mappedSubDomain || person.subDomain)
      ),
      hierarchyRows: scopedRosterViews.map((person) => ({
        domain: person.domain,
        subDomain: person.mappedSubDomain || person.subDomain,
        team: person.team,
      })),
      projectCodes: collectSortedValues(scopedRosterViews.map((person) => person.projectCode)).map(
        (projectCode) => ({
          value: projectCode,
          label:
            projectCodeLabels.get(normalizeValue(projectCode)) ??
            `${projectCode} · No pillar`,
        })
      ),
      vendors: collectSortedValues(scopedRosterViews.map((person) => person.vendor)),
      locations: collectSortedValues(scopedRosterViews.map((person) => person.location)),
      statuses: collectSortedValues(scopedRosterViews.map((person) => person.status)),
      roles: collectSortedValues(scopedRosterViews.map((person) => person.role)),
      bands: collectSortedValues(scopedRosterViews.map((person) => person.band)),
    },
    totals: {
      rowCount: filteredPeople.length,
      totalSeatCount: scopedRosterViews.length,
      filteredFte: filteredPeople.reduce((sum, person) => sum + (person.fte ?? 0), 0),
      totalFte: scopedRosterViews.reduce((sum, person) => sum + (person.fte ?? 0), 0),
      uniqueTeams: new Set(
        filteredPeople.map((person) => normalizeValue(person.team)).filter(Boolean)
      ).size,
      externalCount: filteredPeople.filter(
        (person) => normalizeValue(person.resourceType) === "external"
      ).length,
      errorCount: filteredPeople.filter((person) => Boolean(person.importError)).length,
    },
    rosterImports,
    departmentMappings,
    budgetAreas,
    seatReferenceValues,
  }
}

export async function getPeopleRosterImportsPageData(year?: number) {
  const trackingYears = await prisma.trackingYear.findMany({
    orderBy: { year: "asc" },
  })

  const activeYear =
    year ??
    trackingYears.find((trackingYear) => trackingYear.isActive)?.year ??
    trackingYears.at(-1)?.year ??
    new Date().getFullYear()

  const trackingYear = await getOrCreateTrackingYear(activeYear)
  const rosterImports = await prisma.rosterImport.findMany({
    where: {
      trackingYearId: trackingYear.id,
      status: "APPROVED",
    },
    orderBy: [{ importedAt: "desc" }],
    take: 20,
  })

  return {
    activeYear,
    trackingYears,
    rosterImports,
  }
}

export async function getInternalCostsPageData(year?: number) {
  const trackingYears = await prisma.trackingYear.findMany({
    orderBy: { year: "asc" },
  })

  const activeYear =
    year ??
    trackingYears.find((trackingYear) => trackingYear.isActive)?.year ??
    trackingYears.at(-1)?.year ??
    new Date().getFullYear()

  const trackingYear = await getOrCreateTrackingYear(activeYear)
  const [assumptions, internalActualsMessage] = await Promise.all([
    prisma.costAssumption.findMany({
      where: { trackingYearId: trackingYear.id },
      orderBy: [{ location: "asc" }, { band: "asc" }],
    }),
    prisma.serviceMessage.findUnique({
      where: {
        trackingYearId_key: {
          trackingYearId: trackingYear.id,
          key: INTERNAL_ACTUALS_SERVICE_MESSAGE_KEY,
        },
      },
    }),
  ])

  return {
    activeYear,
    trackingYears,
    internalActualsMessage: internalActualsMessage?.content ?? null,
    assumptions: assumptions.map((assumption) => ({
      ...assumption,
      dailyCost: assumption.yearlyCost / WORK_DAYS_PER_YEAR,
    })),
  }
}

export async function getStatusesPageData(year?: number) {
  const trackingYears = await prisma.trackingYear.findMany({
    orderBy: { year: "asc" },
  })

  const activeYear =
    year ??
    trackingYears.find((trackingYear) => trackingYear.isActive)?.year ??
    trackingYears.at(-1)?.year ??
    new Date().getFullYear()

  const statuses = await ensureStatusDefinitions(activeYear)

  return {
    activeYear,
    trackingYears,
    statuses,
  }
}

export async function getAdminPageData(year?: number) {
  const trackingYears = await prisma.trackingYear.findMany({
    orderBy: { year: "asc" },
  })

  const activeYear =
    year ??
    trackingYears.find((trackingYear) => trackingYear.isActive)?.year ??
    trackingYears.at(-1)?.year ??
    new Date().getFullYear()

  const [
    statuses,
    exchangeRates,
    departmentMappings,
    accrualAccountMappings,
    rosterResourceTypes,
    seatReferenceValues,
  ] = await Promise.all([
    ensureStatusDefinitions(activeYear),
    getExchangeRateHistory(activeYear),
    getDepartmentMappings(activeYear),
    getAccrualAccountMappings(activeYear),
    getActiveRosterResourceTypes(activeYear),
    getSeatReferenceValues(activeYear),
  ])

  return {
    activeYear,
    trackingYears,
    statuses,
    exchangeRates,
    departmentMappings,
    accrualAccountMappings,
    rosterResourceTypes,
    seatReferenceValues,
  }
}

export async function getForecastOverrideExportRows(year: number) {
  const trackingYear = await getOrCreateTrackingYear(year)
  const months = await prisma.seatMonth.findMany({
    where: {
      trackerSeat: {
        trackingYearId: trackingYear.id,
      },
      OR: [
        { forecastOverrideAmount: { not: null } },
        { forecastIncluded: false },
      ],
    },
    include: {
      trackerSeat: {
        select: {
          id: true,
          sourceKey: true,
          seatId: true,
          inSeat: true,
        },
      },
    },
    orderBy: [
      { trackerSeat: { seatId: "asc" } },
      { monthIndex: "asc" },
    ],
  })

  return months.map((month) => ({
    "Tracker Seat ID": month.trackerSeat.id,
    "Source Key": month.trackerSeat.sourceKey,
    "Seat ID": month.trackerSeat.seatId,
    Name: month.trackerSeat.inSeat ?? "",
    Month: MONTH_NAMES[month.monthIndex] ?? "",
    "Month Number": month.monthIndex + 1,
    "Forecast Override Amount": month.forecastOverrideAmount,
    "Forecast Included": month.forecastIncluded ? "true" : "false",
  }))
}

export async function getTrackerOverrideExportRows(year: number) {
  const trackingYear = await getOrCreateTrackingYear(year)
  const overrides = await prisma.trackerOverride.findMany({
    where: {
      trackerSeat: {
        trackingYearId: trackingYear.id,
      },
    },
    include: {
      trackerSeat: {
        select: {
          id: true,
          sourceKey: true,
          seatId: true,
          inSeat: true,
        },
      },
    },
    orderBy: [
      { trackerSeat: { seatId: "asc" } },
      { trackerSeat: { inSeat: "asc" } },
    ],
  })

  return overrides.map((override) => ({
    "Tracker Seat ID": override.trackerSeat.id,
    "Source Key": override.trackerSeat.sourceKey,
    "Seat ID": override.trackerSeat.seatId,
    Name: override.inSeat ?? override.trackerSeat.inSeat ?? "",
    Domain: override.domain,
    "Sub-domain": override.subDomain,
    Funding: override.funding,
    Pillar: override.pillar,
    "Budget Area ID": override.budgetAreaId,
    "Cost Center": override.costCenter,
    "Project Code": override.projectCode,
    "Resource Type": override.resourceType,
    Team: override.team,
    Description: override.description,
    Band: override.band,
    Location: override.location,
    Vendor: override.vendor,
    Manager: override.manager,
    "Daily Rate": override.dailyRate,
    RITM: override.ritm,
    SOW: override.sow,
    "Spend Plan ID": override.spendPlanId,
    Status: override.status,
    Allocation: override.allocation,
    "Start Date": formatDateOnly(override.startDate),
    "End Date": formatDateOnly(override.endDate),
    Notes: override.notes,
  }))
}

async function getStaffingTargets(activeYear: number) {
  const trackingYear = await getOrCreateTrackingYear(activeYear)

  const targets = await prisma.staffingTarget.findMany({
    where: { trackingYearId: trackingYear.id },
    orderBy: [
      { domain: "asc" },
      { subDomain: "asc" },
      { projectCode: "asc" },
      { scopeLevel: "asc" },
    ],
  })

  return targets.map((target) => ({
    id: target.id,
    scopeLevel: target.scopeLevel,
    domain: target.domain,
    subDomain: target.subDomain,
    projectCode: target.projectCode,
    permTarget: target.permTarget,
  })) satisfies StaffingTargetView[]
}

async function getStaffingHierarchyOptions(
  activeYear: number,
  viewer?: Pick<AppViewer, "role" | "scopes">
) {
  const trackingYear = await getOrCreateTrackingYear(activeYear)
  const [budgetAreas, seats, mappings] = await Promise.all([
    prisma.budgetArea.findMany({
      where: { trackingYearId: trackingYear.id },
      select: {
        domain: true,
        subDomain: true,
        projectCode: true,
      },
    }),
    prisma.trackerSeat.findMany({
      where: {
        trackingYearId: trackingYear.id,
        isActive: true,
      },
      select: {
        domain: true,
        subDomain: true,
        projectCode: true,
      },
    }),
    prisma.departmentMapping.findMany({
      where: { trackingYearId: trackingYear.id },
      select: {
        domain: true,
        subDomain: true,
        projectCode: true,
      },
    }),
  ])

  const entries = filterScopedItems(
    [...budgetAreas, ...seats, ...mappings]
      .map((entry) => ({
        domain: normalizeDomainLabel(entry.domain),
        subDomain: normalizeSubDomainLabel(entry.subDomain),
        projectCode: normalizeStaffingProjectCode(entry.projectCode),
      }))
      .filter((entry) => entry.domain),
    viewer,
    (entry) => ({ domain: entry.domain, subDomain: entry.subDomain })
  ) as {
    domain: string
    subDomain: string | null
    projectCode: string | null
  }[]

  const domains = collectSortedValues(entries.map((entry) => entry.domain))
  const subDomainsByDomain = entries.reduce((map, entry) => {
    if (!entry.subDomain) {
      return map
    }

    const current = map.get(entry.domain) ?? []
    current.push(entry.subDomain)
    map.set(entry.domain, current)
    return map
  }, new Map<string, string[]>())
  const projectCodesByScope = entries.reduce((map, entry) => {
    if (!entry.subDomain || !entry.projectCode) {
      return map
    }

    const key = `${entry.domain}::${entry.subDomain}`
    const current = map.get(key) ?? []
    current.push(entry.projectCode)
    map.set(key, current)
    return map
  }, new Map<string, string[]>())

  return {
    domains,
    subDomainsByDomain: Array.from(subDomainsByDomain.entries()).map(([domain, values]) => ({
      domain,
      subDomains: collectSortedValues(values),
    })),
    projectCodesByScope: Array.from(projectCodesByScope.entries()).map(([key, values]) => {
      const [domain, subDomain] = key.split("::")
      return {
        domain,
        subDomain,
        projectCodes: collectSortedValues(values),
      }
    }),
  }
}

export async function getStaffingPageData(
  year?: number,
  domainFilter?: string,
  viewer?: Pick<AppViewer, "role" | "scopes">
) {
  const trackingYears = await prisma.trackingYear.findMany({
    orderBy: { year: "asc" },
  })

  const activeYear =
    year ??
    trackingYears.find((trackingYear) => trackingYear.isActive)?.year ??
    trackingYears.at(-1)?.year ??
    new Date().getFullYear()

  const trackingYear = await getOrCreateTrackingYear(activeYear)
  await ensureFreshTrackerDerivation(activeYear)
  const statusDefinitions = await ensureStatusDefinitions(activeYear)

  const [seats, departmentMappings, allTargets, hierarchyOptions] = await Promise.all([
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
      orderBy: [{ subDomain: "asc" }, { projectCode: "asc" }, { seatId: "asc" }],
    }),
    prisma.departmentMapping.findMany({
      where: {
        trackingYearId: trackingYear.id,
        codeType: "DEPARTMENT_CODE",
      },
    }),
    getStaffingTargets(activeYear),
    getStaffingHierarchyOptions(activeYear, viewer),
  ])

  const mappingLookup = buildDepartmentMappingLookup(departmentMappings)
  const activeStatuses = buildActiveStatusLookup(statusDefinitions)
  const scopedSeats = filterScopedItems(
    seats as SeatWithRelations[],
    viewer,
    (seat) => {
      const effectiveSeat = getEffectiveSeat(seat)
      const mapped = resolveDepartmentMapping(mappingLookup, {
        sourceCode: effectiveSeat.costCenter,
        subDomain: effectiveSeat.subDomain,
        projectCode: effectiveSeat.projectCode,
      })
      return {
        domain: mapped?.domain || effectiveSeat.domain,
        subDomain: mapped?.subDomain || effectiveSeat.subDomain,
      }
    }
  )
  const allRows = buildStaffingOverviewRows({
    seats: scopedSeats as SeatWithRelations[],
    year: activeYear,
    activeStatuses,
    mappingLookup,
    targets: filterScopedItems(
      allTargets,
      viewer,
      (target) => ({ domain: target.domain, subDomain: target.subDomain })
    ),
  })
  const targets = filterScopedItems(
    allTargets,
    viewer,
    (target) => ({ domain: target.domain, subDomain: target.subDomain })
  )
  const availableDomains = collectSortedValues([
    ...hierarchyOptions.domains,
    ...allRows.map((row) => row.domain),
    ...targets.map((target) => target.domain),
  ])
  const selectedDomain =
    domainFilter && availableDomains.includes(domainFilter)
      ? domainFilter
      : availableDomains[0] ?? hierarchyOptions.domains[0] ?? null
  const rows = selectedDomain
    ? allRows.filter((row) => row.domain === selectedDomain)
    : []
  const groups = selectedDomain
    ? buildStaffingOverviewGroups(rows, selectedDomain, targets)
    : []
  const domainTarget = selectedDomain
    ? getStaffingTargetValue(
        buildStaffingTargetLookup(targets),
        "DOMAIN",
        selectedDomain,
        null,
        null
      )
    : null
  const domainMonths = groups.reduce(
    (months, group) => sumStaffingMonthBuckets(months, group.months),
    emptyStaffingMonthBuckets()
  )

  return {
    activeYear,
    trackingYears,
    domains: availableDomains,
    selectedDomain,
    domainTarget,
    domainMonths,
    groups,
  }
}

export async function getStaffingAdminPageData(
  year?: number,
  viewer?: Pick<AppViewer, "role" | "scopes">
) {
  const trackingYears = await prisma.trackingYear.findMany({
    orderBy: { year: "asc" },
  })

  const activeYear =
    year ??
    trackingYears.find((trackingYear) => trackingYear.isActive)?.year ??
    trackingYears.at(-1)?.year ??
    new Date().getFullYear()

  const [allTargets, hierarchyOptions] = await Promise.all([
    getStaffingTargets(activeYear),
    getStaffingHierarchyOptions(activeYear, viewer),
  ])
  const targets = filterScopedItems(
    allTargets,
    viewer,
    (target) => ({ domain: target.domain, subDomain: target.subDomain })
  )

  return {
    activeYear,
    trackingYears,
    targets,
    hierarchyOptions,
  }
}

export async function getAuditPageData(input?: {
  year?: number
  search?: string
  user?: string
  from?: string
  to?: string
}, viewer?: Pick<AppViewer, "role" | "scopes">) {
  const trackingYears = await prisma.trackingYear.findMany({
    orderBy: { year: "asc" },
  })

  const activeYear =
    input?.year ??
    trackingYears.find((trackingYear) => trackingYear.isActive)?.year ??
    trackingYears.at(-1)?.year ??
    new Date().getFullYear()

  const trackingYear = await getOrCreateTrackingYear(activeYear)
  const normalizedSearch = normalizeValue(input?.search)
  const normalizedUser = normalizeValue(input?.user)
  const fromDate = input?.from ? new Date(input.from) : null
  const toDate = input?.to ? new Date(input.to) : null

  const logs = await prisma.auditLog.findMany({
    where: {
      trackingYearId: trackingYear.id,
      createdAt: {
        gte: fromDate ?? undefined,
        lte: toDate ?? undefined,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  })

  const scopedLogs = !viewer || !hasScopeRestrictions(viewer)
    ? logs
    : logs.filter((log) =>
        viewer.scopes.some((scope) => {
          const domain = normalizeValue(scope.domain)
          const subDomain = normalizeValue(scope.subDomain)
          const haystack = [
            log.entityType,
            log.field,
            log.oldValue,
            log.newValue,
          ]
            .map((value) => normalizeValue(value))
            .join(" ")

          return Boolean(
            (subDomain && haystack.includes(subDomain)) ||
              (domain && haystack.includes(domain))
          )
        })
      )

  const filteredLogs = scopedLogs.filter((log) => {
    if (
      normalizedSearch &&
      ![
        log.entityType,
        log.entityId,
        log.action,
        log.field,
        log.oldValue,
        log.newValue,
      ]
        .map((value) => normalizeValue(value))
        .some((value) => value.includes(normalizedSearch))
    ) {
      return false
    }

    if (
      normalizedUser &&
      ![log.actorName, log.actorEmail]
        .map((value) => normalizeValue(value))
        .some((value) => value.includes(normalizedUser))
    ) {
      return false
    }

    return true
  })

  return {
    activeYear,
    trackingYears,
    filters: {
      search: input?.search ?? "",
      user: input?.user ?? "",
      from: input?.from ?? "",
      to: input?.to ?? "",
    },
    logs: filteredLogs,
  }
}

export async function upsertStatusDefinition(input: {
  year: number
  label: string
  isActiveStatus: boolean
}, actor?: AuditActor) {
  const allowedLabel = ALLOWED_SEAT_STATUSES.find(
    (status) => normalizeValue(status) === normalizeValue(input.label)
  )

  if (!allowedLabel) {
    throw new Error("Status is not in the allowed list.")
  }

  const trackingYear = await getOrCreateTrackingYear(input.year)
  const existing = await ensureStatusDefinitions(input.year)
  const existingDefinition = existing.find((status) => status.label === allowedLabel)

  const before = await prisma.statusDefinition.findUnique({
    where: {
      trackingYearId_label: {
        trackingYearId: trackingYear.id,
        label: allowedLabel,
      },
    },
  })

  const statusDefinition = await prisma.statusDefinition.upsert({
    where: {
      trackingYearId_label: {
        trackingYearId: trackingYear.id,
        label: allowedLabel,
      },
    },
    update: {
      isActiveStatus: input.isActiveStatus,
    },
    create: {
      trackingYearId: trackingYear.id,
      label: allowedLabel,
      isActiveStatus: input.isActiveStatus,
      sortOrder:
        existingDefinition?.sortOrder ??
        ALLOWED_SEAT_STATUSES.indexOf(allowedLabel),
    },
  })

  await writeAuditLog({
    trackingYearId: trackingYear.id,
    entityType: "StatusDefinition",
    entityId: statusDefinition.id,
    action: before ? "UPDATE" : "CREATE",
    actor,
    changes: buildAuditChanges(before, statusDefinition, [
      "label",
      "isActiveStatus",
      "sortOrder",
    ]),
  })

  return statusDefinition
}

export async function getBudgetAreaSummary(
  year: number,
  existingStatusDefinitions?: StatusDefinitionView[],
  snapshotInput?: TrackerYearSnapshot,
  viewer?: Pick<AppViewer, "role" | "scopes">
): Promise<BudgetAreaSummary[]> {
  const trackingYear = await getOrCreateTrackingYear(year)
  const statusDefinitions =
    existingStatusDefinitions ?? (await ensureStatusDefinitions(year))
  const snapshot =
    snapshotInput ??
    (await loadTrackerYearSnapshot(trackingYear.id, {
      includeBudgetMovements: true,
    }))

  return buildBudgetAreaSummaryFromSnapshot(
    year,
    statusDefinitions,
    snapshot,
    viewer
  )
}

function buildBudgetAreaSummaryFromSnapshot(
  year: number,
  statusDefinitions: StatusDefinitionView[],
  snapshot: TrackerYearSnapshot,
  viewer?: Pick<AppViewer, "role" | "scopes">
): BudgetAreaSummary[] {
  const {
    budgetAreas,
    budgetMovements,
    seats,
    assumptions,
    exchangeRates,
    departmentMappings,
  } = snapshot

  const assumptionLookup = buildCostAssumptionLookup(assumptions)
  const activeStatuses = buildActiveStatusLookup(statusDefinitions)
  const mappingLookup = buildDepartmentMappingLookup(departmentMappings)
  const exchangeRateLookup = buildExchangeRateLookup(exchangeRates)
  const budgetAreasById = new Map(budgetAreas.map((area) => [area.id, area]))
  const summaryMap = new Map<string, BudgetAreaSummary>()

  for (const area of budgetAreas) {
    const mappedHierarchy = resolveDepartmentMapping(mappingLookup, {
      sourceCode: area.costCenter,
      subDomain: area.subDomain,
      projectCode: area.projectCode,
    })
    const domain = normalizeDomainLabel(mappedHierarchy?.domain || area.domain || null)
    const subDomain = normalizeSubDomainLabel(
      mappedHierarchy?.subDomain || area.subDomain || null
    )
    const projectCode = mappedHierarchy?.projectCode || area.projectCode
    const summaryKey = buildSummaryKey({ subDomain, projectCode })
    const existing = summaryMap.get(summaryKey)

    summaryMap.set(summaryKey, {
      id: summaryKey,
      domain,
      subDomain,
      funding: area.funding,
      pillar: area.pillar,
      costCenter: existing?.costCenter || area.costCenter,
      projectCode: existing?.projectCode || projectCode,
      displayName: subDomain || domain || "Unmapped",
      budget: existing?.budget || 0,
      amountGivenBudget: existing?.amountGivenBudget || 0,
      financeViewBudget: existing?.financeViewBudget || 0,
      spentToDate: existing?.spentToDate || 0,
      remainingBudget: 0,
      totalForecast: existing?.totalForecast || 0,
      forecastRemaining: 0,
      permTarget: existing?.permTarget || 0,
      permForecast: existing?.permForecast || 0,
      extForecast: existing?.extForecast || 0,
      cloudCostSpentToDate: existing?.cloudCostSpentToDate || 0,
      cloudCostTarget: existing?.cloudCostTarget || 0,
      cloudCostForecast: existing?.cloudCostForecast || 0,
      cloudCostMonthlyActuals: existing?.cloudCostMonthlyActuals || Array(12).fill(0),
      cloudCostMonthlyForecast: existing?.cloudCostMonthlyForecast || Array(12).fill(0),
      seatCount: existing?.seatCount || 0,
      activeSeatCount: existing?.activeSeatCount || 0,
      openSeatCount: existing?.openSeatCount || 0,
    })
  }

  for (const movement of budgetMovements) {
    const budgetArea = movement.budgetAreaId
      ? budgetAreasById.get(movement.budgetAreaId)
      : null
    const mappedHierarchy = resolveDepartmentMapping(mappingLookup, {
      sourceCode: movement.receivingCostCenter,
      projectCode: movement.receivingProjectCode,
    }) || {
        domain: normalizeDomainLabel(budgetArea?.domain || null),
        subDomain: normalizeSubDomainLabel(budgetArea?.subDomain || null),
        projectCode: budgetArea?.projectCode || movement.receivingProjectCode,
      }
    const summaryKey = buildSummaryKey({
      subDomain: mappedHierarchy?.subDomain || null,
      projectCode: movement.receivingProjectCode,
    })
    const summary =
      summaryMap.get(summaryKey) ||
      {
        id: summaryKey,
        domain: normalizeDomainLabel(mappedHierarchy?.domain || null),
        subDomain: normalizeSubDomainLabel(mappedHierarchy?.subDomain || null),
        funding: null,
        pillar: null,
        costCenter: movement.receivingCostCenter,
        projectCode: movement.receivingProjectCode,
        displayName:
          mappedHierarchy?.subDomain || mappedHierarchy?.domain || "Unmapped",
        budget: 0,
        amountGivenBudget: 0,
        financeViewBudget: 0,
        spentToDate: 0,
        remainingBudget: 0,
        totalForecast: 0,
        forecastRemaining: 0,
        permTarget: 0,
        permForecast: 0,
        extForecast: 0,
        cloudCostSpentToDate: 0,
        cloudCostTarget: 0,
        cloudCostForecast: 0,
        cloudCostMonthlyActuals: Array(12).fill(0),
        cloudCostMonthlyForecast: Array(12).fill(0),
        seatCount: 0,
        activeSeatCount: 0,
        openSeatCount: 0,
      }
    summaryMap.set(summaryKey, summary)

    const financeValue = movement.financeViewAmount ?? movement.amountGiven
    summary.amountGivenBudget += movement.amountGiven
    summary.financeViewBudget += financeValue
    summary.budget += financeValue

    if (normalizeValue(movement.category).includes(CLOUD_CATEGORY)) {
      summary.cloudCostTarget += financeValue
    }
  }

  for (const rawSeat of seats as SeatWithRelations[]) {
    const effectiveSeat = getEffectiveSeat(rawSeat)
    const metrics = deriveSeatMetrics(
      rawSeat,
      assumptionLookup,
      exchangeRates,
      year
    )
    const isCloudSeat = normalizeValue(effectiveSeat.resourceType) === "cloud"
    const summaryKey = buildSummaryKey({
      subDomain: effectiveSeat.subDomain,
      projectCode: effectiveSeat.projectCode,
    })
    const summary =
      summaryMap.get(summaryKey) ||
      {
        id: summaryKey,
        domain: normalizeDomainLabel(effectiveSeat.domain || null),
        subDomain: effectiveSeat.subDomain || null,
        funding: effectiveSeat.funding || null,
        pillar: effectiveSeat.pillar || null,
        costCenter: effectiveSeat.costCenter || null,
        projectCode: effectiveSeat.projectCode || null,
        displayName:
          effectiveSeat.subDomain || effectiveSeat.domain || "Unmapped",
        budget: 0,
        amountGivenBudget: 0,
        financeViewBudget: 0,
        spentToDate: 0,
        remainingBudget: 0,
        totalForecast: 0,
        forecastRemaining: 0,
        permTarget: 0,
        permForecast: 0,
        extForecast: 0,
        cloudCostSpentToDate: 0,
        cloudCostTarget: 0,
        cloudCostForecast: 0,
        cloudCostMonthlyActuals: Array(12).fill(0),
        cloudCostMonthlyForecast: Array(12).fill(0),
        seatCount: 0,
        activeSeatCount: 0,
        openSeatCount: 0,
    }
    summaryMap.set(summaryKey, summary)

    const normalizedStatus = normalizeValue(effectiveSeat.status)
    const normalizedInSeat = normalizeValue(effectiveSeat.inSeat)

    if (!isCloudSeat) {
      summary.seatCount += 1

      if (normalizedStatus === normalizeValue("Open")) {
        summary.openSeatCount += 1
      }

      if (
        activeStatuses.has(normalizedStatus) ||
        (normalizedStatus.length === 0 &&
          normalizedInSeat.length > 0 &&
          normalizedInSeat !== "vacant")
      ) {
        summary.activeSeatCount += 1
      }
    }
    summary.domain =
      normalizeDomainLabel(summary.domain) ||
      normalizeDomainLabel(effectiveSeat.domain) ||
      null
    summary.subDomain =
      normalizeSubDomainLabel(summary.subDomain) ||
      normalizeSubDomainLabel(effectiveSeat.subDomain) ||
      null
    summary.spentToDate += metrics.totalSpent
    summary.totalForecast += metrics.totalForecast
    summary.permTarget += metrics.permFte
    summary.permForecast += metrics.permForecast
    summary.extForecast += metrics.extForecast
    summary.cloudCostForecast += metrics.cloudCostForecast
    if (isCloudSeat) {
      summary.cloudCostSpentToDate += metrics.totalSpent
      summary.cloudCostMonthlyActuals = summary.cloudCostMonthlyActuals.map(
        (value, monthIndex) => {
          const month = rawSeat.months.find((entry) => entry.monthIndex === monthIndex)
          const actualAmount =
            month?.actualAmountRaw !== null && month?.actualAmountRaw !== undefined
              ? convertAmountToDkk(
                  month.actualAmountRaw,
                  month.actualCurrency,
                  exchangeRateLookup
                ).amountDkk
              : (month?.actualAmount ?? 0)

          return value + actualAmount
        }
      )
      summary.cloudCostMonthlyForecast = summary.cloudCostMonthlyForecast.map(
        (value, monthIndex) => value + (metrics.monthlyForecast[monthIndex] ?? 0)
      )
    }
  }

  return filterScopedItems(
    Array.from(summaryMap.values())
    .map((summary) => ({
      ...summary,
      remainingBudget: summary.budget - summary.spentToDate,
      forecastRemaining: summary.budget - summary.totalForecast,
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName)),
    viewer,
    (summary) => ({ domain: summary.domain, subDomain: summary.subDomain })
  )
}

export async function getTrackerDetail(
  year: number,
  budgetAreaId: string,
  snapshotInput?: TrackerYearSnapshot,
  viewer?: Pick<AppViewer, "role" | "scopes">
) {
  const trackingYear = await getOrCreateTrackingYear(year)
  const snapshot =
    snapshotInput ??
    (await loadTrackerYearSnapshot(trackingYear.id, {
      includeBudgetMovements: false,
      seatOrderBy: [{ team: "asc" }, { inSeat: "asc" }],
    }))

  return buildTrackerDetailFromSnapshot(year, budgetAreaId, snapshot, viewer)
}

export async function getTrackerDomainExportRows(
  year: number,
  domain: string,
  viewer?: Pick<AppViewer, "role" | "scopes">
) {
  const normalizedDomain = normalizeValue(domain)
  if (!normalizedDomain) {
    throw new Error("Domain is required.")
  }

  const trackingYear = await getOrCreateTrackingYear(year)
  await ensureFreshTrackerDerivation(year)
  const statusDefinitions = await ensureStatusDefinitions(year)
  const snapshot = await loadTrackerYearSnapshot(trackingYear.id, {
    includeBudgetMovements: true,
    seatOrderBy: [{ team: "asc" }, { inSeat: "asc" }],
  })
  const rosterPersonIds = snapshot.seats
    .map((seat) => seat.rosterPersonId)
    .filter((rosterPersonId): rosterPersonId is string => Boolean(rosterPersonId))
  const rosterPeople =
    rosterPersonIds.length > 0
      ? await prisma.rosterPerson.findMany({
          where: {
            id: {
              in: rosterPersonIds,
            },
          },
          include: {
            import: true,
          },
        })
      : []
  const rosterPeopleById = new Map(rosterPeople.map((person) => [person.id, person]))
  const summaryKeys = new Set(
    buildBudgetAreaSummaryFromSnapshot(year, statusDefinitions, snapshot, viewer)
      .filter((row) => normalizeValue(row.domain) === normalizedDomain)
      .map((row) => row.id)
  )

  if (summaryKeys.size === 0) {
    return []
  }

  const assumptionLookup = buildCostAssumptionLookup(snapshot.assumptions)
  const exchangeRateLookup = buildExchangeRateLookup(snapshot.exchangeRates)

  return (snapshot.seats as SeatWithRelations[])
    .map((seat) => {
      const effectiveSeat = getEffectiveSeat(seat)
      return {
        seat,
        effectiveSeat,
        summaryKey: buildSummaryKey({
          subDomain: effectiveSeat.subDomain,
          projectCode: effectiveSeat.projectCode,
        }),
      }
    })
    .filter(({ summaryKey }) => summaryKeys.has(summaryKey))
    .map(({ seat, effectiveSeat }) => {
      const rosterPerson = seat.rosterPersonId
        ? rosterPeopleById.get(seat.rosterPersonId) ?? null
        : null
      const metrics = deriveSeatMetrics(
        seat,
        assumptionLookup,
        snapshot.exchangeRates,
        year,
        {
          exchangeRateLookup,
        }
      )
      const cancelled = isTrackerCancelledSeat(effectiveSeat)
      const monthsByIndex = new Map(seat.months.map((month) => [month.monthIndex, month]))
      const row: Record<string, string | number | null | undefined> = {
        "Tracker Seat ID": seat.id,
        "Source Key": seat.sourceKey,
        "Seat ID": seat.seatId,
        "Source Type": seat.sourceType,
        "Budget Area ID": effectiveSeat.budgetAreaId,
        "Domain": effectiveSeat.domain,
        "Sub-domain": effectiveSeat.subDomain,
        "Funding": effectiveSeat.funding,
        "Pillar": effectiveSeat.pillar,
        "Cost Center": effectiveSeat.costCenter,
        "Project Code": effectiveSeat.projectCode,
        "Team": effectiveSeat.team,
        "In Seat": effectiveSeat.inSeat,
        "Description": effectiveSeat.description,
        "Resource Type": effectiveSeat.resourceType,
        "Band": effectiveSeat.band,
        "Location": effectiveSeat.location,
        "Vendor": effectiveSeat.vendor,
        "Daily Rate": effectiveSeat.dailyRate,
        "Status": effectiveSeat.status,
        "Allocation": effectiveSeat.allocation,
        "Start Date": formatExportDate(effectiveSeat.startDate),
        "End Date": formatExportDate(effectiveSeat.endDate),
        "Spend Plan ID": effectiveSeat.spendPlanId,
        "RITM": effectiveSeat.ritm,
        "SOW": effectiveSeat.sow,
        "Notes": effectiveSeat.notes,
        "Total Spent DKK": metrics.totalSpent,
        "Total Forecast DKK": metrics.totalForecast,
        "Yearly Cost Internal DKK": metrics.yearlyCostInternal,
        "Yearly Cost External DKK": metrics.yearlyCostExternal,
        "Has Forecast Adjustments": seat.months.some(
          (month) =>
            month.forecastOverrideAmount !== null || month.forecastIncluded === false
        )
          ? "TRUE"
          : "FALSE",
        "Roster Seat ID": rosterPerson?.seatId ?? seat.seatId,
        "Roster Import File": rosterPerson?.import.fileName,
        "Roster Domain": rosterPerson?.domain,
        "Roster Product Line": rosterPerson?.productLine,
        "Roster Team": rosterPerson?.teamName,
        "Roster Name": rosterPerson?.resourceName,
        "Roster Email": rosterPerson?.email,
        "Roster Role Category": rosterPerson?.roleCategory,
        "Roster Specific Role": rosterPerson?.specificRole,
        "Roster Title": rosterPerson?.title,
        "Roster Status": rosterPerson?.status,
        "Roster Allocation": rosterPerson?.allocation,
        "Roster Resource Type": rosterPerson?.resourceType,
        "Roster Vendor": rosterPerson?.vendor,
        "Roster Daily Rate": rosterPerson?.dailyRate,
        "Roster Manager": rosterPerson?.lineManager,
        "Roster Location": rosterPerson?.location,
        "Roster Expected Funding": rosterPerson?.expectedFunding,
        "Roster Expected Funding 2025": rosterPerson?.expectedFunding2025,
        "Roster Funding Type": rosterPerson?.fundingType,
        "Roster Hourly Rate": rosterPerson?.hourlyRate,
        "Roster Start Date": formatExportDate(rosterPerson?.expectedStartDate),
        "Roster End Date": formatExportDate(rosterPerson?.expectedEndDate),
        "Roster Import Error": rosterPerson?.importError,
      }

      for (let monthIndex = 0; monthIndex < MONTH_NAMES.length; monthIndex += 1) {
        const label = MONTH_NAMES[monthIndex]
        const month = monthsByIndex.get(monthIndex)
        const converted =
          month?.actualAmountRaw !== null && month?.actualAmountRaw !== undefined
            ? convertAmountToDkk(
                month.actualAmountRaw,
                month.actualCurrency,
                exchangeRateLookup
              )
            : {
                amountDkk: month?.actualAmount ?? 0,
                exchangeRateUsed: month?.exchangeRateUsed ?? null,
              }

        row[`${label} Forecast`] = metrics.monthlyForecast[monthIndex] ?? 0
        row[`${label} Actual DKK`] = cancelled ? 0 : (converted.amountDkk ?? 0)
        row[`${label} Actual Raw`] = cancelled ? null : (month?.actualAmountRaw ?? null)
        row[`${label} Actual Currency`] = month?.actualCurrency ?? null
        row[`${label} Actual FX Rate`] = cancelled
          ? null
          : (converted.exchangeRateUsed ?? null)
        row[`${label} Forecast Included`] =
          month?.forecastIncluded === false ? "FALSE" : "TRUE"
        row[`${label} Forecast Override`] = month?.forecastOverrideAmount ?? null
        row[`${label} Used Forecast`] = month?.usedForecastAmount ?? null
        row[`${label} Month Notes`] = month?.notes ?? null
      }

      return row
    })
}

function buildTrackerDetailFromSnapshot(
  year: number,
  budgetAreaId: string,
  snapshot: TrackerYearSnapshot,
  viewer?: Pick<AppViewer, "role" | "scopes">
) {
  const selectedSummary = parseSummaryKey(budgetAreaId)
  const { seats, assumptions, exchangeRates } = snapshot
  const assumptionLookup = buildCostAssumptionLookup(assumptions)
  const exchangeRateLookup = buildExchangeRateLookup(exchangeRates)

  return filterScopedItems(
    (seats as SeatWithRelations[])
    .map((seat) => {
      const effectiveSeat = getEffectiveSeat(seat)
      return { seat, effectiveSeat }
    })
    .filter(({ effectiveSeat }) => {
      return normalizeValue(effectiveSeat.subDomain) ===
          normalizeValue(selectedSummary.subDomain) &&
        normalizeValue(effectiveSeat.projectCode) ===
          normalizeValue(selectedSummary.projectCode)
    })
    .map(({ seat, effectiveSeat }) => {
      const metrics = deriveSeatMetrics(
        seat,
        assumptionLookup,
        exchangeRates,
        year
      )
      const cancelled = isTrackerCancelledSeat(effectiveSeat)
      const months: SeatMonthView[] = seat.months.map((month) => {
        const converted =
          month.actualAmountRaw !== null && month.actualAmountRaw !== undefined
            ? convertAmountToDkk(
                month.actualAmountRaw,
                month.actualCurrency,
                exchangeRateLookup
              )
            : {
                amountDkk: month.actualAmount,
                exchangeRateUsed: month.exchangeRateUsed,
              }

        return {
          monthIndex: month.monthIndex,
          actualAmountDkk: cancelled ? 0 : (converted.amountDkk ?? 0),
          actualAmountRaw: cancelled ? null : month.actualAmountRaw,
          actualCurrency: month.actualCurrency,
          exchangeRateUsed: converted.exchangeRateUsed ?? null,
          forecastOverrideAmount: month.forecastOverrideAmount ?? null,
          forecastIncluded: month.forecastIncluded,
          usedForecastAmount: month.usedForecastAmount ?? null,
          comparisonForecastAmount:
            month.usedForecastAmount ?? (metrics.monthlyForecast[month.monthIndex] ?? 0),
          notes: month.notes,
        }
      })

      return {
        ...effectiveSeat,
        months,
        totalSpent: metrics.totalSpent,
        totalForecast: metrics.totalForecast,
        hasForecastAdjustments: months.some(
          (month) =>
            month.forecastOverrideAmount !== null ||
            month.forecastIncluded === false
        ),
        yearlyCostInternal: metrics.yearlyCostInternal,
        yearlyCostExternal: metrics.yearlyCostExternal,
        permFte: metrics.permFte,
        extFte: metrics.extFte,
        quarterlyForecast: metrics.quarterlyForecast,
        monthlyForecast: metrics.monthlyForecast,
      }
    }),
    viewer,
    (seat) => ({ domain: seat.domain, subDomain: seat.subDomain })
  )
}

export async function rollbackRosterImport(
  input: {
    importId: string
  },
  actor?: AuditActor
) {
  const batch = await prisma.rosterImport.findUniqueOrThrow({
    where: { id: input.importId },
  })

  const latestBatch = await prisma.rosterImport.findFirst({
    where: {
      trackingYearId: batch.trackingYearId,
      status: "APPROVED",
    },
    orderBy: [{ importedAt: "desc" }],
  })

  if (!latestBatch || latestBatch.id !== batch.id) {
    throw new Error("Only the latest roster import can be rolled back.")
  }

  await prisma.rosterImport.delete({
    where: { id: batch.id },
  })

  const trackingYear = await prisma.trackingYear.findUniqueOrThrow({
    where: { id: batch.trackingYearId },
    select: { year: true },
  })

  await deriveTrackerSeatsForYear(trackingYear.year)

  await writeAuditLog({
    trackingYearId: batch.trackingYearId,
    entityType: "RosterImport",
    entityId: batch.id,
    action: "ROLLBACK",
    actor,
    changes: [
      {
        field: "rosterImport",
        oldValue: JSON.stringify({
          fileName: batch.fileName,
          importedByName: batch.importedByName,
          importedByEmail: batch.importedByEmail,
          importedAt: batch.importedAt,
          rowCount: batch.rowCount,
        }),
        newValue: null,
      },
    ],
  })

  return {
    id: batch.id,
    fileName: batch.fileName,
  }
}

export async function upsertCostAssumption(input: {
  year: number
  band: string
  location: string
  yearlyCost: number
}, actor?: AuditActor) {
  const trackingYear = await getOrCreateTrackingYear(input.year)
  const band = normalizeCostBandLabel(input.band)
  const before = await prisma.costAssumption.findUnique({
    where: {
      trackingYearId_band_location: {
        trackingYearId: trackingYear.id,
        band,
        location: input.location,
      },
    },
  })

  const assumption = await prisma.costAssumption.upsert({
    where: {
      trackingYearId_band_location: {
        trackingYearId: trackingYear.id,
        band,
        location: input.location,
      },
    },
    update: {
      yearlyCost: input.yearlyCost,
    },
    create: {
      trackingYearId: trackingYear.id,
      band,
      location: input.location,
      yearlyCost: input.yearlyCost,
    },
  })

  await writeAuditLog({
    trackingYearId: trackingYear.id,
    entityType: "CostAssumption",
    entityId: assumption.id,
    action: before ? "UPDATE" : "CREATE",
    actor,
    changes: buildAuditChanges(before, assumption, [
      "band",
      "location",
      "yearlyCost",
    ]),
  })

  return assumption
}

export async function deleteCostAssumption(input: {
  year: number
  band: string
  location: string
}, actor?: AuditActor) {
  const trackingYear = await getOrCreateTrackingYear(input.year)
  const band = normalizeCostBandLabel(input.band)
  const location = input.location.trim()

  const seats = await prisma.trackerSeat.findMany({
    where: {
      trackingYearId: trackingYear.id,
      isActive: true,
      location,
    },
    include: {
      months: true,
      override: true,
      budgetArea: true,
    },
  })

  const matchingSeat = seats.find((seat) => {
    const effectiveSeat = getEffectiveSeat(seat as SeatWithRelations)
    return (
      !isExternalSeat(effectiveSeat) &&
      normalizeCostBandLabel(effectiveSeat.band) === band &&
      normalizeValue(effectiveSeat.location) === normalizeValue(location)
    )
  })

  if (matchingSeat) {
    throw new Error(
      `Cannot delete ${location} band ${band} because it is used by active tracker seat ${matchingSeat.seatId}.`
    )
  }

  const before = await prisma.costAssumption.findUniqueOrThrow({
    where: {
      trackingYearId_band_location: {
        trackingYearId: trackingYear.id,
        band,
        location,
      },
    },
  })

  const deleted = await prisma.costAssumption.delete({
    where: {
      trackingYearId_band_location: {
        trackingYearId: trackingYear.id,
        band,
        location,
      },
    },
  })

  await writeAuditLog({
    trackingYearId: trackingYear.id,
    entityType: "CostAssumption",
    entityId: deleted.id,
    action: "DELETE",
    actor,
    changes: buildAuditChanges(before, null, [
      "band",
      "location",
      "yearlyCost",
    ]),
  })

  return deleted
}

export async function upsertServiceMessage(input: {
  year: number
  key: ServiceMessageKey
  content?: string | null
}, actor?: AuditActor) {
  const trackingYear = await getOrCreateTrackingYear(input.year)
  const content = input.content?.trim() ?? ""
  const before = await prisma.serviceMessage.findUnique({
    where: {
      trackingYearId_key: {
        trackingYearId: trackingYear.id,
        key: input.key,
      },
    },
  })

  if (!content) {
    if (before) {
      await prisma.serviceMessage.delete({
        where: {
          trackingYearId_key: {
            trackingYearId: trackingYear.id,
            key: input.key,
          },
        },
      })

      await writeAuditLog({
        trackingYearId: trackingYear.id,
        entityType: "ServiceMessage",
        entityId: before.id,
        action: "DELETE",
        actor,
        changes: buildAuditChanges(before, null, ["key", "content"]),
      })
    }

    return null
  }

  const message = await prisma.serviceMessage.upsert({
    where: {
      trackingYearId_key: {
        trackingYearId: trackingYear.id,
        key: input.key,
      },
    },
    update: {
      content,
    },
    create: {
      trackingYearId: trackingYear.id,
      key: input.key,
      content,
    },
  })

  await writeAuditLog({
    trackingYearId: trackingYear.id,
    entityType: "ServiceMessage",
    entityId: message.id,
    action: before ? "UPDATE" : "CREATE",
    actor,
    changes: buildAuditChanges(before, message, ["key", "content"]),
  })

  return message
}

export async function getLatestExchangeRates(year: number): Promise<LatestExchangeRate[]> {
  const trackingYear = await getOrCreateTrackingYear(year)
  const rates = await prisma.exchangeRate.findMany({
    where: { trackingYearId: trackingYear.id },
    orderBy: [{ currency: "asc" }, { effectiveDate: "desc" }],
  })

  const latestByCurrency = new Map<string, ExchangeRate>()
  for (const rate of rates) {
    if (!latestByCurrency.has(rate.currency)) {
      latestByCurrency.set(rate.currency, rate)
    }
  }

  return Array.from(latestByCurrency.values()).map((rate) => ({
    currency: rate.currency,
    rateToDkk: rate.rateToDkk,
    effectiveDate: rate.effectiveDate,
    notes: rate.notes,
  }))
}

export async function getExchangeRateHistory(year: number): Promise<LatestExchangeRate[]> {
  const trackingYear = await getOrCreateTrackingYear(year)
  const rates = await prisma.exchangeRate.findMany({
    where: { trackingYearId: trackingYear.id },
    orderBy: [{ currency: "asc" }, { effectiveDate: "desc" }],
  })

  return rates.map((rate) => ({
    currency: rate.currency,
    rateToDkk: rate.rateToDkk,
    effectiveDate: rate.effectiveDate,
    notes: rate.notes,
  }))
}

async function syncDepartmentMappingTeamsFromCurrentData(year: number) {
  const trackingYear = await getOrCreateTrackingYear(year)
  const [mappings, trackerSeats, people] = await Promise.all([
    prisma.departmentMapping.findMany({
      where: {
        trackingYearId: trackingYear.id,
        codeType: "DEPARTMENT_CODE",
      },
      orderBy: [{ sourceCode: "asc" }],
    }),
    prisma.trackerSeat.findMany({
      where: {
        trackingYearId: trackingYear.id,
        isActive: true,
      },
      include: {
        override: true,
        budgetArea: true,
      },
    }),
    prisma.rosterPerson.findMany({
      where: {
        trackingYearId: trackingYear.id,
        import: {
          status: "APPROVED",
        },
      },
      include: {
        import: true,
      },
      orderBy: [{ import: { importedAt: "desc" } }, { createdAt: "desc" }],
    }),
  ])

  if (mappings.length === 0) {
    return
  }

  const latestPeople = Array.from(
    people
      .reduce<Map<string, (typeof people)[number]>>((latestBySeat, person) => {
        if (!latestBySeat.has(person.seatId)) {
          latestBySeat.set(person.seatId, person)
        }

        return latestBySeat
      }, new Map())
      .values()
  )
  const mappingLookup = buildDepartmentMappingLookup(mappings)
  const trackerSeatBySeatId = new Map(trackerSeats.map((seat) => [seat.seatId, seat]))
  const teamsByMappingId = new Map<string, string[]>()

  const addTeam = (mappingId: string | undefined, team: string | null | undefined) => {
    const normalizedTeam = normalizeOptionalString(team)
    if (!mappingId || !normalizedTeam) {
      return
    }

    const current = teamsByMappingId.get(mappingId) ?? []
    current.push(normalizedTeam)
    teamsByMappingId.set(mappingId, current)
  }

  for (const person of latestPeople) {
    const trackerSeat = trackerSeatBySeatId.get(person.seatId)
    const effectiveSeat = trackerSeat ? getEffectiveSeat(trackerSeat as SeatWithRelations) : null
    const mapping = resolveDepartmentMapping(mappingLookup, {
      sourceCode: person.domain,
      subDomain: effectiveSeat?.subDomain || person.productLine,
      projectCode: effectiveSeat?.projectCode,
    })

    addTeam(mapping?.id, effectiveSeat?.team || person.teamName)
  }

  for (const trackerSeat of trackerSeats) {
    const effectiveSeat = getEffectiveSeat(trackerSeat as SeatWithRelations)
    const mapping = resolveDepartmentMapping(mappingLookup, {
      sourceCode: effectiveSeat.costCenter,
      subDomain: effectiveSeat.subDomain,
      projectCode: effectiveSeat.projectCode,
    })

    addTeam(mapping?.id, effectiveSeat.team)
  }

  const updates = mappings.flatMap((mapping) => {
    const nextTeams = normalizeDepartmentMappingTeams([
      ...mapping.teams,
      ...(teamsByMappingId.get(mapping.id) ?? []),
    ])

    return nextTeams.join("|") === mapping.teams.join("|")
      ? []
      : [
          prisma.departmentMapping.update({
            where: { id: mapping.id },
            data: {
              teams: nextTeams,
            },
          }),
        ]
  })

  if (updates.length > 0) {
    await prisma.$transaction(updates)
  }
}

export async function getDepartmentMappings(
  year: number
): Promise<DepartmentMappingView[]> {
  await syncDepartmentMappingTeamsFromCurrentData(year)
  const trackingYear = await getOrCreateTrackingYear(year)
  const mappings = await prisma.departmentMapping.findMany({
    where: {
      trackingYearId: trackingYear.id,
      codeType: "DEPARTMENT_CODE",
    },
    orderBy: [{ sourceCode: "asc" }],
  })

  return mappings.map((mapping) => ({
    id: mapping.id,
    sourceCode: mapping.sourceCode,
    domain: mapping.domain,
    subDomain: mapping.subDomain,
    projectCode: mapping.projectCode,
    teams: mapping.teams,
    notes: mapping.notes,
  }))
}

export async function getAccrualAccountMappings(
  year: number
): Promise<AccrualAccountMappingView[]> {
  const trackingYear = await getOrCreateTrackingYear(year)
  const delegate = getAccrualAccountMappingDelegate()
  if (!delegate) {
    return []
  }

  const mappings = await delegate.findMany({
    where: {
      trackingYearId: trackingYear.id,
    },
    orderBy: [{ resourceType: "asc" }],
  })

  return mappings.map((mapping) => ({
    id: mapping.id,
    resourceType: mapping.resourceType,
    accountCode: mapping.accountCode,
    notes: mapping.notes,
  }))
}

async function syncSeatReferenceValuesFromCurrentData(year: number) {
  const trackingYear = await getOrCreateTrackingYear(year)
  const [seats, people] = await Promise.all([
    prisma.trackerSeat.findMany({
      where: {
        trackingYearId: trackingYear.id,
        isActive: true,
      },
      select: {
        description: true,
        band: true,
        resourceType: true,
        vendor: true,
        location: true,
        manager: true,
      },
    }),
    prisma.rosterPerson.findMany({
      where: {
        trackingYearId: trackingYear.id,
        import: {
          status: "APPROVED",
        },
      },
      include: {
        import: true,
      },
      orderBy: [{ import: { importedAt: "desc" } }, { createdAt: "desc" }],
    }),
  ])

  const latestPeople = Array.from(
    people
      .reduce<Map<string, (typeof people)[number]>>((latestBySeat, person) => {
        if (!latestBySeat.has(person.seatId)) {
          latestBySeat.set(person.seatId, person)
        }

        return latestBySeat
      }, new Map())
      .values()
  )
  const valuesByType: Record<SeatReferenceValueType, string[]> = {
    VENDOR: collectSortedValues([
      ...seats.map((seat) => seat.vendor),
      ...latestPeople.map((person) => person.vendor),
    ]),
    LOCATION: collectSortedValues([
      ...seats.map((seat) => seat.location),
      ...latestPeople.map((person) => person.location),
    ]),
    MANAGER: collectSortedValues([
      ...seats.map((seat) => seat.manager),
      ...latestPeople.map((person) => person.lineManager),
    ]),
    ROLE: collectSortedValues([
      ...seats.map((seat) => seat.description),
      ...latestPeople.map((person) => person.title),
    ]),
    BAND: collectSortedValues([
      ...seats.map((seat) => seat.band),
      ...latestPeople.map((person) => person.band),
    ]),
    RESOURCE_TYPE: collectSortedValues([
      ...seats.map((seat) => seat.resourceType),
      ...latestPeople.map((person) => person.resourceType),
    ]),
  }

  for (const [type, values] of Object.entries(valuesByType) as Array<
    [SeatReferenceValueType, string[]]
  >) {
    if (values.length === 0) {
      continue
    }

    await prisma.seatReferenceValue.createMany({
      data: values.map((value) => ({
        trackingYearId: trackingYear.id,
        type,
        value,
      })),
      skipDuplicates: true,
    })
  }
}

export async function getSeatReferenceValues(
  year: number
): Promise<SeatReferenceValueView[]> {
  await syncSeatReferenceValuesFromCurrentData(year)

  const trackingYear = await getOrCreateTrackingYear(year)
  const values = await prisma.seatReferenceValue.findMany({
    where: {
      trackingYearId: trackingYear.id,
    },
    orderBy: [{ type: "asc" }, { value: "asc" }],
  })

  return values.map((value) => ({
    id: value.id,
    type: value.type,
    value: value.value,
  }))
}

async function persistSeatReferenceSelections(input: {
  trackingYearId: string
  vendor?: string | null
  location?: string | null
  manager?: string | null
  role?: string | null
  band?: string | null
  resourceType?: string | null
}) {
  const referenceValues = [
    {
      type: "VENDOR" as const,
      value: normalizeSeatReferenceValue(input.vendor),
    },
    {
      type: "LOCATION" as const,
      value: normalizeSeatReferenceValue(input.location),
    },
    {
      type: "MANAGER" as const,
      value: normalizeSeatReferenceValue(input.manager),
    },
    {
      type: "ROLE" as const,
      value: normalizeSeatReferenceValue(input.role),
    },
    {
      type: "BAND" as const,
      value: normalizeSeatReferenceValue(input.band),
    },
    {
      type: "RESOURCE_TYPE" as const,
      value: normalizeSeatReferenceValue(input.resourceType),
    },
  ].filter((entry): entry is { type: SeatReferenceValueType; value: string } => Boolean(entry.value))

  if (referenceValues.length === 0) {
    return
  }

  await prisma.seatReferenceValue.createMany({
    data: referenceValues.map((entry) => ({
      trackingYearId: input.trackingYearId,
      type: entry.type,
      value: entry.value,
    })),
    skipDuplicates: true,
  })
}

export async function upsertSeatReferenceValue(input: {
  id?: string
  year: number
  type: SeatReferenceValueType
  value: string
}, actor?: AuditActor) {
  ensureValidYear(input.year)
  const trackingYear = await getOrCreateTrackingYear(input.year)
  const value = normalizeSeatReferenceValue(input.value)
  if (!value) {
    throw new Error("Value is required.")
  }

  const before = input.id
    ? await prisma.seatReferenceValue.findFirst({
        where: {
          id: input.id,
          trackingYearId: trackingYear.id,
        },
      })
    : null

  const referenceValue = input.id
    ? await prisma.seatReferenceValue.update({
        where: { id: input.id },
        data: {
          type: input.type,
          value,
        },
      })
    : await prisma.seatReferenceValue.upsert({
        where: {
          trackingYearId_type_value: {
            trackingYearId: trackingYear.id,
            type: input.type,
            value,
          },
        },
        update: {},
        create: {
          trackingYearId: trackingYear.id,
          type: input.type,
          value,
        },
      })

  await writeAuditLog({
    trackingYearId: trackingYear.id,
    entityType: "SeatReferenceValue",
    entityId: referenceValue.id,
    action: before ? "UPDATE" : "CREATE",
    actor,
    changes: buildAuditChanges(before, referenceValue, ["type", "value"]),
  })

  return referenceValue
}

export async function deleteSeatReferenceValue(input: {
  year: number
  id: string
}, actor?: AuditActor) {
  ensureValidYear(input.year)
  const trackingYear = await getOrCreateTrackingYear(input.year)
  const before = await prisma.seatReferenceValue.findFirstOrThrow({
    where: {
      id: input.id,
      trackingYearId: trackingYear.id,
    },
  })

  await prisma.seatReferenceValue.delete({
    where: { id: input.id },
  })

  await writeAuditLog({
    trackingYearId: trackingYear.id,
    entityType: "SeatReferenceValue",
    entityId: before.id,
    action: "DELETE",
    actor,
    changes: buildAuditChanges(before, null, ["type", "value"]),
  })

  return before
}

export async function getSeatReferenceValueExportRows(
  year: number,
  type: SeatReferenceValueType
) {
  const values = await getSeatReferenceValues(year)
  return values
    .filter((value) => value.type === type)
    .map((value) => ({
      Type: value.type,
      Value: value.value,
    }))
}

export async function getActiveRosterResourceTypes(year: number) {
  const trackingYear = await getOrCreateTrackingYear(year)
  const people = await prisma.rosterPerson.findMany({
    where: {
      trackingYearId: trackingYear.id,
      import: {
        status: "APPROVED",
      },
    },
    include: {
      import: true,
    },
    orderBy: [{ import: { importedAt: "desc" } }, { createdAt: "desc" }],
  })

  const latestPeople = Array.from(
    people
      .reduce<Map<string, (typeof people)[number]>>((latestBySeat, person) => {
        if (!latestBySeat.has(person.seatId)) {
          latestBySeat.set(person.seatId, person)
        }

        return latestBySeat
      }, new Map())
      .values()
  )

  return collectSortedValues(latestPeople.map((person) => person.resourceType))
}

export async function upsertExchangeRate(input: {
  year: number
  currency: CurrencyCode
  rateToDkk: number
  effectiveDate: Date
  notes?: string
}, actor?: AuditActor) {
  const trackingYear = await getOrCreateTrackingYear(input.year)
  const before = await prisma.exchangeRate.findUnique({
    where: {
      trackingYearId_currency_effectiveDate: {
        trackingYearId: trackingYear.id,
        currency: input.currency,
        effectiveDate: input.effectiveDate,
      },
    },
  })

  const exchangeRate = await prisma.exchangeRate.upsert({
    where: {
      trackingYearId_currency_effectiveDate: {
        trackingYearId: trackingYear.id,
        currency: input.currency,
        effectiveDate: input.effectiveDate,
      },
    },
    update: {
      rateToDkk: input.rateToDkk,
      notes: input.notes || null,
    },
    create: {
      trackingYearId: trackingYear.id,
      currency: input.currency,
      rateToDkk: input.rateToDkk,
      effectiveDate: input.effectiveDate,
      notes: input.notes || null,
    },
  })

  await writeAuditLog({
    trackingYearId: trackingYear.id,
    entityType: "ExchangeRate",
    entityId: exchangeRate.id,
    action: before ? "UPDATE" : "CREATE",
    actor,
    changes: buildAuditChanges(before, exchangeRate, [
      "currency",
      "rateToDkk",
      "effectiveDate",
      "notes",
    ]),
  })

  return exchangeRate
}

export async function upsertBudgetArea(input: {
  year: number
  domain?: string
  subDomain?: string
  funding?: string
  pillar?: string
  costCenter: string
  projectCode: string
  displayName?: string
  notes?: string
}, actor?: AuditActor) {
  const trackingYear = await getOrCreateTrackingYear(input.year)
  const before = await prisma.budgetArea.findUnique({
    where: {
      trackingYearId_costCenter_projectCode: {
        trackingYearId: trackingYear.id,
        costCenter: input.costCenter,
        projectCode: input.projectCode,
      },
    },
  })

  const budgetArea = await prisma.budgetArea.upsert({
    where: {
      trackingYearId_costCenter_projectCode: {
        trackingYearId: trackingYear.id,
        costCenter: input.costCenter,
        projectCode: input.projectCode,
      },
    },
    update: {
      domain: normalizeDomainLabel(input.domain) || null,
      subDomain: input.subDomain || null,
      funding: input.funding || null,
      pillar: input.pillar || null,
      displayName: input.displayName || null,
      notes: input.notes || null,
    },
    create: {
      trackingYearId: trackingYear.id,
      domain: normalizeDomainLabel(input.domain) || null,
      subDomain: input.subDomain || null,
      funding: input.funding || null,
      pillar: input.pillar || null,
      costCenter: input.costCenter,
      projectCode: input.projectCode,
      displayName: input.displayName || null,
      notes: input.notes || null,
    },
  })

  await writeAuditLog({
    trackingYearId: trackingYear.id,
    entityType: "BudgetArea",
    entityId: budgetArea.id,
    action: before ? "UPDATE" : "CREATE",
    actor,
    changes: buildAuditChanges(before, budgetArea, [
      "domain",
      "subDomain",
      "funding",
      "pillar",
      "costCenter",
      "projectCode",
      "displayName",
      "notes",
    ]),
  })

  return budgetArea
}

export async function upsertDepartmentMapping(input: {
  id?: string
  year: number
  sourceCode: string
  domain: string
  subDomain: string
  projectCode: string
  teams?: string[]
  notes?: string
}, actor?: AuditActor) {
  const trackingYear = await getOrCreateTrackingYear(input.year)
  const before = input.id
    ? await prisma.departmentMapping.findFirst({
        where: {
          id: input.id,
          trackingYearId: trackingYear.id,
          codeType: "DEPARTMENT_CODE",
        },
      })
    : await prisma.departmentMapping.findFirst({
        where: {
          trackingYearId: trackingYear.id,
          codeType: "DEPARTMENT_CODE",
          sourceCode: input.sourceCode,
          subDomain: input.subDomain,
          projectCode: input.projectCode,
        },
      })

  const payload = {
    domain: normalizeDomainLabel(input.domain) || input.domain,
    subDomain: input.subDomain,
    projectCode: input.projectCode,
    teams: normalizeDepartmentMappingTeams(input.teams ?? []),
    notes: input.notes || null,
  }

  const mapping = before
    ? await prisma.departmentMapping.update({
        where: { id: before.id },
        data: {
          sourceCode: input.sourceCode,
          ...payload,
        },
      })
    : await prisma.departmentMapping.create({
        data: {
          trackingYearId: trackingYear.id,
          codeType: "DEPARTMENT_CODE",
          sourceCode: input.sourceCode,
          ...payload,
        },
      })

  await prisma.budgetArea.updateMany({
    where: {
      trackingYearId: trackingYear.id,
      costCenter: input.sourceCode,
    },
    data: {
      domain: normalizeDomainLabel(input.domain) || input.domain,
      subDomain: input.subDomain,
    },
  })

  await deriveTrackerSeatsForYear(input.year)

  const relatedBudgetAreas = await prisma.trackerSeat.findMany({
    where: {
      trackingYearId: trackingYear.id,
      budgetAreaId: { not: null },
      OR: [
        {
          rosterPerson: {
            domain: input.sourceCode,
          },
        },
        {
          costCenter: input.sourceCode,
        },
      ],
    },
    select: {
      budgetAreaId: true,
    },
    distinct: ["budgetAreaId"],
  })

  const budgetAreaIds = relatedBudgetAreas
    .map((seat) => seat.budgetAreaId)
    .filter((value): value is string => Boolean(value))

  if (budgetAreaIds.length > 0) {
    await prisma.budgetArea.updateMany({
      where: {
        trackingYearId: trackingYear.id,
        id: { in: budgetAreaIds },
      },
      data: {
        domain: normalizeDomainLabel(input.domain) || input.domain,
        subDomain: input.subDomain,
      },
    })
  }

  await writeAuditLog({
    trackingYearId: trackingYear.id,
    entityType: "DepartmentMapping",
    entityId: mapping.id,
    action: before ? "UPDATE" : "CREATE",
    actor,
    changes: buildAuditChanges(before, mapping, [
      "sourceCode",
      "domain",
      "subDomain",
      "projectCode",
      "teams",
      "notes",
    ]),
  })

  return mapping
}

export async function upsertAccrualAccountMapping(input: {
  id?: string
  year: number
  resourceType: string
  accountCode: string
  notes?: string
}, actor?: AuditActor) {
  const trackingYear = await getOrCreateTrackingYear(input.year)
  const delegate = getAccrualAccountMappingDelegate()
  if (!delegate) {
    throw new Error(
      "Accrual account mappings are unavailable until the Prisma client and database schema are updated."
    )
  }

  const resourceType = input.resourceType.trim()
  const accountCode = input.accountCode.trim()

  if (!resourceType) {
    throw new Error("Resource type is required.")
  }

  if (!accountCode) {
    throw new Error("Account code is required.")
  }

  const before = input.id
    ? await delegate.findFirst({
        where: {
          id: input.id,
          trackingYearId: trackingYear.id,
        },
      })
    : await delegate.findFirst({
        where: {
          trackingYearId: trackingYear.id,
          resourceType,
        },
      })

  const mapping = before
    ? await delegate.update({
        where: { id: before.id },
        data: {
          resourceType,
          accountCode,
          notes: input.notes?.trim() || null,
        },
      })
    : await delegate.create({
        data: {
          trackingYearId: trackingYear.id,
          resourceType,
          accountCode,
          notes: input.notes?.trim() || null,
        },
      })

  await writeAuditLog({
    trackingYearId: trackingYear.id,
    entityType: "AccrualAccountMapping",
    entityId: mapping.id,
    action: before ? "UPDATE" : "CREATE",
    actor,
    changes: buildAuditChanges(before, mapping, [
      "resourceType",
      "accountCode",
      "notes",
    ]),
  })

  return mapping
}

export async function deleteAccrualAccountMapping(input: {
  year: number
  id: string
}, actor?: AuditActor) {
  ensureValidYear(input.year)
  const trackingYear = await getOrCreateTrackingYear(input.year)
  const delegate = getAccrualAccountMappingDelegate()
  if (!delegate) {
    throw new Error(
      "Accrual account mappings are unavailable until the Prisma client and database schema are updated."
    )
  }

  const before = await delegate.findFirstOrThrow({
    where: {
      id: input.id,
      trackingYearId: trackingYear.id,
    },
  })

  await delegate.delete({
    where: { id: before.id },
  })

  await writeAuditLog({
    trackingYearId: trackingYear.id,
    entityType: "AccrualAccountMapping",
    entityId: before.id,
    action: "DELETE",
    actor,
    changes: buildAuditChanges(before, null, [
      "resourceType",
      "accountCode",
      "notes",
    ]),
  })

  return before
}

export async function deleteDepartmentMapping(input: {
  year: number
  id: string
}, actor?: AuditActor) {
  ensureValidYear(input.year)
  const trackingYear = await getOrCreateTrackingYear(input.year)
  const before = await prisma.departmentMapping.findFirstOrThrow({
    where: {
      id: input.id,
      trackingYearId: trackingYear.id,
      codeType: "DEPARTMENT_CODE",
    },
  })

  await prisma.$transaction(async (transaction) => {
    await transaction.departmentMapping.delete({
      where: { id: before.id },
    })

    await transaction.budgetArea.updateMany({
      where: {
        trackingYearId: trackingYear.id,
        costCenter: before.sourceCode,
      },
      data: {
        domain: null,
        subDomain: null,
      },
    })
  })

  await deriveTrackerSeatsForYear(input.year)
  await writeAuditLog({
    trackingYearId: trackingYear.id,
    entityType: "DepartmentMapping",
    entityId: before.id,
    action: "DELETE",
    actor,
    changes: buildAuditChanges(before, null, [
      "sourceCode",
      "domain",
      "subDomain",
      "notes",
    ]),
  })

  return before
}

export async function upsertStaffingTarget(input: {
  id?: string
  year: number
  scopeLevel: StaffingTargetScopeLevel
  domain: string
  subDomain?: string | null
  projectCode?: string | null
  permTarget: number
}, actor?: AuditActor) {
  ensureValidYear(input.year)
  const trackingYear = await getOrCreateTrackingYear(input.year)
  const normalized = validateStaffingTargetInput({
    scopeLevel: input.scopeLevel,
    domain: input.domain,
    subDomain: input.subDomain,
    projectCode: input.projectCode,
    permTarget: input.permTarget,
  })

  const before = input.id
    ? await prisma.staffingTarget.findFirst({
        where: {
          id: input.id,
          trackingYearId: trackingYear.id,
        },
      })
    : await prisma.staffingTarget.findFirst({
        where: {
          trackingYearId: trackingYear.id,
          scopeLevel: normalized.scopeLevel,
          domain: normalized.domain,
          subDomain: normalized.subDomain,
          projectCode: normalized.projectCode,
        },
      })

  const target = before
    ? await prisma.staffingTarget.update({
        where: { id: before.id },
        data: normalized,
      })
    : await prisma.staffingTarget.create({
        data: {
          trackingYearId: trackingYear.id,
          ...normalized,
        },
      })

  await writeAuditLog({
    trackingYearId: trackingYear.id,
    entityType: "StaffingTarget",
    entityId: target.id,
    action: before ? "UPDATE" : "CREATE",
    actor,
    changes: buildAuditChanges(before, target, [
      "scopeLevel",
      "domain",
      "subDomain",
      "projectCode",
      "permTarget",
    ]),
  })

  return target
}

export async function deleteStaffingTarget(input: {
  year: number
  id: string
}, actor?: AuditActor) {
  ensureValidYear(input.year)
  const trackingYear = await getOrCreateTrackingYear(input.year)
  const before = await prisma.staffingTarget.findFirstOrThrow({
    where: {
      id: input.id,
      trackingYearId: trackingYear.id,
    },
  })

  await prisma.staffingTarget.delete({
    where: { id: before.id },
  })

  await writeAuditLog({
    trackingYearId: trackingYear.id,
    entityType: "StaffingTarget",
    entityId: before.id,
    action: "DELETE",
    actor,
    changes: buildAuditChanges(before, null, [
      "scopeLevel",
      "domain",
      "subDomain",
      "projectCode",
      "permTarget",
    ]),
  })

  return before
}

export type ResettableTrackingYearDataset =
  | "people-roster"
  | "forecasts"
  | "actuals"
  | "budget-movements"
  | "internal-costs"

export async function resetTrackingYearDataset(
  input: {
    year: number
    dataset: ResettableTrackingYearDataset
  },
  actor?: AuditActor
) {
  ensureValidYear(input.year)
  const trackingYear = await getOrCreateTrackingYear(input.year)

  if (input.dataset === "people-roster") {
    const [rosterImportCount, rosterSeatCount] = await Promise.all([
      prisma.rosterImport.count({
        where: { trackingYearId: trackingYear.id },
      }),
      prisma.trackerSeat.count({
        where: {
          trackingYearId: trackingYear.id,
          sourceType: "ROSTER",
        },
      }),
    ])

    await prisma.$transaction(async (transaction) => {
      await transaction.rosterImport.deleteMany({
        where: { trackingYearId: trackingYear.id },
      })
      await transaction.trackerSeat.deleteMany({
        where: {
          trackingYearId: trackingYear.id,
          sourceType: "ROSTER",
        },
      })
    })

    await writeAuditLog({
      trackingYearId: trackingYear.id,
      entityType: "TrackingYearReset",
      entityId: trackingYear.id,
      action: "RESET",
      actor,
      changes: [
        {
          field: "peopleRoster",
          oldValue: JSON.stringify({
            rosterImportCount,
            rosterSeatCount,
          }),
          newValue: JSON.stringify({ rosterImportCount: 0, rosterSeatCount: 0 }),
        },
      ],
    })

    return { dataset: input.dataset, deletedCount: rosterImportCount + rosterSeatCount }
  }

  if (input.dataset === "budget-movements") {
    const [batchCount, movementCount] = await Promise.all([
      prisma.budgetMovementBatch.count({
        where: { trackingYearId: trackingYear.id },
      }),
      prisma.budgetMovement.count({
        where: { trackingYearId: trackingYear.id },
      }),
    ])

    await prisma.budgetMovementBatch.deleteMany({
      where: { trackingYearId: trackingYear.id },
    })

    await writeAuditLog({
      trackingYearId: trackingYear.id,
      entityType: "TrackingYearReset",
      entityId: trackingYear.id,
      action: "RESET",
      actor,
      changes: [
        {
          field: "budgetMovements",
          oldValue: JSON.stringify({
            batchCount,
            movementCount,
          }),
          newValue: JSON.stringify({ batchCount: 0, movementCount: 0 }),
        },
      ],
    })

    return { dataset: input.dataset, deletedCount: batchCount + movementCount }
  }

  if (input.dataset === "internal-costs") {
    const costCount = await prisma.costAssumption.count({
      where: { trackingYearId: trackingYear.id },
    })

    await prisma.costAssumption.deleteMany({
      where: { trackingYearId: trackingYear.id },
    })

    await writeAuditLog({
      trackingYearId: trackingYear.id,
      entityType: "TrackingYearReset",
      entityId: trackingYear.id,
      action: "RESET",
      actor,
      changes: [
        {
          field: "internalCosts",
          oldValue: JSON.stringify({ costCount }),
          newValue: JSON.stringify({ costCount: 0 }),
        },
      ],
    })

    return { dataset: input.dataset, deletedCount: costCount }
  }

  const seatIds = (
    await prisma.trackerSeat.findMany({
      where: { trackingYearId: trackingYear.id },
      select: { id: true },
    })
  ).map((seat) => seat.id)

  if (input.dataset === "forecasts") {
    const updatedCount = await prisma.seatMonth.updateMany({
      where: {
        trackerSeatId: { in: seatIds },
        OR: [
          { forecastOverrideAmount: { not: null } },
          { forecastIncluded: false },
        ],
      },
      data: {
        forecastOverrideAmount: null,
        forecastIncluded: true,
      },
    })

    await writeAuditLog({
      trackingYearId: trackingYear.id,
      entityType: "TrackingYearReset",
      entityId: trackingYear.id,
      action: "RESET",
      actor,
      changes: [
        {
          field: "forecasts",
          oldValue: JSON.stringify({ updatedSeatMonths: updatedCount.count }),
          newValue: JSON.stringify({ updatedSeatMonths: 0 }),
        },
      ],
    })

    return { dataset: input.dataset, deletedCount: updatedCount.count }
  }

  if (input.dataset === "actuals") {
    const [importCount, entryCount, monthCount] = await Promise.all([
      prisma.externalActualImport.count({
        where: { trackingYearId: trackingYear.id },
      }),
      prisma.externalActualEntry.count({
        where: { trackingYearId: trackingYear.id },
      }),
      prisma.seatMonth.count({
        where: {
          trackerSeatId: { in: seatIds },
          OR: [
            { actualAmountRaw: { not: null } },
            { actualAmount: { not: 0 } },
            { exchangeRateUsed: { not: null } },
            { usedForecastAmount: { not: null } },
            { notes: { not: null } },
          ],
        },
      }),
    ])

    await prisma.$transaction(async (transaction) => {
      await transaction.externalActualImport.deleteMany({
        where: { trackingYearId: trackingYear.id },
      })
      await transaction.seatMonth.updateMany({
        where: {
          trackerSeatId: { in: seatIds },
          OR: [
            { actualAmountRaw: { not: null } },
            { actualAmount: { not: 0 } },
            { exchangeRateUsed: { not: null } },
            { usedForecastAmount: { not: null } },
            { notes: { not: null } },
          ],
        },
        data: {
          actualAmount: 0,
          actualAmountRaw: null,
          actualCurrency: "DKK",
          exchangeRateUsed: null,
          forecastIncluded: true,
          usedForecastAmount: null,
          notes: null,
        },
      })
    })

    await writeAuditLog({
      trackingYearId: trackingYear.id,
      entityType: "TrackingYearReset",
      entityId: trackingYear.id,
      action: "RESET",
      actor,
      changes: [
        {
          field: "actuals",
          oldValue: JSON.stringify({
            importCount,
            entryCount,
            updatedSeatMonths: monthCount,
          }),
          newValue: JSON.stringify({
            importCount: 0,
            entryCount: 0,
            updatedSeatMonths: 0,
          }),
        },
      ],
    })

    return { dataset: input.dataset, deletedCount: importCount + entryCount + monthCount }
  }

  throw new Error("Unsupported dataset.")
}

export async function deleteTrackerOverridesForYear(
  input: {
    year: number
  },
  actor?: AuditActor
) {
  const trackingYear = await getOrCreateTrackingYear(input.year)
  const overrides = await prisma.trackerOverride.findMany({
    where: {
      trackerSeat: {
        trackingYearId: trackingYear.id,
      },
    },
    select: {
      id: true,
      trackerSeatId: true,
    },
  })

  if (overrides.length === 0) {
    return { deletedCount: 0 }
  }

  await prisma.trackerOverride.deleteMany({
    where: {
      id: {
        in: overrides.map((override) => override.id),
      },
    },
  })

  await Promise.all(
    overrides.map((override) =>
      writeAuditLog({
        trackingYearId: trackingYear.id,
        entityType: "TrackerOverride",
        entityId: override.id,
        action: "DELETE",
        actor,
        changes: [
          {
            field: "trackerSeatId",
            oldValue: override.trackerSeatId,
            newValue: null,
          },
        ],
      })
    )
  )

  return { deletedCount: overrides.length }
}

type TrackerSeatProfilePayload = {
  domain?: string | null
  subDomain?: string | null
  budgetAreaId?: string | null
  funding?: string | null
  pillar?: string | null
  costCenter?: string | null
  projectCode?: string | null
  resourceType?: string | null
  team?: string | null
  inSeat?: string | null
  description?: string | null
  band?: string | null
  location?: string | null
  vendor?: string | null
  manager?: string | null
  dailyRate?: number | null
  ritm?: string | null
  sow?: string | null
  spendPlanId?: string | null
  status?: string | null
  allocation?: number | null
  startDate?: Date | null
  endDate?: Date | null
  notes?: string | null
}

function buildTrackerSeatProfileAuditShape(
  seat: TrackerSeatProfilePayload & { budgetAreaId?: string | null }
) {
  return {
    domain: seat.domain ?? null,
    subDomain: seat.subDomain ?? null,
    funding: seat.funding ?? null,
    pillar: seat.pillar ?? null,
    budgetAreaId: seat.budgetAreaId ?? null,
    costCenter: seat.costCenter ?? null,
    projectCode: seat.projectCode ?? null,
    resourceType: seat.resourceType ?? null,
    team: seat.team ?? null,
    inSeat: seat.inSeat ?? null,
    description: seat.description ?? null,
    band: seat.band ?? null,
    location: seat.location ?? null,
    vendor: seat.vendor ?? null,
    manager: seat.manager ?? null,
    dailyRate: seat.dailyRate ?? null,
    ritm: seat.ritm ?? null,
    sow: seat.sow ?? null,
    spendPlanId: seat.spendPlanId ?? null,
    status: seat.status ?? null,
    allocation: seat.allocation ?? null,
    startDate: seat.startDate ?? null,
    endDate: seat.endDate ?? null,
    notes: seat.notes ?? null,
  }
}

async function resolveBudgetAreaForSeatProfile(input: {
  trackingYearId: string
  budgetAreaId?: string | null
  domain?: string | null
  subDomain?: string | null
  projectCode?: string | null
  pillar?: string | null
}) {
  const budgetAreaId = normalizeOptionalString(input.budgetAreaId)
  if (budgetAreaId) {
    return prisma.budgetArea.findFirst({
      where: {
        id: budgetAreaId,
        trackingYearId: input.trackingYearId,
      },
    })
  }

  const domain = normalizeDomainLabel(input.domain)
  const subDomain = normalizeSubDomainLabel(input.subDomain)
  const projectCode = normalizeOptionalString(input.projectCode)

  if (!domain || !subDomain || !projectCode) {
    return null
  }

  const matchingAreas = await prisma.budgetArea.findMany({
    where: {
      trackingYearId: input.trackingYearId,
      domain: { equals: domain, mode: "insensitive" },
      subDomain: { equals: subDomain, mode: "insensitive" },
      projectCode: { equals: projectCode, mode: "insensitive" },
    },
    orderBy: [{ pillar: "asc" }, { costCenter: "asc" }],
  })

  if (matchingAreas.length === 0) {
    return null
  }

  const pillar = normalizeOptionalString(input.pillar)
  if (!pillar) {
    return matchingAreas[0]
  }

  return (
    matchingAreas.find(
      (area) => normalizeValue(area.pillar) === normalizeValue(pillar)
    ) ?? matchingAreas[0]
  )
}

function normalizeTrackerSeatProfilePayload(
  payload: TrackerSeatProfilePayload,
  budgetArea: BudgetArea | null
) {
  return {
    budgetAreaId: budgetArea?.id ?? normalizeOptionalString(payload.budgetAreaId),
    domain: normalizeDomainLabel(payload.domain) ?? budgetArea?.domain ?? null,
    subDomain: normalizeSubDomainLabel(payload.subDomain) ?? budgetArea?.subDomain ?? null,
    funding: normalizeOptionalString(payload.funding) ?? budgetArea?.funding ?? null,
    pillar: normalizeOptionalString(payload.pillar) ?? budgetArea?.pillar ?? null,
    costCenter: normalizeOptionalString(payload.costCenter) ?? budgetArea?.costCenter ?? null,
    projectCode: normalizeOptionalString(payload.projectCode) ?? budgetArea?.projectCode ?? null,
    resourceType: normalizeOptionalString(payload.resourceType),
    team: normalizeOptionalString(payload.team),
    inSeat: normalizeOptionalString(payload.inSeat),
    description: normalizeOptionalString(payload.description),
    band: normalizeOptionalString(payload.band),
    location: normalizeSeatReferenceValue(payload.location),
    vendor: normalizeSeatReferenceValue(payload.vendor),
    manager: normalizeSeatReferenceValue(payload.manager),
    dailyRate: normalizeOptionalNumber(payload.dailyRate),
    ritm: normalizeOptionalString(payload.ritm),
    sow: normalizeOptionalString(payload.sow),
    spendPlanId: normalizeOptionalString(payload.spendPlanId),
    status: normalizeOptionalString(payload.status),
    allocation: normalizeOptionalNumber(payload.allocation),
    startDate: payload.startDate ?? null,
    endDate: payload.endDate ?? null,
    notes: normalizeOptionalString(payload.notes),
  }
}

type TrackerSeatMonthUpdatePayload = {
  monthIndex?: number
  actualAmount?: number
  actualCurrency?: CurrencyCode
  forecastOverrideAmount?: number | null
  forecastIncluded?: boolean
  notes?: string
}

async function applyTrackerSeatMonthUpdate(input: {
  seat: SeatWithRelations
  payload: TrackerSeatMonthUpdatePayload
  actor?: AuditActor
  beforeMonth?: SeatWithRelations["months"][number] | null
  exchangeRateRows: ExchangeRate[]
  exchangeRateLookup?: ReturnType<typeof buildExchangeRateLookup>
  yearRecord?: { year: number } | null
  costAssumptionRows?: CostAssumption[]
}) {
  if (input.payload.monthIndex === undefined) {
    return null
  }

  const beforeMonth =
    input.beforeMonth ??
    (await prisma.seatMonth.findUnique({
      where: {
        trackerSeatId_monthIndex: {
          trackerSeatId: input.seat.id,
          monthIndex: input.payload.monthIndex,
        },
      },
    }))
  const requiresForecastSnapshot =
    input.payload.actualAmount === undefined &&
    !(input.payload.forecastIncluded ?? beforeMonth?.forecastIncluded ?? true) &&
    beforeMonth?.usedForecastAmount == null
  const exchangeRates =
    input.exchangeRateLookup ?? buildExchangeRateLookup(input.exchangeRateRows)
  const currency =
    input.payload.actualCurrency ?? beforeMonth?.actualCurrency ?? "DKK"
  const rawAmount =
    input.payload.actualAmount ??
    beforeMonth?.actualAmountRaw ??
    beforeMonth?.actualAmount ??
    0
  const isClearingActual = rawAmount <= 0
  const converted = isClearingActual
    ? {
        amountDkk: 0,
        exchangeRateUsed: null,
      }
    : convertAmountToDkk(rawAmount, currency, exchangeRates)
  const forecastIncluded =
    input.payload.actualAmount !== undefined && isClearingActual
      ? true
      : (input.payload.forecastIncluded ?? beforeMonth?.forecastIncluded ?? true)
  const notes =
    input.payload.notes === undefined ? beforeMonth?.notes ?? null : input.payload.notes
  const forecastOverrideAmount =
    input.payload.forecastOverrideAmount === undefined
      ? beforeMonth?.forecastOverrideAmount ?? null
      : input.payload.forecastOverrideAmount
  const usedForecastAmount =
    input.payload.actualAmount !== undefined && isClearingActual
      ? null
      : forecastIncluded
        ? null
        : (beforeMonth?.usedForecastAmount ??
          (requiresForecastSnapshot
            ? await computeSeatMonthForecastSnapshot({
                seat: input.seat,
                year: input.yearRecord!.year,
                monthIndex: input.payload.monthIndex,
                assumptions: input.costAssumptionRows ?? [],
                exchangeRates: input.exchangeRateRows,
              })
            : null))

  const month = await prisma.seatMonth.upsert({
    where: {
      trackerSeatId_monthIndex: {
        trackerSeatId: input.seat.id,
        monthIndex: input.payload.monthIndex,
      },
    },
    update: {
      actualAmount: converted.amountDkk,
      actualAmountRaw: isClearingActual ? null : rawAmount,
      actualCurrency: currency,
      exchangeRateUsed: converted.exchangeRateUsed,
      forecastOverrideAmount,
      forecastIncluded,
      usedForecastAmount,
      notes,
    },
    create: {
      trackerSeatId: input.seat.id,
      monthIndex: input.payload.monthIndex,
      actualAmount: converted.amountDkk,
      actualAmountRaw: isClearingActual ? null : rawAmount,
      actualCurrency: currency,
      exchangeRateUsed: converted.exchangeRateUsed,
      forecastOverrideAmount,
      forecastIncluded,
      usedForecastAmount,
      notes,
    },
  })

  await writeAuditLog({
    trackingYearId: input.seat.trackingYearId,
    entityType: "SeatMonth",
    entityId: month.id,
    action: beforeMonth ? "UPDATE" : "CREATE",
    actor: input.actor,
    changes: buildAuditChanges(beforeMonth, month, [
      "monthIndex",
      "actualAmount",
      "actualAmountRaw",
      "actualCurrency",
      "exchangeRateUsed",
      "forecastOverrideAmount",
      "forecastIncluded",
      "usedForecastAmount",
      "notes",
    ]),
  })

  return month
}

export async function updateTrackerSeat(
  seatId: string,
  payload: {
    monthIndex?: number
    actualAmount?: number
    actualCurrency?: CurrencyCode
    forecastOverrideAmount?: number | null
    forecastIncluded?: boolean
    notes?: string
    override?: {
      domain?: string | null
      subDomain?: string | null
      budgetAreaId?: string | null
      funding?: string | null
      pillar?: string | null
      costCenter?: string | null
      projectCode?: string | null
      resourceType?: string | null
      team?: string | null
      inSeat?: string | null
      description?: string | null
      band?: string | null
      location?: string | null
      vendor?: string | null
      manager?: string | null
      dailyRate?: number | null
      ritm?: string | null
      sow?: string | null
      spendPlanId?: string | null
      status?: string | null
      allocation?: number | null
      startDate?: Date | null
      endDate?: Date | null
      notes?: string | null
    }
  },
  actor?: AuditActor
) {
  const seat = await prisma.trackerSeat.findUniqueOrThrow({
    where: { id: seatId },
    include: {
      months: {
        orderBy: { monthIndex: "asc" },
      },
      override: true,
      budgetArea: true,
    },
  })

  if (payload.monthIndex !== undefined) {
    const beforeMonth =
      seat.months.find((month) => month.monthIndex === payload.monthIndex) ?? null
    const requiresForecastSnapshot =
      payload.actualAmount === undefined &&
      !(payload.forecastIncluded ?? beforeMonth?.forecastIncluded ?? true) &&
      beforeMonth?.usedForecastAmount == null
    const [yearRecord, exchangeRateRows, costAssumptionRows] = await Promise.all([
      requiresForecastSnapshot
        ? prisma.trackingYear.findUniqueOrThrow({
            where: { id: seat.trackingYearId },
            select: { year: true },
          })
        : Promise.resolve(null),
      prisma.exchangeRate.findMany({
        where: { trackingYearId: seat.trackingYearId },
        orderBy: { effectiveDate: "desc" },
      }),
      requiresForecastSnapshot
        ? prisma.costAssumption.findMany({
            where: { trackingYearId: seat.trackingYearId },
          })
        : Promise.resolve([]),
    ])

    await applyTrackerSeatMonthUpdate({
      seat: seat as SeatWithRelations,
      payload,
      actor,
      beforeMonth,
      exchangeRateRows,
      yearRecord,
      costAssumptionRows,
    })
  }

  if (payload.override) {
    const beforeOverride = await prisma.trackerOverride.findUnique({
      where: { trackerSeatId: seat.id },
    })
    const override = await prisma.trackerOverride.upsert({
      where: { trackerSeatId: seat.id },
      update: payload.override,
      create: {
        trackerSeatId: seat.id,
        ...payload.override,
      },
    })

    await writeAuditLog({
      trackingYearId: seat.trackingYearId,
      entityType: "TrackerOverride",
      entityId: override.id,
      action: beforeOverride ? "UPDATE" : "CREATE",
      actor,
      changes: buildAuditChanges(beforeOverride, override, [
        "domain",
        "subDomain",
        "funding",
        "pillar",
        "budgetAreaId",
        "costCenter",
        "projectCode",
        "resourceType",
        "team",
        "inSeat",
        "description",
        "band",
        "location",
        "vendor",
        "manager",
        "dailyRate",
        "ritm",
        "sow",
        "spendPlanId",
        "status",
        "allocation",
        "startDate",
        "endDate",
        "notes",
      ]),
    })
  }

  return prisma.trackerSeat.findUnique({
    where: { id: seat.id },
    include: {
      months: {
        orderBy: { monthIndex: "asc" },
      },
      override: true,
      budgetArea: true,
    },
  })
}

export async function updateTrackerSeatProfile(
  seatId: string,
  payload: TrackerSeatProfilePayload,
  actor?: AuditActor
) {
  const seat = await prisma.trackerSeat.findUniqueOrThrow({
    where: { id: seatId },
    include: {
      override: true,
    },
  })
  const budgetArea = await resolveBudgetAreaForSeatProfile({
    trackingYearId: seat.trackingYearId,
    budgetAreaId: payload.budgetAreaId,
    domain: payload.domain,
    subDomain: payload.subDomain,
    projectCode: payload.projectCode,
    pillar: payload.pillar,
  })
  const normalizedPayload = normalizeTrackerSeatProfilePayload(payload, budgetArea)

  if (!normalizedPayload.domain || !normalizedPayload.subDomain || !normalizedPayload.projectCode) {
    throw new Error("Domain, sub-domain, and project code are required.")
  }

  if (seat.sourceType === "MANUAL") {
    const before = buildTrackerSeatProfileAuditShape(seat)
    const updatedSeat = await prisma.trackerSeat.update({
      where: { id: seat.id },
      data: {
        ...normalizedPayload,
        allocation: normalizedPayload.allocation ?? 0,
      },
      include: {
        months: {
          orderBy: { monthIndex: "asc" },
        },
        override: true,
        budgetArea: true,
      },
    })

    await persistSeatReferenceSelections({
      trackingYearId: seat.trackingYearId,
      vendor: normalizedPayload.vendor,
      location: normalizedPayload.location,
      manager: normalizedPayload.manager,
      role: normalizedPayload.description,
      band: normalizedPayload.band,
      resourceType: normalizedPayload.resourceType,
    })

    await writeAuditLog({
      trackingYearId: seat.trackingYearId,
      entityType: "TrackerSeat",
      entityId: updatedSeat.id,
      action: "UPDATE",
      actor,
      changes: buildAuditChanges(
        before,
        buildTrackerSeatProfileAuditShape(updatedSeat),
        [
          "domain",
          "subDomain",
          "funding",
          "pillar",
          "budgetAreaId",
          "costCenter",
          "projectCode",
          "resourceType",
          "team",
          "inSeat",
          "description",
          "band",
          "location",
          "vendor",
          "manager",
          "dailyRate",
          "ritm",
          "sow",
          "spendPlanId",
          "status",
          "allocation",
          "startDate",
          "endDate",
          "notes",
        ]
      ),
    })

    return updatedSeat
  }

  const before = buildTrackerSeatProfileAuditShape(seat.override ?? {})
  const override = await prisma.trackerOverride.upsert({
    where: { trackerSeatId: seat.id },
    update: normalizedPayload,
    create: {
      trackerSeatId: seat.id,
      ...normalizedPayload,
    },
  })

  await persistSeatReferenceSelections({
    trackingYearId: seat.trackingYearId,
    vendor: normalizedPayload.vendor,
    location: normalizedPayload.location,
    manager: normalizedPayload.manager,
    role: normalizedPayload.description,
    band: normalizedPayload.band,
    resourceType: normalizedPayload.resourceType,
  })

  await writeAuditLog({
    trackingYearId: seat.trackingYearId,
    entityType: "TrackerOverride",
    entityId: override.id,
    action: seat.override ? "UPDATE" : "CREATE",
    actor,
    changes: buildAuditChanges(
      before,
      buildTrackerSeatProfileAuditShape(override),
      [
        "domain",
        "subDomain",
        "funding",
        "pillar",
        "budgetAreaId",
        "costCenter",
        "projectCode",
        "resourceType",
        "team",
        "inSeat",
        "description",
        "band",
        "location",
        "vendor",
        "manager",
        "dailyRate",
        "ritm",
        "sow",
        "spendPlanId",
        "status",
        "allocation",
        "startDate",
        "endDate",
        "notes",
      ]
    ),
  })

  return prisma.trackerSeat.findUnique({
    where: { id: seat.id },
    include: {
      months: {
        orderBy: { monthIndex: "asc" },
      },
      override: true,
      budgetArea: true,
    },
  })
}

export async function createManualTrackerSeat(
  input: {
    year: number
    profile: TrackerSeatProfilePayload
  },
  actor?: AuditActor
) {
  ensureValidYear(input.year)
  const trackingYear = await getOrCreateTrackingYear(input.year)
  const [existingSeats, latestRosterPeople, budgetArea] = await Promise.all([
    prisma.trackerSeat.findMany({
      where: {
        trackingYearId: trackingYear.id,
      },
      select: {
        seatId: true,
      },
    }),
    prisma.rosterPerson.findMany({
      where: {
        trackingYearId: trackingYear.id,
        import: {
          status: "APPROVED",
        },
      },
      select: {
        seatId: true,
      },
    }),
    resolveBudgetAreaForSeatProfile({
      trackingYearId: trackingYear.id,
      budgetAreaId: input.profile.budgetAreaId,
      domain: input.profile.domain,
      subDomain: input.profile.subDomain,
      projectCode: input.profile.projectCode,
      pillar: input.profile.pillar,
    }),
  ])
  const normalizedProfile = normalizeTrackerSeatProfilePayload(input.profile, budgetArea)

  if (!normalizedProfile.domain || !normalizedProfile.subDomain || !normalizedProfile.projectCode) {
    throw new Error("Domain, sub-domain, and project code are required.")
  }

  const seatId = parseNextSeatId([
    ...existingSeats.map((seat) => seat.seatId),
    ...latestRosterPeople.map((person) => person.seatId),
  ])
  const seat = await prisma.trackerSeat.create({
    data: {
      trackingYearId: trackingYear.id,
      sourceType: "MANUAL",
      seatId,
      sourceKey: `manual:${seatId}`,
      isActive: true,
      ...normalizedProfile,
      allocation: normalizedProfile.allocation ?? 0,
    },
    include: {
      months: {
        orderBy: { monthIndex: "asc" },
      },
      override: true,
      budgetArea: true,
    },
  })

  await ensureSeatMonthsForSeats([seat.id])
  await persistSeatReferenceSelections({
    trackingYearId: trackingYear.id,
    vendor: normalizedProfile.vendor,
    location: normalizedProfile.location,
    manager: normalizedProfile.manager,
    role: normalizedProfile.description,
    band: normalizedProfile.band,
    resourceType: normalizedProfile.resourceType,
  })

  await writeAuditLog({
    trackingYearId: trackingYear.id,
    entityType: "TrackerSeat",
    entityId: seat.id,
    action: "CREATE",
    actor,
    changes: buildAuditChanges(
      null,
      {
        seatId: seat.seatId,
        sourceType: seat.sourceType,
        sourceKey: seat.sourceKey,
        ...buildTrackerSeatProfileAuditShape(seat),
      },
      [
        "seatId",
        "sourceType",
        "sourceKey",
        "domain",
        "subDomain",
        "funding",
        "pillar",
        "budgetAreaId",
        "costCenter",
        "projectCode",
        "resourceType",
        "team",
        "inSeat",
        "description",
        "band",
        "location",
        "vendor",
        "manager",
        "dailyRate",
        "ritm",
        "sow",
        "spendPlanId",
        "status",
        "allocation",
        "startDate",
        "endDate",
        "notes",
      ]
    ),
  })

  return prisma.trackerSeat.findUnique({
    where: { id: seat.id },
    include: {
      months: {
        orderBy: { monthIndex: "asc" },
      },
      override: true,
      budgetArea: true,
    },
  })
}

export async function saveCloudActualForBudgetArea(
  input: {
    year: number
    domain: string | null
    subDomain: string | null
    projectCode: string | null
    monthIndex: number
    actualAmount: number
  },
  actor?: AuditActor
) {
  ensureValidYear(input.year)

  if (!Number.isInteger(input.monthIndex) || input.monthIndex < 0 || input.monthIndex > 11) {
    throw new Error("Month must be between 0 and 11.")
  }

  const trackingYear = await getOrCreateTrackingYear(input.year)
  const normalizedDomain = normalizeDomainLabel(input.domain)
  const normalizedSubDomain = normalizeSubDomainLabel(input.subDomain)
  const normalizedProjectCode = normalizeOptionalString(input.projectCode)

  if (!normalizedSubDomain) {
    throw new Error("Select a sub-domain scope before saving cloud actuals.")
  }

  if (!Number.isFinite(input.actualAmount) || input.actualAmount < 0) {
    throw new Error("Enter a valid cloud actual amount.")
  }

  const budgetArea = await prisma.budgetArea.findFirst({
    where: {
      trackingYearId: trackingYear.id,
      domain: normalizedDomain
        ? {
            equals: normalizedDomain,
            mode: "insensitive",
          }
        : undefined,
      subDomain: {
        equals: normalizedSubDomain,
        mode: "insensitive",
      },
      projectCode: normalizedProjectCode
        ? {
            equals: normalizedProjectCode,
            mode: "insensitive",
          }
        : undefined,
    },
    orderBy: [{ pillar: "asc" }, { costCenter: "asc" }],
  })

  if (!budgetArea) {
    throw new Error("Budget area not found for the selected scope and year.")
  }
  const actualAmount = Math.round(input.actualAmount * 100) / 100
  const sourceKey = `manual-cloud:${budgetArea.id}`
  const seatId = `CLOUD-${budgetArea.projectCode || budgetArea.costCenter || budgetArea.id.slice(0, 6)}`
  const existingSeat = await prisma.trackerSeat.findUnique({
    where: {
      trackingYearId_sourceKey: {
        trackingYearId: trackingYear.id,
        sourceKey,
      },
    },
    include: {
      months: {
        orderBy: { monthIndex: "asc" },
      },
      override: true,
      budgetArea: true,
    },
  })

  const seat =
    existingSeat ??
    (await prisma.trackerSeat.create({
      data: {
        trackingYearId: trackingYear.id,
        budgetAreaId: budgetArea.id,
        sourceType: "MANUAL",
        seatId,
        sourceKey,
        isActive: true,
        domain: normalizeDomainLabel(budgetArea.domain),
        subDomain: normalizeSubDomainLabel(budgetArea.subDomain),
        funding: budgetArea.funding,
        pillar: budgetArea.pillar,
        costCenter: budgetArea.costCenter,
        projectCode: budgetArea.projectCode,
        resourceType: "cloud",
        team: "Cloud",
        description: "Cloud actuals",
        allocation: 0,
      },
      include: {
        months: {
          orderBy: { monthIndex: "asc" },
        },
        override: true,
        budgetArea: true,
      },
    }))

  if (!existingSeat) {
    await ensureSeatMonthsForSeats([seat.id])
    await writeAuditLog({
      trackingYearId: trackingYear.id,
      entityType: "TrackerSeat",
      entityId: seat.id,
      action: "CREATE",
      actor,
      changes: buildAuditChanges(
        null,
        {
          seatId: seat.seatId,
          sourceType: seat.sourceType,
          sourceKey: seat.sourceKey,
          ...buildTrackerSeatProfileAuditShape(seat),
        },
        [
          "seatId",
          "sourceType",
          "sourceKey",
          "domain",
          "subDomain",
          "funding",
          "pillar",
          "budgetAreaId",
          "costCenter",
          "projectCode",
          "resourceType",
          "team",
          "description",
          "allocation",
        ]
      ),
    })
  }

  const seatWithRelations = await prisma.trackerSeat.findUniqueOrThrow({
    where: { id: seat.id },
    include: {
      months: {
        orderBy: { monthIndex: "asc" },
      },
      override: true,
      budgetArea: true,
    },
  })
  const exchangeRates = await prisma.exchangeRate.findMany({
    where: { trackingYearId: trackingYear.id },
    orderBy: { effectiveDate: "desc" },
  })

  await applyTrackerSeatMonthUpdate({
    seat: seatWithRelations as SeatWithRelations,
    payload: {
      monthIndex: input.monthIndex,
      actualAmount,
      actualCurrency: "DKK",
      forecastIncluded: false,
      notes: `Cloud actual manually entered for ${budgetArea.subDomain ?? "Unmapped"}.`,
    },
    actor,
    exchangeRateRows: exchangeRates,
    yearRecord: trackingYear,
    costAssumptionRows: [],
  })

  return {
    amount: actualAmount,
    seatId: seat.seatId,
    monthLabel: MONTH_NAMES[input.monthIndex],
    subDomain: budgetArea.subDomain,
  }
}

export async function deleteManualTrackerSeat(seatId: string, actor?: AuditActor) {
  const seat = await prisma.trackerSeat.findUniqueOrThrow({
    where: { id: seatId },
    include: {
      override: true,
      budgetArea: true,
      months: {
        orderBy: { monthIndex: "asc" },
      },
    },
  })

  if (seat.sourceType !== "MANUAL") {
    throw new Error("Only manual seats can be deleted.")
  }

  const before = {
    seatId: seat.seatId,
    sourceType: seat.sourceType,
    sourceKey: seat.sourceKey,
    ...buildTrackerSeatProfileAuditShape(seat),
  }

  await prisma.trackerSeat.delete({
    where: { id: seat.id },
  })

  await writeAuditLog({
    trackingYearId: seat.trackingYearId,
    entityType: "TrackerSeat",
    entityId: seat.id,
    action: "DELETE",
    actor,
    changes: buildAuditChanges(
      before,
      null,
      [
        "seatId",
        "sourceType",
        "sourceKey",
        "domain",
        "subDomain",
        "funding",
        "pillar",
        "budgetAreaId",
        "costCenter",
        "projectCode",
        "resourceType",
        "team",
        "inSeat",
        "description",
        "band",
        "location",
        "vendor",
        "manager",
        "dailyRate",
        "ritm",
        "sow",
        "spendPlanId",
        "status",
        "allocation",
        "startDate",
        "endDate",
        "notes",
      ]
    ),
  })
}

export async function updateTrackerSeatMonths(
  seatId: string,
  payloads: TrackerSeatMonthUpdatePayload[],
  actor?: AuditActor
) {
  const seat = await prisma.trackerSeat.findUniqueOrThrow({
    where: { id: seatId },
    include: {
      months: {
        orderBy: { monthIndex: "asc" },
      },
      override: true,
      budgetArea: true,
    },
  })
  const beforeMonthsByIndex = new Map(
    seat.months.map((month) => [month.monthIndex, month])
  )
  const requiresForecastSnapshot = payloads.some((payload) => {
    if (payload.monthIndex === undefined) {
      return false
    }

    const beforeMonth = beforeMonthsByIndex.get(payload.monthIndex)
    return (
      payload.actualAmount === undefined &&
      !(payload.forecastIncluded ?? beforeMonth?.forecastIncluded ?? true) &&
      beforeMonth?.usedForecastAmount == null
    )
  })

  const [yearRecord, exchangeRateRows, costAssumptionRows] = await Promise.all([
    requiresForecastSnapshot
      ? prisma.trackingYear.findUniqueOrThrow({
          where: { id: seat.trackingYearId },
          select: { year: true },
        })
      : Promise.resolve(null),
    prisma.exchangeRate.findMany({
      where: { trackingYearId: seat.trackingYearId },
      orderBy: { effectiveDate: "desc" },
    }),
    requiresForecastSnapshot
      ? prisma.costAssumption.findMany({
          where: { trackingYearId: seat.trackingYearId },
        })
      : Promise.resolve([]),
  ])
  const exchangeRateLookup = buildExchangeRateLookup(exchangeRateRows)

  for (const payload of payloads) {
    if (payload.monthIndex === undefined) {
      continue
    }

    const month = await applyTrackerSeatMonthUpdate({
      seat: seat as SeatWithRelations,
      payload,
      actor,
      beforeMonth: beforeMonthsByIndex.get(payload.monthIndex) ?? null,
      exchangeRateRows,
      exchangeRateLookup,
      yearRecord,
      costAssumptionRows,
    })

    if (month) {
      beforeMonthsByIndex.set(payload.monthIndex, month)
    }
  }

  return prisma.trackerSeat.findUnique({
    where: { id: seat.id },
    include: {
      months: {
        orderBy: { monthIndex: "asc" },
      },
      override: true,
      budgetArea: true,
    },
  })
}

async function getInternalForecastCopyCandidates(input: {
  year: number
  budgetAreaId: string
  monthIndex: number
}, viewer?: Pick<AppViewer, "role" | "scopes">) {
  const trackingYear = await getOrCreateTrackingYear(input.year)
  const selectedSummary = parseSummaryKey(input.budgetAreaId)
  const [seats, assumptions, exchangeRates] = await Promise.all([
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
  const internalSeats = (seats as SeatWithRelations[])
    .map((seat) => {
      const effectiveSeat = getEffectiveSeat(seat)
      return { seat, effectiveSeat }
    })
    .filter(
      ({ effectiveSeat }) =>
        normalizeValue(effectiveSeat.subDomain) ===
          normalizeValue(selectedSummary.subDomain) &&
        normalizeValue(effectiveSeat.projectCode) ===
          normalizeValue(selectedSummary.projectCode) &&
        !isExternalSeat(effectiveSeat)
    )

  return filterScopedItems(
    internalSeats
    .map(({ seat, effectiveSeat }) => {
      const metrics = deriveSeatMetrics(
        seat,
        assumptionLookup,
        exchangeRates,
        input.year
      )
      const baseMetrics = deriveSeatMetrics(
        seat,
        assumptionLookup,
        exchangeRates,
        input.year,
        {
          ignoreForecastOverrides: true,
        }
      )
      const monthForecast = metrics.monthlyForecast[input.monthIndex] ?? 0
      const baseMonthForecast = baseMetrics.monthlyForecast[input.monthIndex] ?? 0

      if (monthForecast <= 0) {
        return null
      }

      const status = effectiveSeat.status
      const isOnLeave = normalizeValue(status) === normalizeValue("On leave")
      const allocation = Number.isFinite(Number(effectiveSeat.allocation))
        ? Number(effectiveSeat.allocation)
        : 0

      return {
        trackerSeatId: seat.id,
        seatId: seat.seatId,
        inSeat: effectiveSeat.inSeat,
        team: effectiveSeat.team,
        status,
        allocationPercent: allocation <= 1 ? allocation * 100 : allocation,
        requiresConfirmation: isOnLeave,
        amount: Math.round(monthForecast),
        baseAmount: Math.round(baseMonthForecast),
      }
    })
    .filter(
      (
        seat
      ): seat is {
        trackerSeatId: string
        seatId: string
        inSeat: string | null
        team: string | null
        status: string | null
        allocationPercent: number
        requiresConfirmation: boolean
        amount: number
        baseAmount: number
      } => Boolean(seat)
    )
    .sort((left, right) => {
      if (left.requiresConfirmation !== right.requiresConfirmation) {
        return left.requiresConfirmation ? -1 : 1
      }

      return left.seatId.localeCompare(right.seatId)
    }),
    viewer,
    () => ({ domain: null, subDomain: selectedSummary.subDomain })
  )
}

export async function previewForecastCopyToActualsForSubDomain(input: {
  year: number
  budgetAreaId: string
  monthIndex: number
}, viewer?: Pick<AppViewer, "role" | "scopes">) {
  const selectedSummary = parseSummaryKey(input.budgetAreaId)
  const seats = await getInternalForecastCopyCandidates(input, viewer)

  return {
    monthIndex: input.monthIndex,
    monthLabel: monthLabel(input.year, input.monthIndex),
    subDomain: selectedSummary.subDomain,
    seats,
  }
}

export async function applyForecastCopyToActualsForSubDomain(input: {
  year: number
  budgetAreaId: string
  monthIndex: number
  overrides?: {
    trackerSeatId: string
    amount: number
  }[]
  confirmedTrackerSeatIds?: string[]
}, actor?: AuditActor, viewer?: Pick<AppViewer, "role" | "scopes">) {
  const trackingYear = await getOrCreateTrackingYear(input.year)
  const candidates = await getInternalForecastCopyCandidates(input, viewer)
  const overrideLookup = new Map(
    (input.overrides ?? []).map((override) => [override.trackerSeatId, override.amount])
  )
  const confirmedSeatIds = new Set(input.confirmedTrackerSeatIds ?? [])
  const unconfirmedOnLeaveSeats = candidates.filter(
    (candidate) => candidate.requiresConfirmation && !confirmedSeatIds.has(candidate.trackerSeatId)
  )

  if (unconfirmedOnLeaveSeats.length > 0) {
    throw new Error("Confirm the on-leave seats before completing the forecast copy.")
  }

  const updates = candidates.map((candidate) => {
    const amount = Math.round(
      overrideLookup.get(candidate.trackerSeatId) ?? candidate.amount
    )

    return prisma.seatMonth.upsert({
      where: {
        trackerSeatId_monthIndex: {
          trackerSeatId: candidate.trackerSeatId,
          monthIndex: input.monthIndex,
        },
      },
      update: {
        actualAmount: amount <= 0 ? 0 : amount,
        actualAmountRaw: amount,
        actualCurrency: "DKK",
        exchangeRateUsed: amount <= 0 ? null : 1,
        forecastIncluded: false,
        usedForecastAmount: candidate.amount,
      },
      create: {
        trackerSeatId: candidate.trackerSeatId,
        monthIndex: input.monthIndex,
        actualAmount: amount <= 0 ? 0 : amount,
        actualAmountRaw: amount,
        actualCurrency: "DKK",
        exchangeRateUsed: amount <= 0 ? null : 1,
        forecastIncluded: false,
        usedForecastAmount: candidate.amount,
      },
    })
  })

  if (updates.length === 0) {
    return { updatedCount: 0 }
  }

  await prisma.$transaction(updates)

  await writeAuditLog({
    trackingYearId: trackingYear.id,
    entityType: "BulkForecastCopy",
    entityId: input.budgetAreaId,
    action: "BULK_APPLY",
    actor,
    changes: [
      {
        field: "bulkForecastCopy",
        oldValue: null,
        newValue: JSON.stringify({
          budgetAreaId: input.budgetAreaId,
          monthIndex: input.monthIndex,
          updatedCount: updates.length,
        }),
      },
    ],
  })

  return { updatedCount: updates.length }
}

export async function rollbackExternalActualImport(
  input: {
    importId: string
  },
  actor?: AuditActor
) {
  const batch = await prisma.externalActualImport.findUniqueOrThrow({
    where: { id: input.importId },
    include: {
      entries: true,
    },
  })

  const actorEmail = normalizeValue(actor?.email)
  if (!actorEmail || actorEmail !== normalizeValue(batch.importedByEmail)) {
    throw new Error("Only the user who created this import can roll it back.")
  }

  const impactedKeys = Array.from(
    new Set(
      batch.entries
        .filter((entry) => Boolean(entry.trackerSeatId))
        .map((entry) => `${entry.trackerSeatId}:${entry.monthIndex}`)
    )
  ).map((key) => {
    const [trackerSeatId, monthIndex] = key.split(":")

    return {
      trackerSeatId,
      monthIndex: Number(monthIndex),
    }
  })

  await prisma.$transaction(async (transaction) => {
    await transaction.externalActualImport.delete({
      where: { id: batch.id },
    })

    for (const impacted of impactedKeys) {
      const currentMonth = await transaction.seatMonth.findUnique({
        where: {
          trackerSeatId_monthIndex: {
            trackerSeatId: impacted.trackerSeatId,
            monthIndex: impacted.monthIndex,
          },
        },
      })

      if (
        currentMonth &&
        !currentMonth.notes?.includes("Imported from external actuals:")
      ) {
        continue
      }

      const replacement = await transaction.externalActualEntry.findFirst({
        where: {
          trackerSeatId: impacted.trackerSeatId,
          monthIndex: impacted.monthIndex,
        },
        include: {
          import: true,
        },
        orderBy: [{ import: { importedAt: "desc" } }, { createdAt: "desc" }],
      })

      await transaction.seatMonth.upsert({
        where: {
          trackerSeatId_monthIndex: {
            trackerSeatId: impacted.trackerSeatId,
            monthIndex: impacted.monthIndex,
          },
        },
        update: replacement
          ? {
              actualAmount: replacement.amount <= 0 ? 0 : replacement.amount,
              actualAmountRaw: replacement.originalAmount ?? replacement.amount,
              actualCurrency: replacement.originalCurrency ?? "DKK",
              exchangeRateUsed:
                replacement.amount <= 0
                  ? null
                  : replacement.originalCurrency &&
                      replacement.originalCurrency !== "DKK" &&
                      replacement.originalAmount &&
                      replacement.originalAmount > 0
                    ? replacement.amount / replacement.originalAmount
                    : 1,
              forecastIncluded: replacement.amount <= 0,
              usedForecastAmount: replacement.usedForecastAmount,
              notes: `Imported from external actuals: ${replacement.import.fileName} (${replacement.import.id})`,
            }
          : {
              actualAmount: 0,
              actualAmountRaw: null,
              actualCurrency: "DKK",
              exchangeRateUsed: null,
              forecastIncluded: true,
              usedForecastAmount: null,
              notes: null,
            },
        create: replacement
          ? {
              trackerSeatId: impacted.trackerSeatId,
              monthIndex: impacted.monthIndex,
              actualAmount: replacement.amount <= 0 ? 0 : replacement.amount,
              actualAmountRaw: replacement.originalAmount ?? replacement.amount,
              actualCurrency: replacement.originalCurrency ?? "DKK",
              exchangeRateUsed:
                replacement.amount <= 0
                  ? null
                  : replacement.originalCurrency &&
                      replacement.originalCurrency !== "DKK" &&
                      replacement.originalAmount &&
                      replacement.originalAmount > 0
                    ? replacement.amount / replacement.originalAmount
                    : 1,
              forecastIncluded: replacement.amount <= 0,
              usedForecastAmount: replacement.usedForecastAmount,
              notes: `Imported from external actuals: ${replacement.import.fileName} (${replacement.import.id})`,
            }
          : {
              trackerSeatId: impacted.trackerSeatId,
              monthIndex: impacted.monthIndex,
              actualAmount: 0,
              actualAmountRaw: null,
              actualCurrency: "DKK",
              exchangeRateUsed: null,
              forecastIncluded: true,
              usedForecastAmount: null,
              notes: null,
            },
      })
    }
  })

  await writeAuditLog({
    trackingYearId: batch.trackingYearId,
    entityType: "ExternalActualImport",
    entityId: batch.id,
    action: "ROLLBACK",
    actor,
    changes: [
      {
        field: "externalActualImport",
        oldValue: JSON.stringify({
          fileName: batch.fileName,
          importedByName: batch.importedByName,
          importedByEmail: batch.importedByEmail,
          rowCount: batch.rowCount,
          entryCount: batch.entryCount,
        }),
        newValue: null,
      },
    ],
  })

  return {
    id: batch.id,
    fileName: batch.fileName,
    entryCount: batch.entryCount,
  }
}
