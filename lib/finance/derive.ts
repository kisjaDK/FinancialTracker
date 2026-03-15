import type { CostAssumption, ExchangeRate, TrackerOverride } from "@prisma/client"
import { buildExchangeRateLookup, convertAmountToDkk } from "@/lib/finance/currency"
import {
  MONTH_NAMES,
  WORK_DAYS_PER_MONTH,
  WORK_DAYS_PER_YEAR,
} from "@/lib/finance/constants"
import type { CostAssumptionLookup, SeatDerivedMetrics, SeatWithRelations } from "@/lib/finance/types"

function normalizeValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ""
}

export function isCancelledSeat(
  seat: Pick<SeatWithRelations, "status"> | Pick<ReturnType<typeof getEffectiveSeat>, "status">
) {
  const normalizedStatus = normalizeValue(seat.status)
  return (
    normalizedStatus === "cancelled" ||
    normalizedStatus.startsWith("cancelled-")
  )
}

function isClosedSeat(
  seat: Pick<SeatWithRelations, "status"> | Pick<ReturnType<typeof getEffectiveSeat>, "status">
) {
  return normalizeValue(seat.status) === "closed"
}

function normalizeBandValue(value: string | null | undefined) {
  const normalized = normalizeValue(value)
  return normalized.startsWith("band ") ? normalized.slice(5) : normalized
}

function lookupAssumption(
  assumptions: CostAssumptionLookup,
  band: string | null | undefined,
  location: string | null | undefined
) {
  return assumptions[`${normalizeBandValue(band)}::${normalizeValue(location)}`]
}

export function buildCostAssumptionLookup(assumptions: CostAssumption[]) {
  return assumptions.reduce<CostAssumptionLookup>((accumulator, assumption) => {
    accumulator[
      `${normalizeBandValue(assumption.band)}::${normalizeValue(assumption.location)}`
    ] = assumption

    return accumulator
  }, {})
}

function applyOverrideValue<T>(baseValue: T, overrideValue: T | null | undefined) {
  if (overrideValue === null || overrideValue === undefined) {
    return baseValue
  }

  if (typeof overrideValue === "string" && overrideValue.trim().length === 0) {
    return baseValue
  }

  return overrideValue
}

export function getEffectiveSeat(
  seat: SeatWithRelations,
  override: TrackerOverride | null = seat.override
) {
  return {
    ...seat,
    domain: applyOverrideValue(seat.domain, override?.domain),
    subDomain: applyOverrideValue(seat.subDomain, override?.subDomain),
    funding: applyOverrideValue(seat.funding, override?.funding),
    pillar: applyOverrideValue(seat.pillar, override?.pillar),
    budgetAreaId: applyOverrideValue(seat.budgetAreaId, override?.budgetAreaId),
    costCenter: applyOverrideValue(seat.costCenter, override?.costCenter),
    projectCode: applyOverrideValue(seat.projectCode, override?.projectCode),
    resourceType: applyOverrideValue(seat.resourceType, override?.resourceType),
    ritm: applyOverrideValue(seat.ritm, override?.ritm),
    sow: applyOverrideValue(seat.sow, override?.sow),
    spendPlanId: applyOverrideValue(seat.spendPlanId, override?.spendPlanId),
    status: applyOverrideValue(seat.status, override?.status),
    allocation: applyOverrideValue(seat.allocation, override?.allocation) ?? 0,
    startDate: applyOverrideValue(seat.startDate, override?.startDate),
    endDate: applyOverrideValue(seat.endDate, override?.endDate),
    notes: applyOverrideValue(seat.notes, override?.notes),
  }
}

export function isExternalSeat(seat: SeatWithRelations | ReturnType<typeof getEffectiveSeat>) {
  const band = normalizeValue(seat.band)
  const resourceType = normalizeValue(seat.resourceType)
  const vendor = normalizeValue(seat.vendor)
  const hasExternalVendor =
    vendor.length > 0 &&
    vendor !== "internal" &&
    vendor !== "employee" &&
    vendor !== "permanent"

  return (
    band === "external" ||
    resourceType.includes("external") ||
    resourceType.includes("managed services") ||
    hasExternalVendor
  )
}

export function monthLabel(year: number, monthIndex: number) {
  return `${MONTH_NAMES[monthIndex]}-${String(year).slice(-2)}`
}

export function isMonthActiveForSeat(
  targetYear: number,
  monthIndex: number,
  startDate: Date | null | undefined,
  endDate: Date | null | undefined
) {
  if (
    startDate &&
    endDate &&
    startDate.getTime() === endDate.getTime()
  ) {
    return false
  }

  const monthStart = new Date(targetYear, monthIndex, 1)
  const monthEnd = new Date(targetYear, monthIndex + 1, 0)

  if (startDate && startDate > monthEnd) {
    return false
  }

  if (endDate && endDate < monthStart) {
    return false
  }

  return true
}

export function hasActualSpend(
  seat: Pick<SeatWithRelations, "months">,
  exchangeRates: ExchangeRate[]
) {
  const exchangeRateLookup = buildExchangeRateLookup(exchangeRates)

  return seat.months.some((month) => {
    const amount =
      month.actualAmountRaw !== null && month.actualAmountRaw !== undefined
        ? convertAmountToDkk(
            month.actualAmountRaw,
            month.actualCurrency,
            exchangeRateLookup
          ).amountDkk
        : (month.actualAmount ?? 0)

    return amount > 0
  })
}

export function isTrackerCancelledSeat(
  seat: Pick<SeatWithRelations, "status" | "months">,
  effectiveSeat: Pick<ReturnType<typeof getEffectiveSeat>, "status">,
  exchangeRates: ExchangeRate[]
) {
  return isCancelledSeat(effectiveSeat) || (isClosedSeat(effectiveSeat) && !hasActualSpend(seat, exchangeRates))
}

export function deriveSeatMetrics(
  seat: SeatWithRelations,
  assumptions: CostAssumptionLookup,
  exchangeRates: ExchangeRate[],
  targetYear: number
): SeatDerivedMetrics {
  const effectiveSeat = getEffectiveSeat(seat)
  const cancelled = isTrackerCancelledSeat(seat, effectiveSeat, exchangeRates)
  const external = isExternalSeat(effectiveSeat)
  const assumption = lookupAssumption(assumptions, effectiveSeat.band, effectiveSeat.location)
  const allocation = effectiveSeat.allocation ?? 0
  const dailyRate = effectiveSeat.dailyRate ?? 0
  const exchangeRateLookup = buildExchangeRateLookup(exchangeRates)
  const yearlyCostInternal = external ? 0 : (assumption?.yearlyCost ?? 0)
  const internalDailyRate = yearlyCostInternal / WORK_DAYS_PER_YEAR
  const yearlyCostExternal = external ? dailyRate * WORK_DAYS_PER_MONTH * 12 : 0
  const monthsByIndex = new Map(seat.months.map((month) => [month.monthIndex, month]))
  const monthlyBaseForecast = external
    ? dailyRate * allocation * WORK_DAYS_PER_MONTH
    : allocation * WORK_DAYS_PER_MONTH * internalDailyRate
  const monthlyForecast = Array.from({ length: 12 }, (_, monthIndex) => {
    const month = monthsByIndex.get(monthIndex)
    const isActive = isMonthActiveForSeat(
      targetYear,
      monthIndex,
      effectiveSeat.startDate,
      effectiveSeat.endDate
    )

    if (cancelled || !isActive || month?.forecastIncluded === false) {
      return 0
    }

    if (
      month?.forecastOverrideAmount !== null &&
      month?.forecastOverrideAmount !== undefined
    ) {
      return month.forecastOverrideAmount
    }

    return monthlyBaseForecast
  })

  const totalSpent = cancelled
    ? 0
    : seat.months.reduce((sum, month) => {
    const amount =
      month.actualAmountRaw !== null && month.actualAmountRaw !== undefined
        ? convertAmountToDkk(
            month.actualAmountRaw,
            month.actualCurrency,
            exchangeRateLookup
          ).amountDkk
        : (month.actualAmount ?? 0)

    return sum + amount
  }, 0)
  const forecastWithoutActuals = seat.months.reduce((sum, month) => {
    const rawActual = month.actualAmountRaw ?? month.actualAmount ?? 0
    const monthForecast = monthlyForecast[month.monthIndex] ?? 0
    return sum + (rawActual > 0 ? 0 : monthForecast)
  }, 0)
  const activeMonthCount = monthlyForecast.filter((value) => value > 0).length
  const internalPeriodForecast =
    allocation * activeMonthCount * WORK_DAYS_PER_MONTH * internalDailyRate
  const totalForecast = totalSpent + forecastWithoutActuals
  const permFte = external ? 0 : allocation
  const extFte = external ? allocation : 0
  const permForecast = external ? 0 : Math.min(forecastWithoutActuals, internalPeriodForecast)
  const extForecast = external ? forecastWithoutActuals : 0
  const cloudCostForecast = normalizeValue(effectiveSeat.resourceType) === "cloud"
    ? totalForecast
    : 0

  return {
    totalSpent,
    totalForecast,
    yearlyCostInternal,
    yearlyCostExternal,
    permFte,
    extFte,
    permForecast,
    extForecast,
    cloudCostForecast,
    quarterlyForecast: [
      monthlyForecast[0] + monthlyForecast[1] + monthlyForecast[2],
      monthlyForecast[3] + monthlyForecast[4] + monthlyForecast[5],
      monthlyForecast[6] + monthlyForecast[7] + monthlyForecast[8],
      monthlyForecast[9] + monthlyForecast[10] + monthlyForecast[11],
    ],
    monthlyForecast,
  }
}
