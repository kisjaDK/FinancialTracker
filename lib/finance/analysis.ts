import { prisma } from "@/lib/prisma"
import { getBudgetAreaSummary, getTrackerDetail } from "@/lib/finance/queries"
import type { AppViewer } from "@/lib/authz"

type SummaryRow = Awaited<ReturnType<typeof getBudgetAreaSummary>>[number]
type DetailSeat = Awaited<ReturnType<typeof getTrackerDetail>>[number]
type TrackingYearOption = Awaited<
  ReturnType<typeof prisma.trackingYear.findMany>
>[number]

export type BudgetOutlookSummaryInput = Pick<
  SummaryRow,
  | "id"
  | "displayName"
  | "domain"
  | "subDomain"
  | "projectCode"
  | "budget"
  | "amountGivenBudget"
  | "financeViewBudget"
  | "spentToDate"
  | "remainingBudget"
  | "totalForecast"
  | "forecastRemaining"
  | "permBudget"
  | "extBudget"
  | "amsBudget"
  | "permForecast"
  | "extForecast"
  | "amsForecast"
  | "cloudCostSpentToDate"
  | "cloudCostTarget"
  | "cloudCostForecast"
  | "seatCount"
  | "activeSeatCount"
  | "openSeatCount"
>

export type BudgetOutlookSeatInput = {
  seatId: string
  inSeat: string | null
  description: string | null | undefined
  team: string | null
  status: string | null
  resourceType: string | null
  permFte: number
  extFte: number
  amsFte: number
  totalSpent: number
  totalForecast: number
  hasForecastAdjustments: boolean
  monthlyForecast: number[]
  months: Array<{
    monthIndex: number
    actualAmountDkk: number
    actualAmountRaw: number | null
  }>
}

export type BudgetOutlookDriverDirection = "favorable" | "unfavorable" | "neutral"

export type BudgetOutlookDriverSignal = {
  key: string
  title: string
  direction: BudgetOutlookDriverDirection
  impactValue: number
  amount: number | null
  share: number | null
  detail: string
}

export type BudgetOutlookTopSeat = {
  seatId: string
  label: string
  totalForecast: number
  share: number
}

export type DeterministicBudgetOutlookFacts = {
  scope: {
    year: number
    summaryKey: string
    displayName: string
    domain: string | null
    subDomain: string | null
    projectCode: string | null
  }
  summary: {
    budget: number
    amountGivenBudget: number
    financeViewBudget: number
    spentToDate: number
    remainingBudget: number
    totalForecast: number
    forecastRemaining: number
    permBudget: number
    extBudget: number
    amsBudget: number
    permForecast: number
    extForecast: number
    amsForecast: number
    cloudCostSpentToDate: number
    cloudCostTarget: number
    cloudCostForecast: number
    permSpent: number
    extSpent: number
    amsSpent: number
    cloudSpent: number
    seatCount: number
    activeSeatCount: number
    openSeatCount: number
  }
  staffing: {
    activeSeatShare: number
    openSeatShare: number
    openSeatForecast: number
    externalForecastShare: number
    permForecastShare: number
  }
  coverage: {
    seatsWithForecastAdjustments: number
    forecastMonthsWithoutActuals: number
    uncoveredForecastAmount: number
  }
  resourceMix: {
    cloudForecastShare: number
    topResourceTypes: Array<{
      resourceType: string
      forecast: number
      share: number
    }>
  }
  concentration: {
    topForecastSeats: BudgetOutlookTopSeat[]
    topThreeForecastShare: number
    topThreeForecastAmount: number
    concentrationForecastTotal: number
  }
  drivers: BudgetOutlookDriverSignal[]
}

export type BudgetOutlookPageData = {
  activeYear: number
  trackingYears: TrackingYearOption[]
  summaryOptions: SummaryRow[]
  selectedSummaryKey: string | null
  initialFacts: DeterministicBudgetOutlookFacts | null
}

function normalizeValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ""
}

function normalizeLabel(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim()
  return trimmed || fallback
}

function isExternalOrAmsSeat(seat: Pick<BudgetOutlookSeatInput, "resourceType" | "extFte" | "amsFte">) {
  if ((seat.amsFte ?? 0) > 0 || isAmsResourceType(seat.resourceType)) {
    return true
  }

  if ((seat.extFte ?? 0) > 0) {
    return true
  }

  const normalizedResourceType = normalizeValue(seat.resourceType)
  return (
    normalizedResourceType.includes("external") ||
    normalizedResourceType.includes("managed service") ||
    normalizedResourceType.includes("managed services") ||
    normalizedResourceType.includes("ams")
  )
}

function isCloudResourceType(resourceType: string | null | undefined) {
  return normalizeValue(resourceType) === "cloud"
}

function isAmsResourceType(resourceType: string | null | undefined) {
  const normalizedResourceType = normalizeValue(resourceType)
  return (
    normalizedResourceType.includes("managed service") ||
    normalizedResourceType.includes("managed services") ||
    normalizedResourceType.includes("ams")
  )
}

function isAmsSeat(seat: Pick<BudgetOutlookSeatInput, "resourceType" | "amsFte">) {
  return (seat.amsFte ?? 0) > 0 || isAmsResourceType(seat.resourceType)
}

function isExtSeat(seat: Pick<BudgetOutlookSeatInput, "extFte">) {
  return (seat.extFte ?? 0) > 0
}

function isPermSeat(seat: Pick<BudgetOutlookSeatInput, "permFte">) {
  return (seat.permFte ?? 0) > 0
}

function buildTopForecastSeats(
  seats: BudgetOutlookSeatInput[],
  totalForecast: number
): BudgetOutlookTopSeat[] {
  return [...seats]
    .sort((left, right) => right.totalForecast - left.totalForecast)
    .slice(0, 3)
    .map((seat) => ({
      seatId: seat.seatId,
      label:
        seat.inSeat?.trim() ||
        seat.description?.trim() ||
        seat.team?.trim() ||
        seat.seatId,
      totalForecast: seat.totalForecast,
      share: totalForecast > 0 ? seat.totalForecast / totalForecast : 0,
    }))
}

function buildResourceTypeBreakdown(
  seats: BudgetOutlookSeatInput[],
  totalForecast: number
) {
  const totals = new Map<string, number>()

  for (const seat of seats) {
    const key = normalizeLabel(seat.resourceType, "Unspecified")
    totals.set(key, (totals.get(key) ?? 0) + seat.totalForecast)
  }

  return Array.from(totals.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([resourceType, forecast]) => ({
      resourceType,
      forecast,
      share: totalForecast > 0 ? forecast / totalForecast : 0,
    }))
}

function buildCategoryPerformanceSignals(input: {
  year: number
  asOfDate: Date
  summary: DeterministicBudgetOutlookFacts["summary"]
}) {
  const { year, asOfDate, summary } = input
  const currentYear = asOfDate.getFullYear()
  const currentMonthIndex = asOfDate.getMonth()
  const elapsedRatio =
    year < currentYear ? 1 : year > currentYear ? 0 : (currentMonthIndex + 1) / 12

  const categories = [
    {
      key: "perm-performance",
      title: "PERM performance",
      budget: summary.permBudget,
      spent: summary.permSpent,
      forecast: summary.permForecast,
    },
    {
      key: "ext-performance",
      title: "EXT performance",
      budget: summary.extBudget,
      spent: summary.extSpent,
      forecast: summary.extForecast,
    },
    {
      key: "ams-performance",
      title: "AMS performance",
      budget: summary.amsBudget,
      spent: summary.amsSpent,
      forecast: summary.amsForecast,
    },
    {
      key: "cloud-performance",
      title: "Cloud performance",
      budget: summary.cloudCostTarget,
      spent: summary.cloudSpent,
      forecast: summary.cloudCostForecast,
    },
  ] satisfies Array<{
    key: string
    title: string
    budget: number
    spent: number
    forecast: number
  }>

  return categories
    .filter((category) => category.budget > 0 || category.spent > 0 || category.forecast > 0)
    .map((category) => {
      const pacedBudget = category.budget * elapsedRatio
      const spentVsPace = category.spent - pacedBudget
      const forecastDelta = category.forecast - category.budget
      const direction =
        forecastDelta > 0 ? "unfavorable" : forecastDelta < 0 ? "favorable" : "neutral"
      const ytdDetail =
        elapsedRatio > 0
          ? `Spent to date is ${formatCurrencyForDetail(category.spent)} versus paced budget ${formatCurrencyForDetail(pacedBudget)}.`
          : "No year-to-date spend window is expected yet for this period."
      const projectionDetail =
        forecastDelta > 0
          ? `Projected year-end is ${formatCurrencyForDetail(category.forecast)}, above budget by ${formatCurrencyForDetail(Math.abs(forecastDelta))}.`
          : forecastDelta < 0
            ? `Projected year-end is ${formatCurrencyForDetail(category.forecast)}, below budget by ${formatCurrencyForDetail(Math.abs(forecastDelta))}.`
            : `Projected year-end is ${formatCurrencyForDetail(category.forecast)}, matching budget.`

      return {
        key: category.key,
        title: category.title,
        direction,
        impactValue: Math.max(Math.abs(forecastDelta), Math.abs(spentVsPace)),
        amount: forecastDelta,
        share: category.budget > 0 ? Math.abs(forecastDelta) / category.budget : null,
        detail: `${ytdDetail} ${projectionDetail}`,
      } satisfies BudgetOutlookDriverSignal
    })
}

function formatCurrencyForDetail(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "DKK",
    maximumFractionDigits: 0,
  }).format(value)
}

function buildDriverSignals(input: {
  year: number
  asOfDate: Date
  summary: BudgetOutlookSummaryInput
  bucketSpentTotals: {
    permSpent: number
    extSpent: number
    amsSpent: number
    cloudSpent: number
  }
  openSeatForecast: number
  uncoveredForecastAmount: number
  topThreeForecastShare: number
  topThreeForecastAmount: number
  concentrationForecastTotal: number
  topResourceTypes: Array<{ resourceType: string; forecast: number; share: number }>
}) {
  const summary = input.summary
  const signals: BudgetOutlookDriverSignal[] = []
  const forecastGap = summary.totalForecast - summary.budget
  const financeAdjustmentDelta = summary.financeViewBudget - summary.amountGivenBudget
  const summaryForCategorySignals: DeterministicBudgetOutlookFacts["summary"] = {
    budget: summary.budget,
    amountGivenBudget: summary.amountGivenBudget,
    financeViewBudget: summary.financeViewBudget,
    spentToDate: summary.spentToDate,
    remainingBudget: summary.remainingBudget,
    totalForecast: summary.totalForecast,
    forecastRemaining: summary.forecastRemaining,
    permBudget: summary.permBudget,
    extBudget: summary.extBudget,
    amsBudget: summary.amsBudget,
    permForecast: summary.permForecast,
    extForecast: summary.extForecast,
    amsForecast: summary.amsForecast,
    cloudCostSpentToDate: summary.cloudCostSpentToDate,
    cloudCostTarget: summary.cloudCostTarget,
    cloudCostForecast: summary.cloudCostForecast,
    permSpent: 0,
    extSpent: 0,
    amsSpent: 0,
    cloudSpent: 0,
    seatCount: summary.seatCount,
    activeSeatCount: summary.activeSeatCount,
    openSeatCount: summary.openSeatCount,
  }

  signals.push({
    key: "forecast-gap",
    title: "Forecast vs budget",
    direction:
      forecastGap > 0 ? "unfavorable" : forecastGap < 0 ? "favorable" : "neutral",
    impactValue: Math.abs(forecastGap),
    amount: forecastGap,
    share: summary.budget > 0 ? Math.abs(forecastGap) / summary.budget : null,
    detail:
      forecastGap > 0
        ? "Forecast is above finance-view budget."
        : forecastGap < 0
          ? "Forecast is below finance-view budget."
          : "Forecast matches finance-view budget.",
  })

  if (financeAdjustmentDelta !== 0) {
    signals.push({
      key: "finance-adjustment-delta",
      title: "Finance-view budget adjustments",
      direction: financeAdjustmentDelta > 0 ? "favorable" : "unfavorable",
      impactValue: Math.abs(financeAdjustmentDelta),
      amount: financeAdjustmentDelta,
      share:
        summary.financeViewBudget > 0
          ? Math.abs(financeAdjustmentDelta) / summary.financeViewBudget
          : null,
      detail:
        financeAdjustmentDelta > 0
          ? "Finance-view budget exceeds amount-given budget."
          : "Finance-view budget is below amount-given budget.",
    })
  }

  if (input.openSeatForecast > 0 || summary.openSeatCount > 0) {
    signals.push({
      key: "open-seat-load",
      title: "Open-seat forecast load",
      direction: "unfavorable",
      impactValue: input.openSeatForecast,
      amount: input.openSeatForecast,
      share:
        summary.totalForecast > 0 ? input.openSeatForecast / summary.totalForecast : null,
      detail: "Open seats still carry forecast and execution risk.",
    })
  }

  if (summary.extForecast > 0) {
    const share = summary.totalForecast > 0 ? summary.extForecast / summary.totalForecast : 0
    signals.push({
      key: "external-mix",
      title: "External spend mix",
      direction: share >= 0.4 ? "unfavorable" : "neutral",
      impactValue: summary.extForecast,
      amount: summary.extForecast,
      share,
      detail: "External forecast share may increase delivery and cost pressure.",
    })
  }

  if (summary.cloudCostForecast > 0) {
    const share =
      summary.totalForecast > 0 ? summary.cloudCostForecast / summary.totalForecast : 0
    signals.push({
      key: "cloud-concentration",
      title: "Cloud cost concentration",
      direction: share >= 0.35 ? "unfavorable" : "neutral",
      impactValue: summary.cloudCostForecast,
      amount: summary.cloudCostForecast,
      share,
      detail: "Cloud-related forecast makes up a material share of the outlook.",
    })
  }

  if (input.uncoveredForecastAmount > 0) {
    signals.push({
      key: "actuals-coverage-gap",
      title: "Actuals coverage gap",
      direction: "unfavorable",
      impactValue: input.uncoveredForecastAmount,
      amount: input.uncoveredForecastAmount,
      share:
        summary.totalForecast > 0
          ? input.uncoveredForecastAmount / summary.totalForecast
          : null,
      detail: "Remaining forecast still depends on months without actuals recorded.",
    })
  }

  if (input.topThreeForecastShare > 0) {
    const topResourceType = input.topResourceTypes[0]
    signals.push({
      key: "forecast-concentration",
      title: "Seat-level forecast concentration",
      direction: input.topThreeForecastShare >= 0.6 ? "unfavorable" : "neutral",
      impactValue: input.topThreeForecastAmount,
      amount: input.topThreeForecastAmount,
      share: input.topThreeForecastShare,
      detail: topResourceType
        ? `The top external and AMS seats, led by ${topResourceType.resourceType}, account for a large share of external and AMS forecast spend.`
        : "The top external and AMS seats account for a large share of external and AMS forecast spend.",
    })
  }

  signals.push(
    ...buildCategoryPerformanceSignals({
      year: input.year,
      asOfDate: input.asOfDate,
      summary: {
        ...summaryForCategorySignals,
        permSpent: input.bucketSpentTotals.permSpent,
        extSpent: input.bucketSpentTotals.extSpent,
        amsSpent: input.bucketSpentTotals.amsSpent,
        cloudSpent: input.bucketSpentTotals.cloudSpent,
      },
    })
  )

  return signals
    .filter((signal) => signal.impactValue > 0)
    .sort((left, right) => right.impactValue - left.impactValue)
    .slice(0, 12)
}

export function buildBudgetOutlookFactsFromData(input: {
  year: number
  summary: BudgetOutlookSummaryInput
  seats: BudgetOutlookSeatInput[]
  asOfDate?: Date
}): DeterministicBudgetOutlookFacts {
  const { summary, seats, year } = input
  const asOfDate = input.asOfDate ?? new Date()
  const totalForecast = summary.totalForecast
  const concentrationSeats = seats.filter((seat) => isExternalOrAmsSeat(seat))
  const concentrationForecastTotal = concentrationSeats.reduce(
    (sum, seat) => sum + seat.totalForecast,
    0
  )
  const topForecastSeats = buildTopForecastSeats(
    concentrationSeats,
    concentrationForecastTotal
  )
  const topThreeForecastShare = topForecastSeats.reduce(
    (sum, seat) => sum + seat.share,
    0
  )
  const topThreeForecastAmount = topForecastSeats.reduce(
    (sum, seat) => sum + seat.totalForecast,
    0
  )
  const topResourceTypes = buildResourceTypeBreakdown(seats, totalForecast)
  const concentrationResourceTypes = buildResourceTypeBreakdown(
    concentrationSeats,
    concentrationForecastTotal
  )
  const openSeatForecast = seats
    .filter((seat) => normalizeValue(seat.status) === "open")
    .reduce((sum, seat) => sum + seat.totalForecast, 0)
  const bucketSpentTotals = seats.reduce(
    (totals, seat) => {
      if (isCloudResourceType(seat.resourceType)) {
        totals.cloudSpent += seat.totalSpent
      } else if (isAmsSeat(seat)) {
        totals.amsSpent += seat.totalSpent
      } else if (isExtSeat(seat)) {
        totals.extSpent += seat.totalSpent
      } else if (isPermSeat(seat)) {
        totals.permSpent += seat.totalSpent
      }

      return totals
    },
    {
      permSpent: 0,
      extSpent: 0,
      amsSpent: 0,
      cloudSpent: 0,
    }
  )

  let forecastMonthsWithoutActuals = 0
  let uncoveredForecastAmount = 0
  let seatsWithForecastAdjustments = 0
  const currentYear = asOfDate.getFullYear()
  const currentMonthIndex = asOfDate.getMonth()
  const lastCoveredMonthIndex =
    year < currentYear ? 11 : year === currentYear ? currentMonthIndex - 1 : -1

  for (const seat of seats) {
    if (seat.hasForecastAdjustments) {
      seatsWithForecastAdjustments += 1
    }

    for (const month of seat.months) {
      if (month.monthIndex > lastCoveredMonthIndex) {
        continue
      }

      const monthForecast = seat.monthlyForecast[month.monthIndex] ?? 0
      const actualAmount = month.actualAmountRaw ?? month.actualAmountDkk ?? 0
      if (monthForecast > 0 && actualAmount <= 0) {
        forecastMonthsWithoutActuals += 1
        uncoveredForecastAmount += monthForecast
      }
    }
  }

  const drivers = buildDriverSignals({
    year,
    asOfDate,
    summary,
    bucketSpentTotals,
    openSeatForecast,
    uncoveredForecastAmount,
    topThreeForecastShare,
    topThreeForecastAmount,
    concentrationForecastTotal,
    topResourceTypes: concentrationResourceTypes,
  })

  return {
    scope: {
      year,
      summaryKey: summary.id,
      displayName: summary.displayName,
      domain: summary.domain,
      subDomain: summary.subDomain,
      projectCode: summary.projectCode,
    },
    summary: {
      budget: summary.budget,
      amountGivenBudget: summary.amountGivenBudget,
      financeViewBudget: summary.financeViewBudget,
      spentToDate: summary.spentToDate,
      remainingBudget: summary.remainingBudget,
      totalForecast: summary.totalForecast,
      forecastRemaining: summary.forecastRemaining,
      permBudget: summary.permBudget,
      extBudget: summary.extBudget,
      amsBudget: summary.amsBudget,
      permForecast: summary.permForecast,
      extForecast: summary.extForecast,
      amsForecast: summary.amsForecast,
      cloudCostSpentToDate: summary.cloudCostSpentToDate,
      cloudCostTarget: summary.cloudCostTarget,
      cloudCostForecast: summary.cloudCostForecast,
      permSpent: bucketSpentTotals.permSpent,
      extSpent: bucketSpentTotals.extSpent,
      amsSpent: bucketSpentTotals.amsSpent,
      cloudSpent: bucketSpentTotals.cloudSpent,
      seatCount: summary.seatCount,
      activeSeatCount: summary.activeSeatCount,
      openSeatCount: summary.openSeatCount,
    },
    staffing: {
      activeSeatShare: summary.seatCount > 0 ? summary.activeSeatCount / summary.seatCount : 0,
      openSeatShare: summary.seatCount > 0 ? summary.openSeatCount / summary.seatCount : 0,
      openSeatForecast,
      externalForecastShare: totalForecast > 0 ? summary.extForecast / totalForecast : 0,
      permForecastShare: totalForecast > 0 ? summary.permForecast / totalForecast : 0,
    },
    coverage: {
      seatsWithForecastAdjustments,
      forecastMonthsWithoutActuals,
      uncoveredForecastAmount,
    },
    resourceMix: {
      cloudForecastShare: totalForecast > 0 ? summary.cloudCostForecast / totalForecast : 0,
      topResourceTypes,
    },
    concentration: {
      topForecastSeats,
      topThreeForecastShare,
      topThreeForecastAmount,
      concentrationForecastTotal,
    },
    drivers,
  }
}

export async function getBudgetOutlookFacts(
  year: number,
  summaryKey: string,
  viewer?: Pick<AppViewer, "role" | "scopes">
) {
  const summaryRows = await getBudgetAreaSummary(year, undefined, undefined, viewer)
  const summary = summaryRows.find((row) => row.id === summaryKey)

  if (!summary) {
    throw new Error("Selected summary row was not found.")
  }

  const seats = await getTrackerDetail(year, summary.id, undefined, viewer)
  return buildBudgetOutlookFactsFromData({
    year,
    summary,
    seats: seats.map((seat) => ({
      seatId: seat.seatId,
      inSeat: seat.inSeat,
      description: seat.description,
      team: seat.team,
      status: seat.status,
      resourceType: seat.resourceType,
      permFte: seat.permFte,
      extFte: seat.extFte,
      amsFte: seat.amsFte,
      totalSpent: seat.totalSpent,
      totalForecast: seat.totalForecast,
      hasForecastAdjustments: seat.hasForecastAdjustments,
      monthlyForecast: seat.monthlyForecast,
      months: seat.months.map((month) => ({
        monthIndex: month.monthIndex,
        actualAmountDkk: month.actualAmountDkk,
        actualAmountRaw: month.actualAmountRaw,
      })),
    })),
  })
}

export async function getBudgetOutlookPageData(
  year?: number,
  selectedSummaryKey?: string | null,
  viewer?: Pick<AppViewer, "role" | "scopes">
): Promise<BudgetOutlookPageData> {
  const trackingYears = await prisma.trackingYear.findMany({
    orderBy: { year: "asc" },
  })

  const activeYear =
    year ??
    trackingYears.find((trackingYear) => trackingYear.isActive)?.year ??
    trackingYears.at(-1)?.year ??
    new Date().getFullYear()

  const summaryOptions = await getBudgetAreaSummary(activeYear, undefined, undefined, viewer)
  const resolvedSummaryKey =
    (selectedSummaryKey &&
      summaryOptions.some((option) => option.id === selectedSummaryKey) &&
      selectedSummaryKey) ||
    summaryOptions[0]?.id ||
    null

  return {
    activeYear,
    trackingYears,
    summaryOptions,
    selectedSummaryKey: resolvedSummaryKey,
    initialFacts: resolvedSummaryKey
      ? await getBudgetOutlookFacts(activeYear, resolvedSummaryKey, viewer)
      : null,
  }
}
