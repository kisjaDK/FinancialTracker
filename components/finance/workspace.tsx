"use client"

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { FinanceHeader } from "@/components/finance/header"
import { MultiSelectFilter } from "@/components/finance/multi-select-filter"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCurrency, formatNumber, formatPercent } from "@/lib/finance/format"
import { MONTH_NAMES } from "@/lib/finance/constants"
import type { AppRole } from "@/lib/roles"

type TrackingYearOption = {
  id: string
  year: number
  isActive: boolean
}

type BudgetArea = {
  id: string
  domain: string | null
  subDomain: string | null
  funding: string | null
  pillar: string | null
  costCenter: string
  projectCode: string
  displayName: string | null
}

type SummaryRow = {
  id: string
  domain: string | null
  subDomain: string | null
  funding: string | null
  pillar: string | null
  costCenter: string | null
  projectCode: string | null
  displayName: string
  budget: number
  amountGivenBudget: number
  financeViewBudget: number
  spentToDate: number
  remainingBudget: number
  totalForecast: number
  forecastRemaining: number
  permTarget: number
  permForecast: number
  extForecast: number
  cloudCostTarget: number
  cloudCostForecast: number
  seatCount: number
  activeSeatCount: number
  openSeatCount: number
}

type SeatRow = {
  id: string
  seatId: string
  domain: string | null
  subDomain: string | null
  team: string | null
  inSeat: string | null
  resourceType: string | null
  band: string | null
  location: string | null
  status: string | null
  allocation: number
  totalSpent: number
  totalForecast: number
  yearlyCostInternal: number
  yearlyCostExternal: number
  spendPlanId: string | null
  ritm: string | null
  sow: string | null
  notes: string | null
  startDate?: string | Date | null
  endDate?: string | Date | null
  monthlyForecast: number[]
  months: {
    monthIndex: number
    actualAmountDkk: number
    actualAmountRaw: number | null
    actualCurrency: "DKK" | "EUR" | "USD"
    exchangeRateUsed: number | null
    forecastIncluded: boolean
    notes: string | null
  }[]
}

type WorkspaceProps = {
  userName: string
  userEmail: string
  userRole: AppRole
  activeYear: number
  trackingYears: TrackingYearOption[]
  summary: SummaryRow[]
  seats: SeatRow[]
  budgetAreas: BudgetArea[]
  selectedAreaId: string | null
  statusDefinitions: {
    id: string
    label: string
    isActiveStatus: boolean
    sortOrder: number
  }[]
  trackerTeamFilters: string[]
  trackerTeamOptions: string[]
  missingActualMonthFilters: string[]
  missingActualMonthOptions: readonly string[]
  seatSortField?: string
  seatSortDirection?: string
}

type SeatSortField = "seat" | "resource" | "type" | "alloc"
type SeatSortDirection = "asc" | "desc"

async function fetchJson(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init)
  const body = await response.json()

  if (!response.ok) {
    throw new Error(body.error || "Request failed")
  }

  return body
}

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value))
}

function formatOptionalDate(value: string | Date | null | undefined) {
  return value ? formatDate(value) : "No date"
}

function formatForecastCoverage(seat: SeatRow) {
  const coveredMonths = seat.months
    .filter((month) => {
      const actualAmount = month.actualAmountRaw ?? month.actualAmountDkk ?? 0
      return (seat.monthlyForecast[month.monthIndex] ?? 0) > 0 && actualAmount <= 0
    })
    .map((month) => month.monthIndex)

  if (coveredMonths.length === 0) {
    return "No remaining forecast months"
  }

  const firstMonth = MONTH_NAMES[coveredMonths[0]]
  const lastMonth = MONTH_NAMES[coveredMonths[coveredMonths.length - 1]]

  if (coveredMonths.length === 1) {
    return `${firstMonth} (${coveredMonths.length})`
  }

  return `${firstMonth}-${lastMonth} (${coveredMonths.length})`
}

function sumQuarter(values: number[], quarterIndex: number) {
  const start = quarterIndex * 3
  return values.slice(start, start + 3).reduce((sum, value) => sum + value, 0)
}

function getQuarterlySpent(seat: SeatRow) {
  return Array.from({ length: 4 }, (_, quarterIndex) =>
    sumQuarter(
      Array.from({ length: 12 }, (_, monthIndex) => {
        const month = seat.months.find((entry) => entry.monthIndex === monthIndex)
        return month?.actualAmountDkk ?? 0
      }),
      quarterIndex
    )
  )
}

export function FinanceWorkspace({
  userName,
  userEmail,
  userRole,
  activeYear,
  trackingYears,
  summary,
  seats,
  budgetAreas,
  selectedAreaId,
  statusDefinitions,
  trackerTeamFilters,
  trackerTeamOptions,
  missingActualMonthFilters,
  missingActualMonthOptions,
  seatSortField,
  seatSortDirection,
}: WorkspaceProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const canEditTracker = userRole !== "GUEST"
  const canManageAdminData =
    userRole === "ADMIN" || userRole === "SUPER_ADMIN"
  const [isPending, startTransition] = useTransition()
  const [selectedSeatId, setSelectedSeatId] = useState(seats[0]?.id ?? "")
  const [showSpentQuarterly, setShowSpentQuarterly] = useState(false)
  const [showForecastQuarterly, setShowForecastQuarterly] = useState(false)
  const [overrideValues, setOverrideValues] = useState({
    budgetAreaId: selectedAreaId ?? "",
    spendPlanId: "",
    ritm: "",
    sow: "",
    status: "",
    allocation: "",
    notes: "",
  })

  const summaryTotals = useMemo(
    () =>
      summary.reduce(
        (totals, row) => ({
          budget: totals.budget + row.budget,
          amountGivenBudget: totals.amountGivenBudget + row.amountGivenBudget,
          financeViewBudget: totals.financeViewBudget + row.financeViewBudget,
          spent: totals.spent + row.spentToDate,
          forecast: totals.forecast + row.totalForecast,
          seatCount: totals.seatCount + row.seatCount,
        }),
        {
          budget: 0,
          amountGivenBudget: 0,
          financeViewBudget: 0,
          spent: 0,
          forecast: 0,
          seatCount: 0,
        }
      ),
    [summary]
  )

  const activeSeatSortField: SeatSortField | null =
    seatSortField === "seat" ||
    seatSortField === "resource" ||
    seatSortField === "type" ||
    seatSortField === "alloc"
      ? seatSortField
      : null

  const activeSeatSortDirection: SeatSortDirection =
    seatSortDirection === "desc" ? "desc" : "asc"

  const selectedArea = summary.find((row) => row.id === selectedAreaId) ?? summary[0]
  const effectiveSelectedAreaId = selectedAreaId ?? selectedArea?.id ?? null
  const sortedSeats = useMemo(() => {
    if (!activeSeatSortField) {
      return seats
    }

    const sorted = [...seats]
    const factor = activeSeatSortDirection === "asc" ? 1 : -1
    const compareText = (left: string | null | undefined, right: string | null | undefined) =>
      (left || "").localeCompare(right || "", undefined, { sensitivity: "base" })

    sorted.sort((left, right) => {
      if (activeSeatSortField === "alloc") {
        return (left.allocation - right.allocation) * factor
      }

      const result =
        activeSeatSortField === "seat"
          ? compareText(left.seatId, right.seatId)
          : activeSeatSortField === "resource"
            ? compareText(left.inSeat, right.inSeat) || compareText(left.band, right.band)
            : compareText(left.resourceType, right.resourceType) ||
              compareText(left.startDate ? String(left.startDate) : "", right.startDate ? String(right.startDate) : "")

      if (result !== 0) {
        return result * factor
      }

      return compareText(left.seatId, right.seatId) * factor
    })

    return sorted
  }, [activeSeatSortDirection, activeSeatSortField, seats])

  const selectedSeat = sortedSeats.find((seat) => seat.id === selectedSeatId) ?? sortedSeats[0]

  function updateSeatSort(field: SeatSortField) {
    const nextDirection =
      activeSeatSortField === field && activeSeatSortDirection === "asc" ? "desc" : "asc"

    updateParams({
      seatSortField: field,
      seatSortDirection: nextDirection,
    })
  }

  function sortIndicator(field: SeatSortField) {
    if (activeSeatSortField !== field) {
      return "↕"
    }

    return activeSeatSortDirection === "asc" ? "↑" : "↓"
  }

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(next).forEach(([key, value]) => {
      if (!value) {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    })

    startTransition(() => {
      router.push(`/welcome?${params.toString()}`)
    })
  }

  async function handleJsonSubmit(
    payload: unknown,
    endpoint: string,
    successMessage: string
  ) {
    try {
      await fetchJson(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })
      toast.success(successMessage)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Request failed")
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(187,108,37,0.16),_transparent_32%),linear-gradient(180deg,_rgba(255,250,243,1)_0%,_rgba(246,240,232,1)_100%)]">
      <FinanceHeader
        title="Financial Tracker"
        subtitle="Imported budget movements, roster-derived seats, and manual finance assumptions."
        userName={userName}
        userEmail={userEmail}
        userRole={userRole}
        activeYear={activeYear}
        currentPath="/welcome"
      />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <section className="grid gap-4 md:grid-cols-4">
          <Card className="border-amber-200/70 bg-white/90">
            <CardHeader className="gap-1">
              <CardDescription>Total Budget</CardDescription>
              <CardTitle>{formatCurrency(summaryTotals.amountGivenBudget)}</CardTitle>
              <div className="text-xs text-muted-foreground">
                Finance view {formatCurrency(summaryTotals.financeViewBudget)}
              </div>
            </CardHeader>
          </Card>
          <Card className="border-amber-200/70 bg-white/90">
            <CardHeader className="gap-1">
              <CardDescription>Spent To Date</CardDescription>
              <CardTitle>{formatCurrency(summaryTotals.spent)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-amber-200/70 bg-white/90">
            <CardHeader className="gap-1">
              <CardDescription>Total Forecast</CardDescription>
              <CardTitle>{formatCurrency(summaryTotals.forecast)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-amber-200/70 bg-white/90">
            <CardHeader className="gap-1">
              <CardDescription>Tracked Seats</CardDescription>
              <CardTitle>{formatNumber(summaryTotals.seatCount)}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
          <Card className="border-amber-200/70 bg-white/90">
            <CardHeader className="flex-row items-end justify-between gap-4">
              <div>
                <CardTitle>Budget Summary</CardTitle>
                <CardDescription>
                  Imported budget movements plus derived spend and forecast by area.
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Label htmlFor="year-select" className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Year
                </Label>
                <select
                  id="year-select"
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm"
                  value={String(activeYear)}
                  onChange={(event) => updateParams({ year: event.target.value })}
                >
                  {trackingYears.map((year) => (
                    <option key={year.id} value={year.year}>
                      {year.year}
                    </option>
                  ))}
                  {!trackingYears.some((year) => year.year === activeYear) ? (
                    <option value={activeYear}>{activeYear}</option>
                  ) : null}
                </select>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Area</TableHead>
                    <TableHead>Budget</TableHead>
                    <TableHead>Spent</TableHead>
                    <TableHead>Forecast</TableHead>
                    <TableHead>Remaining</TableHead>
                    <TableHead>Seats</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Open</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.map((row) => (
                    <TableRow
                      key={row.id}
                      className={row.id === selectedAreaId ? "bg-amber-50" : undefined}
                    >
                      <TableCell>
                        <button
                          type="button"
                          className="text-left"
                          onClick={() => updateParams({ budgetAreaId: row.id })}
                        >
                          <div className="font-medium">{row.displayName}</div>
                          <div className="text-xs text-muted-foreground">
                            {(row.domain || "Unmapped domain")} ·{" "}
                            {row.subDomain || "Unmapped sub-domain"}
                          </div>
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {formatCurrency(row.amountGivenBudget)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Finance view {formatCurrency(row.financeViewBudget)}
                        </div>
                      </TableCell>
                      <TableCell>{formatCurrency(row.spentToDate)}</TableCell>
                      <TableCell>{formatCurrency(row.totalForecast)}</TableCell>
                      <TableCell>{formatCurrency(row.forecastRemaining)}</TableCell>
                      <TableCell>{row.seatCount}</TableCell>
                      <TableCell>{row.activeSeatCount}</TableCell>
                      <TableCell>{row.openSeatCount}</TableCell>
                    </TableRow>
                  ))}
                  {summary.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        Import budget movements and roster data to populate the tracker.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border-amber-200/70 bg-white/90">
            <CardHeader>
              <CardTitle>Selected Area</CardTitle>
              <CardDescription>
                {selectedArea
                  ? `${selectedArea.displayName} for ${activeYear}`
                  : `No budget area selected for ${activeYear}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {selectedArea ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-muted/50 p-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Domain
                      </div>
                      <div className="mt-2 text-lg font-semibold">
                        {selectedArea.domain || "Unmapped"}
                      </div>
                    </div>
                    <div className="rounded-xl bg-muted/50 p-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Sub-domain
                      </div>
                      <div className="mt-2 text-lg font-semibold">
                        {selectedArea.subDomain || "Unmapped"}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-muted/50 p-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        PERM Target
                      </div>
                      <div className="mt-2 text-lg font-semibold">
                        {formatPercent(selectedArea.permTarget)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-muted/50 p-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Cloud Target
                      </div>
                      <div className="mt-2 text-lg font-semibold">
                        {formatCurrency(selectedArea.cloudCostTarget)}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-dashed border-border px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">PERM Forecast</span>
                      <span className="font-medium">
                        {formatCurrency(selectedArea.permForecast)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-muted-foreground">EXT Forecast</span>
                      <span className="font-medium">
                        {formatCurrency(selectedArea.extForecast)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-muted-foreground">Cloud Forecast</span>
                      <span className="font-medium">
                        {formatCurrency(selectedArea.cloudCostForecast)}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">
                  Choose an area in the summary table to inspect seats and forecast details.
                </p>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <Card className="border-amber-200/70 bg-white/90">
            <CardHeader>
              <CardTitle>Seat Tracker</CardTitle>
              <CardDescription>
                Detail rows derived from the latest approved roster import.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form method="GET" className="mb-4 grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
                <input type="hidden" name="year" value={String(activeYear)} />
                {effectiveSelectedAreaId ? (
                  <input type="hidden" name="budgetAreaId" value={effectiveSelectedAreaId} />
                ) : null}
                {activeSeatSortField ? (
                  <input type="hidden" name="seatSortField" value={activeSeatSortField} />
                ) : null}
                <input
                  type="hidden"
                  name="seatSortDirection"
                  value={activeSeatSortDirection}
                />
                <MultiSelectFilter
                  label="Team"
                  name="team"
                  options={trackerTeamOptions}
                  selectedValues={trackerTeamFilters}
                />
                <MultiSelectFilter
                  label="Missing Actual Month"
                  name="missingActualMonth"
                  options={missingActualMonthOptions}
                  selectedValues={missingActualMonthFilters}
                />
                <div className="flex items-end gap-2">
                  <Button type="submit">Apply</Button>
                  <Button asChild variant="outline">
                    <Link
                      href={
                        effectiveSelectedAreaId
                          ? `/welcome?year=${activeYear}&budgetAreaId=${encodeURIComponent(effectiveSelectedAreaId)}`
                          : `/welcome?year=${activeYear}`
                      }
                    >
                      Reset
                    </Link>
                  </Button>
                </div>
              </form>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <button
                        type="button"
                        className="text-left hover:text-foreground"
                        onClick={() => updateSeatSort("seat")}
                      >
                        Seat {sortIndicator("seat")}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        className="text-left hover:text-foreground"
                        onClick={() => updateSeatSort("resource")}
                      >
                        Resource {sortIndicator("resource")}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        className="text-left hover:text-foreground"
                        onClick={() => updateSeatSort("type")}
                      >
                        Type {sortIndicator("type")}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        className="text-left hover:text-foreground"
                        onClick={() => updateSeatSort("alloc")}
                      >
                        Alloc {sortIndicator("alloc")}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        className="text-left hover:text-foreground"
                        onClick={() => setShowSpentQuarterly((current) => !current)}
                      >
                        Spent {showSpentQuarterly ? "−" : "+"}
                      </button>
                    </TableHead>
                    {showSpentQuarterly ? (
                      <>
                        <TableHead>S Q1</TableHead>
                        <TableHead>S Q2</TableHead>
                        <TableHead>S Q3</TableHead>
                        <TableHead>S Q4</TableHead>
                      </>
                    ) : null}
                    <TableHead>
                      <button
                        type="button"
                        className="text-left hover:text-foreground"
                        onClick={() => setShowForecastQuarterly((current) => !current)}
                      >
                        Forecast {showForecastQuarterly ? "−" : "+"}
                      </button>
                    </TableHead>
                    {showForecastQuarterly ? (
                      <>
                        <TableHead>F Q1</TableHead>
                        <TableHead>F Q2</TableHead>
                        <TableHead>F Q3</TableHead>
                        <TableHead>F Q4</TableHead>
                      </>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedSeats.map((seat) => (
                    (() => {
                      const quarterlySpent = getQuarterlySpent(seat)
                      const quarterlyForecast = Array.from(
                        { length: 4 },
                        (_, quarterIndex) => sumQuarter(seat.monthlyForecast, quarterIndex)
                      )

                      return (
                    <TableRow
                      key={seat.id}
                      className={seat.id === selectedSeatId ? "bg-amber-50" : "cursor-pointer"}
                      onClick={() => setSelectedSeatId(seat.id)}
                    >
                      <TableCell>
                        <div className="flex items-center justify-between gap-3">
                          <Link
                            href={`/people-roster?year=${activeYear}&seatId=${encodeURIComponent(seat.seatId)}`}
                            className="font-medium text-amber-900 underline-offset-4 hover:underline"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {seat.seatId}
                          </Link>
                          <Badge variant="outline">{seat.status || "No status"}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">{seat.team}</div>
                        <div className="text-xs text-muted-foreground">
                          {(seat.domain || "Unmapped")} · {seat.subDomain || "Unmapped"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>{seat.inSeat || "Unassigned"}</div>
                        <div className="text-xs text-muted-foreground">{seat.band}</div>
                      </TableCell>
                      <TableCell>
                        <div>{seat.resourceType || "n/a"}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatOptionalDate(seat.startDate)} to {formatOptionalDate(seat.endDate)}
                        </div>
                      </TableCell>
                      <TableCell>{formatPercent(seat.allocation)}</TableCell>
                      <TableCell>{formatCurrency(seat.totalSpent)}</TableCell>
                      {showSpentQuarterly ? (
                        <>
                          <TableCell>{formatCurrency(quarterlySpent[0])}</TableCell>
                          <TableCell>{formatCurrency(quarterlySpent[1])}</TableCell>
                          <TableCell>{formatCurrency(quarterlySpent[2])}</TableCell>
                          <TableCell>{formatCurrency(quarterlySpent[3])}</TableCell>
                        </>
                      ) : null}
                      <TableCell>
                        <div>{formatCurrency(seat.totalForecast)}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatForecastCoverage(seat)}
                        </div>
                      </TableCell>
                      {showForecastQuarterly ? (
                        <>
                          <TableCell>{formatCurrency(quarterlyForecast[0])}</TableCell>
                          <TableCell>{formatCurrency(quarterlyForecast[1])}</TableCell>
                          <TableCell>{formatCurrency(quarterlyForecast[2])}</TableCell>
                          <TableCell>{formatCurrency(quarterlyForecast[3])}</TableCell>
                        </>
                      ) : null}
                    </TableRow>
                      )
                    })()
                  ))}
                  {sortedSeats.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={
                          6 +
                          (showSpentQuarterly ? 4 : 0) +
                          (showForecastQuarterly ? 4 : 0)
                        }
                        className="py-8 text-center text-muted-foreground"
                      >
                        No derived seats for this area yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-amber-200/70 bg-white/90">
              <CardHeader>
                <CardTitle>Seat Monthly Detail</CardTitle>
                <CardDescription>
                  Click a seat row to inspect monthly forecast and actuals.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedSeat ? (
                  <div className="space-y-4">
                    <div className="rounded-xl bg-muted/40 p-3 text-sm">
                      <div className="font-medium">
                        {selectedSeat.seatId} · {selectedSeat.inSeat || "Unassigned"}
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        {selectedSeat.team || "No team"} · {selectedSeat.band || "No band"}
                      </div>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Month</TableHead>
                          <TableHead>Forecast</TableHead>
                          <TableHead>Actual</TableHead>
                          <TableHead>Raw</TableHead>
                          <TableHead>Forecast On</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {MONTH_NAMES.map((month, monthIndex) => {
                          const monthEntry = selectedSeat.months.find(
                            (entry) => entry.monthIndex === monthIndex
                          )
                          return (
                            <TableRow key={month}>
                              <TableCell>{month}</TableCell>
                              <TableCell>
                                {formatCurrency(selectedSeat.monthlyForecast[monthIndex] ?? 0)}
                              </TableCell>
                              <TableCell>
                                {formatCurrency(monthEntry?.actualAmountDkk ?? 0)}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {monthEntry?.actualAmountRaw ?? 0}{" "}
                                {monthEntry?.actualCurrency || "DKK"}
                              </TableCell>
                              <TableCell>
                                {monthEntry?.forecastIncluded === false ? "No" : "Yes"}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                    <div className="rounded-xl border border-dashed border-border px-4 py-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Start</span>
                        <span>{formatOptionalDate((selectedSeat as SeatRow & { startDate?: string | Date | null }).startDate)}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-muted-foreground">End</span>
                        <span>{formatOptionalDate((selectedSeat as SeatRow & { endDate?: string | Date | null }).endDate)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No seat selected.
                  </p>
                )}
              </CardContent>
            </Card>

            {canEditTracker ? (
              <Card className="border-amber-200/70 bg-white/90">
                <CardHeader>
                  <CardTitle>Tracker Overrides</CardTitle>
                  <CardDescription>
                    Controlled manual edits for mapping and finance metadata.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="override-seat">Seat</Label>
                  <select
                    id="override-seat"
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                    value={selectedSeatId}
                    onChange={(event) => setSelectedSeatId(event.target.value)}
                  >
                    {seats.map((seat) => (
                      <option key={seat.id} value={seat.id}>
                        {seat.seatId} · {seat.inSeat || "Unassigned"}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="override-area">Budget Area</Label>
                  <select
                    id="override-area"
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                    value={overrideValues.budgetAreaId}
                    onChange={(event) =>
                      setOverrideValues((current) => ({
                        ...current,
                        budgetAreaId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Keep derived mapping</option>
                    {budgetAreas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.displayName || `${area.pillar || area.projectCode} · ${area.costCenter}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="override-domain">Domain</Label>
                    <Input id="override-domain" placeholder="Data & Analytics" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="override-subdomain">Sub-domain</Label>
                    <Input id="override-subdomain" placeholder="Architecture" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="spend-plan">Spend Plan ID</Label>
                    <Input
                      id="spend-plan"
                      value={overrideValues.spendPlanId}
                      onChange={(event) =>
                        setOverrideValues((current) => ({
                          ...current,
                          spendPlanId: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ritm">RITM</Label>
                    <Input
                      id="ritm"
                      value={overrideValues.ritm}
                      onChange={(event) =>
                        setOverrideValues((current) => ({
                          ...current,
                          ritm: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="sow">SOW</Label>
                    <Input
                      id="sow"
                      value={overrideValues.sow}
                      onChange={(event) =>
                        setOverrideValues((current) => ({
                          ...current,
                          sow: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="override-status">Status</Label>
                    <select
                      id="override-status"
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                      value={overrideValues.status}
                      onChange={(event) =>
                        setOverrideValues((current) => ({
                          ...current,
                          status: event.target.value,
                        }))
                      }
                    >
                      <option value="">Keep current status</option>
                      {statusDefinitions.map((status) => (
                        <option key={status.id} value={status.label}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="override-allocation">Allocation</Label>
                    <Input
                      id="override-allocation"
                      value={overrideValues.allocation}
                      onChange={(event) =>
                        setOverrideValues((current) => ({
                          ...current,
                          allocation: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="override-notes">Notes</Label>
                    <Input
                      id="override-notes"
                      value={overrideValues.notes}
                      onChange={(event) =>
                        setOverrideValues((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <Button
                  disabled={!selectedSeatId}
                  onClick={() =>
                    handleJsonSubmit(
                      {
                        override: {
                          domain:
                            (document.getElementById("override-domain") as HTMLInputElement | null)
                              ?.value || null,
                          subDomain:
                            (document.getElementById("override-subdomain") as HTMLInputElement | null)
                              ?.value || null,
                          budgetAreaId: overrideValues.budgetAreaId || null,
                          spendPlanId: overrideValues.spendPlanId || null,
                          ritm: overrideValues.ritm || null,
                          sow: overrideValues.sow || null,
                          status: overrideValues.status || null,
                          allocation: overrideValues.allocation
                            ? Number(overrideValues.allocation)
                            : null,
                          notes: overrideValues.notes || null,
                        },
                      },
                      `/api/tracker-seats/${selectedSeatId}`,
                      "Seat override saved"
                    )
                  }
                >
                  Save Override
                </Button>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </section>

        {canManageAdminData ? (
          <section className="grid gap-6 xl:grid-cols-2">
          </section>
        ) : null}

        <div className="text-xs text-muted-foreground">
          {isPending ? "Loading updated data..." : "Tracker is backed by Prisma + SQLite and recalculates after each import or override."}
        </div>
      </main>
    </div>
  )
}
