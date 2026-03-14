import type {
  CurrencyCode,
  ExchangeRate,
  Prisma,
  ServiceMessageKey,
  StaffingTargetScopeLevel,
} from "@/lib/generated/prisma/client"
import {
  ALLOWED_SEAT_STATUSES,
  CLOUD_CATEGORY,
  DEFAULT_ACTIVE_SEAT_STATUSES,
  MONTH_NAMES,
  WORK_DAYS_PER_YEAR,
} from "@/lib/finance/constants"
import type { AuditActor } from "@/lib/finance/audit"
import { buildAuditChanges, writeAuditLog } from "@/lib/finance/audit"
import { buildExchangeRateLookup, convertAmountToDkk } from "@/lib/finance/currency"
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
  BudgetMovementFilters,
  BudgetMovementFilterOption,
  BudgetMovementView,
  DepartmentMappingView,
  LatestExchangeRate,
  PeopleRosterFilters,
  PeopleRosterView,
  SeatMonthView,
  SeatWithRelations,
  StaffingMonthBucket,
  StaffingOverviewGroup,
  StaffingOverviewRow,
  StaffingTargetView,
  StatusDefinitionView,
} from "@/lib/finance/types"
import { filterByScopes, hasScopeRestrictions, type AppViewer } from "@/lib/authz"
import { prisma } from "@/lib/prisma"

export const INTERNAL_ACTUALS_SERVICE_MESSAGE_KEY: ServiceMessageKey =
  "INTERNAL_ACTUALS"

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
  }[]
) {
  return mappings.reduce<
    Record<string, { id?: string; domain: string; subDomain: string; projectCode: string }[]>
  >(
    (accumulator, mapping) => {
      const key = buildDepartmentCodeKey(mapping.sourceCode)
      accumulator[key] ||= []
      accumulator[key].push({
        id: mapping.id,
        domain: normalizeDomainLabel(mapping.domain) || mapping.domain,
        subDomain: normalizeSubDomainLabel(mapping.subDomain) || mapping.subDomain,
        projectCode: mapping.projectCode?.trim() || "",
      })

      return accumulator
    },
    {}
  )
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

function normalizeOptionalString(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeOptionalNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
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

async function ensureSeatMonths(trackerSeatId: string) {
  const existingMonths = await prisma.seatMonth.findMany({
    where: { trackerSeatId },
    select: { monthIndex: true },
  })
  const existing = new Set(existingMonths.map((month) => month.monthIndex))

  const missing = Array.from({ length: 12 }, (_, index) => index).filter(
    (monthIndex) => !existing.has(monthIndex)
  )

  if (missing.length === 0) {
    return
  }

  await prisma.seatMonth.createMany({
    data: missing.map((monthIndex) => ({
      trackerSeatId,
      monthIndex,
    })),
  })
}

function collectSortedValues(values: (string | null | undefined)[]) {
  return Array.from(
    new Set(
      values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))
    )
  ).sort((left, right) => left.localeCompare(right))
}

function normalizeValues(values: string[]) {
  return new Set(values.map((value) => normalizeValue(value)).filter(Boolean))
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

  await prisma.trackerSeat.updateMany({
    where: {
      trackingYearId: trackingYear.id,
      sourceType: "ROSTER",
    },
    data: {
      isActive: false,
    },
  })

  if (latestPeopleBySeatId.length === 0) {
    return
  }

  for (const person of latestPeopleBySeatId) {
    const existingSeat = existingSeatBySourceKey.get(buildSourceKey(person.seatId))
    const assignment = resolveRosterSeatAssignment(
      person,
      budgetAreas,
      mappingLookup,
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
        dailyRate: person.dailyRate,
        status: person.status,
        allocation: normalizeAllocation(person.allocation),
        startDate: person.expectedStartDate,
        endDate: person.expectedEndDate,
      },
    })

    await ensureSeatMonths(trackerSeat.id)
  }
}

export async function getFinanceWorkspaceData(
  year?: number,
  budgetAreaId?: string,
  trackerTeams?: string[],
  missingActualMonths?: string[],
  openSeatsOnly?: boolean,
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

  const [summary, budgetAreas, departmentMappings, selectedAreaId] =
    await Promise.all([
      getBudgetAreaSummary(activeYear, statusDefinitions, viewer),
      prisma.budgetArea.findMany({
        where: { trackingYear: { year: activeYear } },
        orderBy: [{ domain: "asc" }, { subDomain: "asc" }, { costCenter: "asc" }],
      }),
      prisma.departmentMapping.findMany({
        where: {
          trackingYear: { year: activeYear },
          codeType: "DEPARTMENT_CODE",
        },
      }),
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
  const availableAreaIds = new Set(summary.map((entry) => entry.id))
  const effectiveAreaId =
    selectedAreaId && availableAreaIds.has(selectedAreaId)
      ? selectedAreaId
      : summary[0]?.id ?? null
  const allSeats = effectiveAreaId
    ? await getTrackerDetail(activeYear, effectiveAreaId, viewer)
    : []
  const teamFilter = normalizeValues(trackerTeams ?? [])
  const monthFilter = new Set(
    (missingActualMonths ?? [])
      .map((month) => MONTH_NAMES.findIndex((candidate) => candidate === month))
      .filter((index) => index >= 0)
  )
  const seats = allSeats.filter((seat) => {
    if (openSeatsOnly && normalizeValue(seat.status) !== normalizeValue("Open")) {
      return false
    }

    if (teamFilter.size > 0 && !teamFilter.has(normalizeValue(seat.team))) {
      return false
    }

    if (monthFilter.size > 0) {
      if (normalizeValue(seat.status) === normalizeValue("Open")) {
        return false
      }

      const seatStartMonthIndex = seat.startDate
        ? seat.startDate.getFullYear() > activeYear
          ? Number.POSITIVE_INFINITY
          : seat.startDate.getFullYear() < activeYear
            ? 0
            : seat.startDate.getMonth()
        : null

      const eligibleMonthIndexes = Array.from(monthFilter).filter(
        (monthIndex) => seatStartMonthIndex === null || monthIndex >= seatStartMonthIndex
      )

      if (eligibleMonthIndexes.length === 0) {
        return false
      }

      const hasMissingActualInSelectedMonth = eligibleMonthIndexes.some((monthIndex) => {
        const month = seat.months.find((entry) => entry.monthIndex === monthIndex)
        const actualAmount = month?.actualAmountRaw ?? month?.actualAmountDkk ?? 0

        return actualAmount <= 0
      })

      if (!hasMissingActualInSelectedMonth) {
        return false
      }
    }

    return true
  })
  const internalActualsMessage = await prisma.serviceMessage.findUnique({
    where: {
      trackingYearId_key: {
        trackingYearId: trackingYear.id,
        key: INTERNAL_ACTUALS_SERVICE_MESSAGE_KEY,
      },
    },
  })

  return {
    activeYear,
    trackingYears,
    summary,
    seats,
    internalActualsMessage: internalActualsMessage?.content ?? null,
    budgetAreas: scopedBudgetAreas,
    selectedAreaId: effectiveAreaId,
    statusDefinitions,
    trackerTeamFilters: trackerTeams ?? [],
    trackerTeamOptions: collectSortedValues(allSeats.map((seat) => seat.team)),
    missingActualMonthFilters: missingActualMonths ?? [],
    missingActualMonthOptions: MONTH_NAMES,
    openSeatsOnly: Boolean(openSeatsOnly),
  }
}

export async function getForecastsPageData(input?: {
  year?: number
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
    const metrics = deriveSeatMetrics(seat, assumptionLookup, exchangeRates, activeYear)
    const baseMetrics = deriveSeatMetrics(
      {
        ...seat,
        months: seat.months.map((month) => ({
          ...month,
          forecastOverrideAmount: null,
        })),
      },
      assumptionLookup,
      exchangeRates,
      activeYear
    )
    const cancelled = isTrackerCancelledSeat(seat, effectiveSeat, exchangeRates)

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
  const subDomainFilter = normalizeValues(filters.subDomains)
  const teamFilter = normalizeValues(filters.teams)
  const statusFilter = normalizeValues(filters.statuses)
  const seatIdFilter = normalizeValues(filters.seatIds)
  const nameFilter = normalizeValues(filters.names)
  const reducedOnLeaveLocations = new Set(["denmark", "uk", "poland", "usa"])
  const inactiveForecastStatuses = new Set([
    "cancelled",
    "closed",
    "closed- account still active in ad",
    "cancelled- account still active in ad",
  ])

  const filteredSeats = mappedSeats
    .filter((seat) => {
      if (
        filters.hideInactiveStatuses &&
        inactiveForecastStatuses.has(normalizeValue(seat.status))
      ) {
        return false
      }

      if (subDomainFilter.size > 0 && !subDomainFilter.has(normalizeValue(seat.subDomain))) {
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
      subDomains: collectSortedValues(mappedSeats.map((seat) => seat.subDomain)),
      teams: collectSortedValues(mappedSeats.map((seat) => seat.team)),
      statuses: collectSortedValues(mappedSeats.map((seat) => seat.status)),
      seats: mappedSeats.map((seat) => ({
        id: seat.id,
        seatId: seat.seatId,
        name: seat.inSeat || "",
        team: seat.team || "",
        subDomain: seat.subDomain || "",
        status: seat.status || "",
      })),
    },
    internalCostServiceMessage: internalActualsMessage?.content ?? null,
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

  const imports = await prisma.externalActualImport.findMany({
    where: { trackingYearId: trackingYear.id },
    include: {
      entries: {
        include: {
          trackerSeat: true,
        },
      },
    },
    orderBy: [{ importedAt: "desc" }],
  })

  const normalizedUser = normalizeValue(filters.user)
  const normalizedFileName = normalizeValue(filters.fileName)
  const normalizedSeatId = normalizeValue(filters.seatId)
  const normalizedTeam = normalizeValue(filters.team)

  const scopedImports = imports
    .map((importBatch) => ({
      ...importBatch,
      entries: filterScopedItems(
        importBatch.entries,
        viewer,
        (entry) => ({
          domain: entry.trackerSeat?.domain,
          subDomain: entry.trackerSeat?.subDomain,
        })
      ),
    }))
    .filter((importBatch) => importBatch.entries.length > 0 || !hasScopeRestrictions(viewer ?? { role: null, scopes: [] }))

  const filteredImports = scopedImports.filter((importBatch) => {
    const normalizedActor = `${normalizeValue(importBatch.importedByName)} ${normalizeValue(importBatch.importedByEmail)}`.trim()

      if (normalizedUser && !normalizedActor.includes(normalizedUser)) {
        return false
      }

      if (normalizedFileName && !normalizeValue(importBatch.fileName).includes(normalizedFileName)) {
        return false
      }

      if (importedFrom && importBatch.importedAt < importedFrom) {
        return false
      }

      if (importedTo && importBatch.importedAt > importedTo) {
        return false
      }

      return true
    })

  const importViews: ExternalActualImportBatchView[] = filteredImports.map((importBatch) => ({
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

  const views: ExternalActualImportView[] = filteredImports.flatMap((importBatch) =>
    importBatch.entries
      .slice()
      .sort((left, right) => {
        if (left.seatId !== right.seatId) {
          return left.seatId.localeCompare(right.seatId)
        }

        return left.monthIndex - right.monthIndex
      })
      .map((entry) => ({
        id: entry.id,
        importedAt: importBatch.importedAt,
        fileName: importBatch.fileName,
        importedByName: importBatch.importedByName,
        importedByEmail: importBatch.importedByEmail,
        seatId: entry.seatId,
        team: entry.team,
        inSeat: entry.inSeat,
        description: entry.description,
        monthLabel: entry.monthLabel,
        amount: entry.amount,
        matchedTrackerSeatId: entry.trackerSeatId,
      }))
      .filter((entry) => {
        if (normalizedSeatId && !normalizeValue(entry.seatId).includes(normalizedSeatId)) {
          return false
        }

        if (normalizedTeam && !normalizeValue(entry.team).includes(normalizedTeam)) {
          return false
        }

        return true
      })
  )

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

  const [people, departmentMappings, rosterImports, trackerSeats] = await Promise.all([
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
    prisma.departmentMapping.findMany({
      where: {
        trackingYearId: trackingYear.id,
        codeType: "DEPARTMENT_CODE",
      },
    }),
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
        sourceType: "ROSTER",
      },
      include: {
        months: true,
        override: true,
        budgetArea: true,
      },
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
  const mappingLookup = buildDepartmentMappingLookup(departmentMappings)
  const trackerSeatBySeatId = new Map(
    trackerSeats.map((seat) => [seat.seatId, seat])
  )
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
      importFileName: person.import.fileName,
      seatId: person.seatId,
      departmentCode: person.domain,
      domain: normalizeDomainLabel(effectiveSeat?.domain || mappedHierarchy?.domain || person.domain),
      projectCode: effectiveSeat?.projectCode || mappedHierarchy?.projectCode || null,
      name: person.resourceName,
      email: person.email,
      team: person.teamName,
      subDomain: normalizeSubDomainLabel(person.productLine),
      mappedSubDomain: normalizeSubDomainLabel(mappedHierarchy?.subDomain || null),
      vendor: person.vendor,
      dailyRate: person.dailyRate,
      location: person.location,
      band: person.band,
      role: person.title,
      resourceType: effectiveSeat?.resourceType || person.resourceType,
      status: person.status,
      manager: person.lineManager,
      fte: effectiveSeat?.allocation ?? person.allocation,
      startDate: person.expectedStartDate,
      endDate: person.expectedEndDate,
      effectiveStatus: effectiveSeat?.status || person.status,
      effectiveInSeat: effectiveSeat?.inSeat || person.resourceName,
      effectiveStartDate: effectiveSeat?.startDate || person.expectedStartDate,
      effectiveEndDate: effectiveSeat?.endDate || person.expectedEndDate,
      importError: person.importError,
    }
  })

  const scopedRosterViews = filterScopedItems(
    rosterViews,
    viewer,
    (person) => ({
      domain: person.domain,
      subDomain: person.mappedSubDomain || person.subDomain,
    })
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
      if (!isPermRosterPerson(person)) {
        return false
      }

      const normalizedStatus = normalizeValue(person.effectiveStatus)
      const normalizedInSeat = normalizeValue(person.effectiveInSeat)
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
      projectCodes: collectSortedValues(scopedRosterViews.map((person) => person.projectCode)),
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

  const [statuses, exchangeRates, departmentMappings] = await Promise.all([
    ensureStatusDefinitions(activeYear),
    getLatestExchangeRates(activeYear),
    getDepartmentMappings(activeYear),
  ])

  return {
    activeYear,
    trackingYears,
    statuses,
    exchangeRates,
    departmentMappings,
  }
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
  viewer?: Pick<AppViewer, "role" | "scopes">
): Promise<BudgetAreaSummary[]> {
  const trackingYear = await getOrCreateTrackingYear(year)
  const statusDefinitions =
    existingStatusDefinitions ?? (await ensureStatusDefinitions(year))

  const [budgetAreas, budgetMovements, seats, assumptions, exchangeRates, departmentMappings] =
    await Promise.all([
      prisma.budgetArea.findMany({
        where: { trackingYearId: trackingYear.id },
        orderBy: [{ domain: "asc" }, { subDomain: "asc" }, { costCenter: "asc" }],
      }),
      prisma.budgetMovement.findMany({
        where: { trackingYearId: trackingYear.id },
      }),
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
      prisma.departmentMapping.findMany({
        where: {
          trackingYearId: trackingYear.id,
          codeType: "DEPARTMENT_CODE",
        },
      }),
    ])

  const assumptionLookup = buildCostAssumptionLookup(assumptions)
  const activeStatuses = buildActiveStatusLookup(statusDefinitions)
  const mappingLookup = buildDepartmentMappingLookup(departmentMappings)
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
      cloudCostTarget: existing?.cloudCostTarget || 0,
      cloudCostForecast: existing?.cloudCostForecast || 0,
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
        cloudCostTarget: 0,
        cloudCostForecast: 0,
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
        cloudCostTarget: 0,
        cloudCostForecast: 0,
        seatCount: 0,
        activeSeatCount: 0,
        openSeatCount: 0,
      }
    summaryMap.set(summaryKey, summary)

    summary.seatCount += 1
    const normalizedStatus = normalizeValue(effectiveSeat.status)
    const normalizedInSeat = normalizeValue(effectiveSeat.inSeat)

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
  viewer?: Pick<AppViewer, "role" | "scopes">
) {
  const trackingYear = await getOrCreateTrackingYear(year)
  const selectedSummary = parseSummaryKey(budgetAreaId)
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
      orderBy: [{ team: "asc" }, { inSeat: "asc" }],
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
  ])

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
      const cancelled = isTrackerCancelledSeat(seat, effectiveSeat, exchangeRates)
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

export async function getDepartmentMappings(
  year: number
): Promise<DepartmentMappingView[]> {
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
    notes: mapping.notes,
  }))
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
      "notes",
    ]),
  })

  return mapping
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
            { notes: { not: null } },
          ],
        },
        data: {
          actualAmount: 0,
          actualAmountRaw: null,
          actualCurrency: "DKK",
          exchangeRateUsed: null,
          forecastIncluded: true,
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
  })

  if (payload.monthIndex !== undefined) {
    const beforeMonth = await prisma.seatMonth.findUnique({
      where: {
        trackerSeatId_monthIndex: {
          trackerSeatId: seat.id,
          monthIndex: payload.monthIndex,
        },
      },
    })
    const exchangeRates = buildExchangeRateLookup(
      await prisma.exchangeRate.findMany({
        where: { trackingYearId: seat.trackingYearId },
        orderBy: { effectiveDate: "desc" },
      })
    )
    const currency = payload.actualCurrency ?? beforeMonth?.actualCurrency ?? "DKK"
    const rawAmount =
      payload.actualAmount ?? beforeMonth?.actualAmountRaw ?? beforeMonth?.actualAmount ?? 0
    const isClearingActual = rawAmount <= 0
    const converted = isClearingActual
      ? {
          amountDkk: 0,
          exchangeRateUsed: null,
        }
      : convertAmountToDkk(rawAmount, currency, exchangeRates)
    const forecastIncluded =
      payload.actualAmount !== undefined && isClearingActual
        ? true
        : (payload.forecastIncluded ?? beforeMonth?.forecastIncluded ?? true)
    const notes = payload.notes === undefined ? beforeMonth?.notes ?? null : payload.notes
    const forecastOverrideAmount =
      payload.forecastOverrideAmount === undefined
        ? beforeMonth?.forecastOverrideAmount ?? null
        : payload.forecastOverrideAmount

    const month = await prisma.seatMonth.upsert({
      where: {
        trackerSeatId_monthIndex: {
          trackerSeatId: seat.id,
          monthIndex: payload.monthIndex,
        },
      },
      update: {
        actualAmount: converted.amountDkk,
        actualAmountRaw: isClearingActual ? null : rawAmount,
        actualCurrency: currency,
        exchangeRateUsed: converted.exchangeRateUsed,
        forecastOverrideAmount,
        forecastIncluded,
        notes,
      },
      create: {
        trackerSeatId: seat.id,
        monthIndex: payload.monthIndex,
        actualAmount: converted.amountDkk,
        actualAmountRaw: isClearingActual ? null : rawAmount,
        actualCurrency: currency,
        exchangeRateUsed: converted.exchangeRateUsed,
        forecastOverrideAmount,
        forecastIncluded,
        notes,
      },
    })

    await writeAuditLog({
      trackingYearId: seat.trackingYearId,
      entityType: "SeatMonth",
      entityId: month.id,
      action: beforeMonth ? "UPDATE" : "CREATE",
      actor,
      changes: buildAuditChanges(beforeMonth, month, [
        "monthIndex",
        "actualAmount",
        "actualAmountRaw",
        "actualCurrency",
        "exchangeRateUsed",
        "forecastOverrideAmount",
        "forecastIncluded",
        "notes",
      ]),
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
      const monthForecast = metrics.monthlyForecast[input.monthIndex] ?? 0

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
      },
      create: {
        trackerSeatId: candidate.trackerSeatId,
        monthIndex: input.monthIndex,
        actualAmount: amount <= 0 ? 0 : amount,
        actualAmountRaw: amount,
        actualCurrency: "DKK",
        exchangeRateUsed: amount <= 0 ? null : 1,
        forecastIncluded: false,
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
              actualAmountRaw: replacement.amount,
              actualCurrency: "DKK",
              exchangeRateUsed: replacement.amount <= 0 ? null : 1,
              forecastIncluded: replacement.amount <= 0,
              notes: `Imported from external actuals: ${replacement.import.fileName} (${replacement.import.id})`,
            }
          : {
              actualAmount: 0,
              actualAmountRaw: null,
              actualCurrency: "DKK",
              exchangeRateUsed: null,
              forecastIncluded: true,
              notes: null,
            },
        create: replacement
          ? {
              trackerSeatId: impacted.trackerSeatId,
              monthIndex: impacted.monthIndex,
              actualAmount: replacement.amount <= 0 ? 0 : replacement.amount,
              actualAmountRaw: replacement.amount,
              actualCurrency: "DKK",
              exchangeRateUsed: replacement.amount <= 0 ? null : 1,
              forecastIncluded: replacement.amount <= 0,
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
