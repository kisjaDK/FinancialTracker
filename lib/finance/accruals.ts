import type { ExchangeRate } from "@prisma/client"
import { MONTH_NAMES } from "@/lib/finance/constants"
import { buildExchangeRateLookup, convertAmountToDkk } from "@/lib/finance/currency"
import {
  buildCostAssumptionLookup,
  deriveSeatMetrics,
  getEffectiveSeat,
  isExternalSeat,
} from "@/lib/finance/derive"
import type {
  AccrualDetailLine,
  AccrualFilters,
  AccrualSummaryRow,
  SeatWithRelations,
} from "@/lib/finance/types"

type BuildAccrualsPageModelInput = {
  year: number
  seats: SeatWithRelations[]
  assumptions: Array<{
    id: string
    trackingYearId: string
    band: string
    location: string
    yearlyCost: number
    notes: string | null
    createdAt: Date
    updatedAt: Date
  }>
  exchangeRates: ExchangeRate[]
  accountMappings?: Record<string, string>
  filters: AccrualFilters
  submittedBy: string
  now?: Date
}

function normalizeValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ""
}

function resolveMonthIndex(monthLabel: string) {
  const monthIndex = MONTH_NAMES.findIndex((label) => label === monthLabel)
  return monthIndex >= 0 ? monthIndex : null
}

function collectSortedValues(values: (string | null | undefined)[]) {
  return Array.from(
    new Set(
      values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))
    )
  ).sort((left, right) => left.localeCompare(right))
}

export function resolveAccrualAccount(
  resourceType: string | null | undefined,
  accountMappings?: Record<string, string>
) {
  const mappedAccount = resourceType ? accountMappings?.[normalizeValue(resourceType)] : undefined
  if (mappedAccount) {
    return mappedAccount
  }

  const normalized = normalizeValue(resourceType)

  if (normalized.includes("cloud")) {
    return "4800211"
  }

  if (normalized.includes("managed service")) {
    return "4800209"
  }

  return "4800213"
}

export function getEligibleAccrualMonthIndexes(year: number, now = new Date()) {
  const currentYear = now.getFullYear()

  if (year < currentYear) {
    return Array.from({ length: 12 }, (_, monthIndex) => monthIndex)
  }

  if (year > currentYear) {
    return []
  }

  return Array.from({ length: now.getMonth() + 1 }, (_, monthIndex) => monthIndex)
}

export function formatAccrualPeriodLabel(year: number, monthIndexes: number[]) {
  const uniqueMonths = Array.from(new Set(monthIndexes)).sort((left, right) => left - right)

  if (uniqueMonths.length === 0) {
    return ""
  }

  if (uniqueMonths.length === 1) {
    return `${MONTH_NAMES[uniqueMonths[0]]} ${year}`
  }

  const isContiguous = uniqueMonths.every((monthIndex, index) => {
    if (index === 0) {
      return true
    }

    return monthIndex === uniqueMonths[index - 1] + 1
  })

  if (isContiguous) {
    return `${MONTH_NAMES[uniqueMonths[0]]} - ${MONTH_NAMES[uniqueMonths.at(-1) ?? uniqueMonths[0]]} ${year}`
  }

  return `${uniqueMonths.map((monthIndex) => MONTH_NAMES[monthIndex]).join(" + ")} ${year}`
}

function buildDetailServiceLabel(input: {
  vendorName: string
  description: string | null | undefined
  team: string | null | undefined
  pillar: string | null | undefined
  year: number
  monthIndex: number
}) {
  const serviceName =
    input.description?.trim() ||
    input.team?.trim() ||
    input.pillar?.trim() ||
    "External service"

  return `${serviceName} ${MONTH_NAMES[input.monthIndex]} ${input.year}`
}

function hasActualForMonth(input: {
  actualAmount: number | null | undefined
  actualAmountRaw: number | null | undefined
  actualCurrency: "DKK" | "EUR" | "USD"
  exchangeRates: ExchangeRate[]
}) {
  if (input.actualAmountRaw !== null && input.actualAmountRaw !== undefined) {
    const exchangeRateLookup = buildExchangeRateLookup(input.exchangeRates)
    return (
      convertAmountToDkk(
        input.actualAmountRaw,
        input.actualCurrency,
        exchangeRateLookup
      ).amountDkk > 0
    )
  }

  return (input.actualAmount ?? 0) > 0
}

function buildSummaryItemService(
  vendorName: string,
  details: AccrualDetailLine[],
  year: number
) {
  const uniqueServices = Array.from(
    new Set(
      details
        .map((detail) => detail.serviceLabel.trim())
        .filter((value) => value.length > 0)
    )
  )

  if (uniqueServices.length === 1) {
    return uniqueServices[0]
  }

  return `${vendorName} ${formatAccrualPeriodLabel(
    year,
    details.map((detail) => detail.monthIndex)
  )}`.trim()
}

export function buildAccrualsPageModel({
  year,
  seats,
  assumptions,
  exchangeRates,
  accountMappings,
  filters,
  submittedBy,
  now = new Date(),
}: BuildAccrualsPageModelInput) {
  const assumptionLookup = buildCostAssumptionLookup(assumptions)
  const eligibleMonthIndexes = getEligibleAccrualMonthIndexes(year, now)
  const requestedMonthIndexes = filters.months
    .map(resolveMonthIndex)
    .filter((monthIndex): monthIndex is number => monthIndex !== null)
  const filteredMonthIndexes =
    requestedMonthIndexes.length > 0
      ? eligibleMonthIndexes.filter((monthIndex) => requestedMonthIndexes.includes(monthIndex))
      : eligibleMonthIndexes
  const mappedSeats = seats
    .map((seat) => {
      const effectiveSeat = getEffectiveSeat(seat)
      const metrics = deriveSeatMetrics(seat, assumptionLookup, exchangeRates, year)

      return {
        seat,
        effectiveSeat,
        metrics,
        isEligibleExternal: isExternalSeat(effectiveSeat),
      }
    })
    .filter((entry) => entry.isEligibleExternal)

  const baseDetailLines = mappedSeats.flatMap((entry) => {
    const vendorName = entry.effectiveSeat.vendor?.trim() || "Unassigned vendor"

    return filteredMonthIndexes.flatMap((monthIndex) => {
      const month = entry.seat.months.find((item) => item.monthIndex === monthIndex)
      const amountDkk = entry.metrics.monthlyForecast[monthIndex] ?? 0

      if (!month || amountDkk <= 0 || month.forecastIncluded === false) {
        return []
      }

      if (
        hasActualForMonth({
          actualAmount: month.actualAmount,
          actualAmountRaw: month.actualAmountRaw,
          actualCurrency: month.actualCurrency,
          exchangeRates,
        })
      ) {
        return []
      }

      return [
        {
          id: `${entry.seat.id}-${monthIndex}`,
          trackerSeatId: entry.seat.id,
          seatId: entry.effectiveSeat.seatId,
          domain: entry.effectiveSeat.domain,
          pillar: entry.effectiveSeat.pillar || entry.effectiveSeat.subDomain,
          projectCode: entry.effectiveSeat.projectCode,
          departmentCode: entry.effectiveSeat.costCenter,
          departmentName: entry.effectiveSeat.domain,
          vendorName,
          account: resolveAccrualAccount(entry.effectiveSeat.resourceType, accountMappings),
          resourceType: entry.effectiveSeat.resourceType,
          team: entry.effectiveSeat.team,
          inSeat: entry.effectiveSeat.inSeat,
          description: entry.effectiveSeat.description,
          periodLabel: formatAccrualPeriodLabel(year, [monthIndex]),
          serviceLabel: buildDetailServiceLabel({
            vendorName,
            description: entry.effectiveSeat.description,
            team: entry.effectiveSeat.team,
            pillar: entry.effectiveSeat.pillar || entry.effectiveSeat.subDomain,
            year,
            monthIndex,
          }),
          monthIndex,
          amountDkk,
        } satisfies AccrualDetailLine,
      ]
    })
  })

  const resolvedFilters = {
    domain: filters.domain.trim(),
    pillar: filters.pillar.trim(),
    months: filters.months.filter((month) => {
      const monthIndex = resolveMonthIndex(month)
      return monthIndex !== null && filteredMonthIndexes.includes(monthIndex)
    }),
  }

  const domainOptions = collectSortedValues(baseDetailLines.map((detail) => detail.domain))
  const pillarsByDomain = Object.fromEntries(
    domainOptions.map((domain) => [
      domain,
      collectSortedValues(
        baseDetailLines
          .filter((detail) => normalizeValue(detail.domain) === normalizeValue(domain))
          .map((detail) => detail.pillar)
      ),
    ])
  )
  const allPillarOptions = collectSortedValues(baseDetailLines.map((detail) => detail.pillar))

  const detailLines = baseDetailLines.filter((detail) => {
    if (
      resolvedFilters.domain &&
      normalizeValue(detail.domain) !== normalizeValue(resolvedFilters.domain)
    ) {
      return false
    }

    if (
      resolvedFilters.pillar &&
      normalizeValue(detail.pillar) !== normalizeValue(resolvedFilters.pillar)
    ) {
      return false
    }

    return true
  })

  const summaryGroups = detailLines.reduce<Map<string, AccrualDetailLine[]>>((groups, detail) => {
    const key = [
      normalizeValue(detail.departmentCode),
      normalizeValue(detail.vendorName),
      normalizeValue(detail.account),
      normalizeValue(detail.pillar),
    ].join("::")

    groups.set(key, [...(groups.get(key) ?? []), detail])
    return groups
  }, new Map())

  const summaryRows = Array.from(summaryGroups.entries())
    .map(([groupKey, details]) => {
      const first = details[0]
      const periodLabel = formatAccrualPeriodLabel(
        year,
        details.map((detail) => detail.monthIndex)
      )

      return {
        id: groupKey,
        departmentName: first.departmentName || "Unmapped department",
        departmentCode: first.departmentCode || "",
        costType: "OPEX",
        account: first.account,
        amountDkk: details.reduce((sum, detail) => sum + detail.amountDkk, 0),
        projectNumber: "",
        vendorName: first.vendorName,
        itemService: buildSummaryItemService(first.vendorName, details, year),
        periodLabel,
        submittedBy,
        invoiceNumber: "",
        domain: first.domain,
        pillar: first.pillar,
        projectCode: first.projectCode,
        detailCount: details.length,
        details: details.sort((left, right) => {
          if (left.monthIndex !== right.monthIndex) {
            return left.monthIndex - right.monthIndex
          }

          return left.vendorName.localeCompare(right.vendorName)
        }),
      } satisfies AccrualSummaryRow
    })
    .sort((left, right) => {
      return (
        left.vendorName.localeCompare(right.vendorName) ||
        left.departmentCode.localeCompare(right.departmentCode) ||
        left.account.localeCompare(right.account)
      )
    })

  return {
    filters: resolvedFilters,
    detailLines,
    summaryRows,
    filterOptions: {
      domains: domainOptions,
      pillars:
        resolvedFilters.domain && pillarsByDomain[resolvedFilters.domain]
          ? pillarsByDomain[resolvedFilters.domain]
          : allPillarOptions,
      pillarsByDomain,
      months: eligibleMonthIndexes.map((monthIndex) => MONTH_NAMES[monthIndex]),
    },
    totals: {
      amountDkk: summaryRows.reduce((sum, row) => sum + row.amountDkk, 0),
      vendorCount: summaryRows.length,
      detailCount: detailLines.length,
      includedMonthLabels: filteredMonthIndexes.map((monthIndex) => MONTH_NAMES[monthIndex]),
    },
  }
}
