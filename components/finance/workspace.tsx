"use client"

import Link from "next/link"
import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Check, ChevronsUpDown, PenLine } from "lucide-react"
import { toast } from "sonner"
import { FinanceHeader } from "@/components/finance/header"
import { MultiSelectFilter } from "@/components/finance/multi-select-filter"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
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
import { cn } from "@/lib/utils"
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
  budgetAreaId?: string | null
  domain: string | null
  subDomain: string | null
  projectCode: string | null
  team: string | null
  inSeat: string | null
  resourceType: string | null
  description?: string | null
  band: string | null
  location: string | null
  status: string | null
  allocation: number
  totalSpent: number
  totalForecast: number
  hasForecastAdjustments?: boolean
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
  openSeatsOnly: boolean
  seatSortField?: string
  seatSortDirection?: string
}

type SeatSortField = "seat" | "resource" | "type" | "alloc"
type SeatSortDirection = "asc" | "desc"

const UNMAPPED_DOMAIN_FILTER = "__unmapped__"

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

function isCodeLikeAreaLabel(value: string | null | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) {
    return false
  }

  return /^[A-Z]\d+\s*·\s*[A-Z]\d+$/i.test(trimmed)
}

function getDomainFilterValue(domain: string | null | undefined) {
  const trimmed = domain?.trim()
  return trimmed ? trimmed : UNMAPPED_DOMAIN_FILTER
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

function getSeatStartMonthIndex(seat: SeatRow, activeYear: number) {
  if (!seat.startDate) {
    return null
  }

  const startDate = new Date(seat.startDate)

  if (startDate.getFullYear() > activeYear) {
    return Number.POSITIVE_INFINITY
  }

  if (startDate.getFullYear() < activeYear) {
    return 0
  }

  return startDate.getMonth()
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
  openSeatsOnly,
  seatSortField,
  seatSortDirection,
}: WorkspaceProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const canEditTracker = userRole !== "GUEST"
  const canManageAdminData =
    userRole === "ADMIN" || userRole === "SUPER_ADMIN"
  const [isPending, startTransition] = useTransition()
  const [isAreaLoading, setIsAreaLoading] = useState(false)
  const initialSelectedAreaId = selectedAreaId ?? summary[0]?.id ?? null
  const [activeSummaryAreaId, setActiveSummaryAreaId] = useState(initialSelectedAreaId)
  const [areaSeats, setAreaSeats] = useState(seats)
  const [selectedSeatId, setSelectedSeatId] = useState(seats[0]?.id ?? "")
  const [showSpentQuarterly, setShowSpentQuarterly] = useState(false)
  const [showForecastQuarterly, setShowForecastQuarterly] = useState(false)
  const [pillarPickerOpen, setPillarPickerOpen] = useState(false)
  const [openSeatsOnlyDraft, setOpenSeatsOnlyDraft] = useState(openSeatsOnly)
  const [overrideValues, setOverrideValues] = useState(() => ({
    budgetAreaId: "",
    spendPlanId: "",
    ritm: "",
    sow: "",
    status: "",
    allocation: "",
    notes: "",
  }))

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
  const activeDomainFilter = searchParams.get("domain")?.trim() ?? ""
  const domainOptions = useMemo(
    () =>
      Array.from(
        new Map(
          summary.map((row) => [
            getDomainFilterValue(row.domain),
            row.domain?.trim() || "Unmapped",
          ])
        )
      ).sort((left, right) => left[1].localeCompare(right[1], undefined, { sensitivity: "base" })),
    [summary]
  )
  const filteredSummary = useMemo(() => {
    if (!activeDomainFilter) {
      return summary
    }

    return summary.filter((row) => getDomainFilterValue(row.domain) === activeDomainFilter)
  }, [activeDomainFilter, summary])

  const activeSeatSortField: SeatSortField | null =
    seatSortField === "seat" ||
    seatSortField === "resource" ||
    seatSortField === "type" ||
    seatSortField === "alloc"
      ? seatSortField
      : null

  const activeSeatSortDirection: SeatSortDirection =
    seatSortDirection === "desc" ? "desc" : "asc"

  useEffect(() => {
    setActiveSummaryAreaId(initialSelectedAreaId)
    setAreaSeats(seats)
  }, [initialSelectedAreaId, seats])

  useEffect(() => {
    setOpenSeatsOnlyDraft(openSeatsOnly)
  }, [openSeatsOnly])

  const selectedArea =
    summary.find((row) => row.id === activeSummaryAreaId) ??
    filteredSummary[0] ??
    summary[0]
  const effectiveSelectedAreaId = activeSummaryAreaId ?? selectedArea?.id ?? null
  const filteredSeats = useMemo(() => {
    const teamFilter = new Set(
      trackerTeamFilters.map((team) => (team || "").trim().toLowerCase()).filter(Boolean)
    )
    const monthFilter = new Set(
      missingActualMonthFilters
        .map((month) => MONTH_NAMES.findIndex((candidate) => candidate === month))
        .filter((index) => index >= 0)
    )

    return areaSeats.filter((seat) => {
      if (teamFilter.size > 0 && !teamFilter.has((seat.team || "").trim().toLowerCase())) {
        return false
      }

      if (monthFilter.size > 0) {
        if ((seat.status || "").trim().toLowerCase() === "open") {
          return false
        }

        const seatStartMonthIndex = getSeatStartMonthIndex(seat, activeYear)
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
  }, [activeYear, areaSeats, missingActualMonthFilters, trackerTeamFilters])
  const sortedSeats = useMemo(() => {
    if (!activeSeatSortField) {
      return filteredSeats
    }

    const sorted = [...filteredSeats]
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
  }, [activeSeatSortDirection, activeSeatSortField, filteredSeats])

  useEffect(() => {
    if (!selectedSeatId || !sortedSeats.some((seat) => seat.id === selectedSeatId)) {
      setSelectedSeatId(sortedSeats[0]?.id ?? "")
    }
  }, [selectedSeatId, sortedSeats])

  const selectedSeat = sortedSeats.find((seat) => seat.id === selectedSeatId) ?? sortedSeats[0]
  const listedSeatTotals = useMemo(
    () =>
      sortedSeats.reduce(
        (totals, seat) => ({
          spent: totals.spent + seat.totalSpent,
          forecast: totals.forecast + seat.totalForecast,
        }),
        {
          spent: 0,
          forecast: 0,
        }
      ),
    [sortedSeats]
  )
  const pillarOptions = useMemo(
    () =>
      budgetAreas
        .map((area) => ({
          id: area.id,
          label:
            area.pillar ||
            area.subDomain ||
            (!isCodeLikeAreaLabel(area.displayName) ? area.displayName : null) ||
            area.domain ||
            "Unnamed pillar",
          detail: [area.projectCode, area.costCenter].filter(Boolean).join(" · "),
          area,
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [budgetAreas]
  )
  const selectedOverrideArea =
    pillarOptions.find((option) => option.id === overrideValues.budgetAreaId)?.area ?? null

  function buildOverrideValuesFromSeat(seat?: SeatRow) {
    if (!seat) {
      return {
        budgetAreaId: "",
        spendPlanId: "",
        ritm: "",
        sow: "",
        status: "",
        allocation: "",
        notes: "",
      }
    }

    return {
      budgetAreaId: seat.budgetAreaId || "",
      spendPlanId: seat.spendPlanId || "",
      ritm: seat.ritm || "",
      sow: seat.sow || "",
      status: seat.status || "",
      allocation:
        typeof seat.allocation === "number" && Number.isFinite(seat.allocation)
          ? String(seat.allocation)
          : "",
      notes: seat.notes || "",
    }
  }

  function resetOverrideValues() {
    setOverrideValues(buildOverrideValuesFromSeat(selectedSeat))
  }

  function selectSeat(seatId: string) {
    setSelectedSeatId(seatId)
    const seat = sortedSeats.find((entry) => entry.id === seatId)
    setOverrideValues(buildOverrideValuesFromSeat(seat))
  }

  useEffect(() => {
    setOverrideValues(buildOverrideValuesFromSeat(selectedSeat))
  }, [selectedSeatId, selectedSeat])

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
      router.replace(`/tracker?${params.toString()}`, { scroll: false })
    })
  }

  function handleSeatTrackerFilterSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const params = new URLSearchParams()
    const appendValues = (key: string, values: FormDataEntryValue[]) => {
      values
        .map((value) => String(value).trim())
        .filter(Boolean)
        .forEach((value) => params.append(key, value))
    }

    const year = String(formData.get("year") || "").trim()
    const domain = String(formData.get("domain") || "").trim()
    const budgetAreaId = String(formData.get("budgetAreaId") || "").trim()
    const seatSortField = String(formData.get("seatSortField") || "").trim()
    const seatSortDirection = String(formData.get("seatSortDirection") || "").trim()

    if (year) {
      params.set("year", year)
    }

    if (domain) {
      params.set("domain", domain)
    }

    if (budgetAreaId) {
      params.set("budgetAreaId", budgetAreaId)
    }

    if (seatSortField) {
      params.set("seatSortField", seatSortField)
    }

    if (seatSortDirection) {
      params.set("seatSortDirection", seatSortDirection)
    }

    appendValues("team", formData.getAll("team"))
    appendValues("missingActualMonth", formData.getAll("missingActualMonth"))
    if (formData.get("openSeatsOnly") === "true") {
      params.set("openSeatsOnly", "true")
    }

    startTransition(() => {
      router.replace(`/tracker?${params.toString()}`, { scroll: false })
    })
  }

  async function handleAreaSelection(areaId: string) {
    await handleAreaSelectionWithParams(areaId, new URLSearchParams(searchParams.toString()))
  }

  async function handleAreaSelectionWithParams(areaId: string, params: URLSearchParams) {
    if (areaId === effectiveSelectedAreaId) {
      return
    }

    params.set("budgetAreaId", areaId)
    params.delete("team")
    params.delete("missingActualMonth")
    params.delete("openSeatsOnly")

    setActiveSummaryAreaId(areaId)
    setAreaSeats([])
    setSelectedSeatId("")
    resetOverrideValues()
    setOpenSeatsOnlyDraft(false)
    setIsAreaLoading(true)

    startTransition(() => {
      router.replace(`/tracker?${params.toString()}`, { scroll: false })
    })

    try {
      const response = await fetchJson(
        `/api/tracker/detail?year=${activeYear}&budgetAreaId=${encodeURIComponent(areaId)}`
      )
      setAreaSeats(response.seats)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load area details")
      setActiveSummaryAreaId(initialSelectedAreaId)
      setAreaSeats(seats)
    } finally {
      setIsAreaLoading(false)
    }
  }

  function handleDomainFilterChange(nextDomainFilter: string) {
    const params = new URLSearchParams(searchParams.toString())

    if (nextDomainFilter) {
      params.set("domain", nextDomainFilter)
    } else {
      params.delete("domain")
    }

    const nextSummary = nextDomainFilter
      ? summary.filter((row) => getDomainFilterValue(row.domain) === nextDomainFilter)
      : summary
    const currentSelectionStillVisible = nextSummary.some((row) => row.id === effectiveSelectedAreaId)

    if (currentSelectionStillVisible || !nextSummary[0]) {
      startTransition(() => {
        router.replace(`/tracker?${params.toString()}`, { scroll: false })
      })
      return
    }

    void handleAreaSelectionWithParams(nextSummary[0].id, params)
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
    <div className="min-h-screen brand-page-shell">
      <FinanceHeader
        title="Financial Tracker"
        subtitle="Imported budget movements, roster-derived seats, and manual finance assumptions."
        userName={userName}
        userEmail={userEmail}
        userRole={userRole}
        activeYear={activeYear}
        currentPath="/tracker"
      />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <section className="grid gap-4 md:grid-cols-4">
          <Card className="brand-card">
            <CardHeader className="gap-1">
              <CardDescription>Total Budget</CardDescription>
              <CardTitle>{formatCurrency(summaryTotals.amountGivenBudget)}</CardTitle>
              <div className="text-xs text-muted-foreground">
                Finance view {formatCurrency(summaryTotals.financeViewBudget)}
              </div>
            </CardHeader>
          </Card>
          <Card className="brand-card">
            <CardHeader className="gap-1">
              <CardDescription>Spent To Date</CardDescription>
              <CardTitle>{formatCurrency(summaryTotals.spent)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="brand-card">
            <CardHeader className="gap-1">
              <CardDescription>Total Forecast</CardDescription>
              <CardTitle>{formatCurrency(summaryTotals.forecast)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="brand-card">
            <CardHeader className="gap-1">
              <CardDescription>Tracked Seats</CardDescription>
              <CardTitle>{formatNumber(summaryTotals.seatCount)}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        <section className="space-y-6">
          <Card className="brand-card">
            <CardHeader className="flex-row items-end justify-between gap-4">
              <div>
                <CardTitle>Budget Summary</CardTitle>
                <CardDescription>
                  Imported budget movements plus derived spend and forecast by area.
                </CardDescription>
              </div>

              <div className="flex flex-wrap items-center gap-2">
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
                <Label
                  htmlFor="domain-select"
                  className="ml-2 text-xs uppercase tracking-[0.18em] text-muted-foreground"
                >
                  Domain
                </Label>
                <select
                  id="domain-select"
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm"
                  value={activeDomainFilter}
                  onChange={(event) => handleDomainFilterChange(event.target.value)}
                >
                  <option value="">All domains</option>
                  {domainOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pillar</TableHead>
                    <TableHead>Project Code</TableHead>
                    <TableHead>Budget</TableHead>
                    <TableHead className="whitespace-normal leading-tight">Spent To Date</TableHead>
                    <TableHead className="whitespace-normal leading-tight">Remaining Budget</TableHead>
                    <TableHead className="whitespace-normal leading-tight">Forecast Spent To End Of Year</TableHead>
                    <TableHead className="whitespace-normal leading-tight">End Of Year Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSummary.map((row) => {
                    const remainingBudget = row.amountGivenBudget - row.spentToDate
                    const forecastSpentToEndOfYear = row.totalForecast - row.spentToDate
                    const endOfYearBalance = remainingBudget - forecastSpentToEndOfYear

                    return (
                      <TableRow
                        key={row.id}
                        tabIndex={0}
                        className={cn(
                          "cursor-pointer transition-colors focus-visible:outline-none brand-hover-row",
                          row.id === effectiveSelectedAreaId && "brand-selected-row"
                        )}
                        onClick={() => void handleAreaSelection(row.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault()
                            void handleAreaSelection(row.id)
                          }
                        }}
                      >
                        <TableCell>
                          <div className="font-medium">{row.displayName}</div>
                          <div className="text-xs text-muted-foreground">
                            {(row.domain || "Unmapped domain")} ·{" "}
                            {row.subDomain || "Unmapped sub-domain"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{row.projectCode || "Unassigned"}</div>
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
                        <TableCell>{formatCurrency(remainingBudget)}</TableCell>
                        <TableCell>{formatCurrency(forecastSpentToEndOfYear)}</TableCell>
                        <TableCell>{formatCurrency(endOfYearBalance)}</TableCell>
                      </TableRow>
                    )
                  })}
                  {filteredSummary.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                        {activeDomainFilter
                          ? "No budget areas found for the selected domain."
                          : "Import budget movements and roster data to populate the tracker."}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="brand-card">
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
                  <div className="grid gap-3 md:grid-cols-5">
                    <div className="rounded-xl bg-muted/50 p-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Domain
                      </div>
                      <div className="mt-2 text-base font-semibold">
                        {selectedArea.domain || "Unmapped"}
                      </div>
                    </div>
                    <div className="rounded-xl bg-muted/50 p-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Sub-domain
                      </div>
                      <div className="mt-2 text-base font-semibold">
                        {selectedArea.subDomain || "Unmapped"}
                      </div>
                    </div>
                    <div className="rounded-xl bg-muted/50 p-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Project Code
                      </div>
                      <div className="mt-2 text-base font-semibold">
                        {selectedArea.projectCode || "Unassigned"}
                      </div>
                    </div>
                    <div className="rounded-xl bg-muted/50 p-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        PERM Target
                      </div>
                      <div className="mt-2 text-base font-semibold">
                        {formatPercent(selectedArea.permTarget)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-muted/50 p-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Cloud Target
                      </div>
                      <div className="mt-2 text-base font-semibold">
                        {formatCurrency(selectedArea.cloudCostTarget)}
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-dashed border-border px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        PERM Forecast
                      </div>
                      <div className="mt-2 font-medium">
                        {formatCurrency(selectedArea.permForecast)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-dashed border-border px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        EXT Forecast
                      </div>
                      <div className="mt-2 font-medium">
                        {formatCurrency(selectedArea.extForecast)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-dashed border-border px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Cloud Forecast
                      </div>
                      <div className="mt-2 font-medium">
                        {formatCurrency(selectedArea.cloudCostForecast)}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-muted/30 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Spent</span>
                      <span className="font-medium">{formatCurrency(selectedArea.spentToDate)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Budget</span>
                      <span className="font-medium">{formatCurrency(selectedArea.amountGivenBudget)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Remaining</span>
                      <span className="font-medium">{formatCurrency(selectedArea.forecastRemaining)}</span>
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
          <Card className="brand-card">
            <CardHeader>
              <CardTitle>Seat Tracker</CardTitle>
              <CardDescription>
                {isAreaLoading
                  ? "Loading area details..."
                  : "Detail rows derived from the latest approved roster import."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                method="GET"
                className="mb-4 grid gap-4 lg:grid-cols-[1fr_1fr_auto]"
                onSubmit={handleSeatTrackerFilterSubmit}
              >
                <input type="hidden" name="year" value={String(activeYear)} />
                {activeDomainFilter ? (
                  <input type="hidden" name="domain" value={activeDomainFilter} />
                ) : null}
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
                <div className="flex items-end">
                  <div className="flex w-full items-center justify-between rounded-xl border border-border/70 bg-background px-4 py-3">
                    <div className="pr-4">
                      <div className="text-sm font-medium">Open seats only</div>
                      <div className="text-xs text-muted-foreground">
                        Limit the list to seats with status Open.
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {openSeatsOnlyDraft ? (
                        <input type="hidden" name="openSeatsOnly" value="true" />
                      ) : null}
                      <Switch
                        checked={openSeatsOnlyDraft}
                        onCheckedChange={setOpenSeatsOnlyDraft}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <Button type="submit">Apply</Button>
                  <Button asChild variant="outline">
                    <Link
                      href={
                        effectiveSelectedAreaId
                          ? `/tracker?year=${activeYear}${activeDomainFilter ? `&domain=${encodeURIComponent(activeDomainFilter)}` : ""}&budgetAreaId=${encodeURIComponent(effectiveSelectedAreaId)}`
                          : `/tracker?year=${activeYear}${activeDomainFilter ? `&domain=${encodeURIComponent(activeDomainFilter)}` : ""}`
                      }
                    >
                      Reset
                    </Link>
                  </Button>
                </div>
              </form>
              <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-muted/30 px-4 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Listed spent</span>
                  <span className="font-medium">{formatCurrency(listedSeatTotals.spent)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Listed forecast</span>
                  <span className="font-medium">{formatCurrency(listedSeatTotals.forecast)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Seats</span>
                  <span className="font-medium">{formatNumber(sortedSeats.length)}</span>
                </div>
              </div>
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
                      className={seat.id === selectedSeatId ? "brand-selected-row" : "cursor-pointer"}
                      onClick={() => selectSeat(seat.id)}
                    >
                      <TableCell>
                        <div className="flex items-center justify-between gap-3">
                          <Link
                            href={`/people-roster?year=${activeYear}&seatId=${encodeURIComponent(seat.seatId)}`}
                            className="brand-inline-link"
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
                        <div className="text-xs text-muted-foreground">
                          {seat.projectCode || "No project code"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>{seat.inSeat || "Unassigned"}</div>
                        <div className="text-xs text-muted-foreground">{seat.band}</div>
                        <div className="text-xs text-muted-foreground">
                          {seat.location || "No location"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>{seat.resourceType || "n/a"}</div>
                        <div className="text-xs text-muted-foreground">
                          {seat.description || "No role"}
                        </div>
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
                        <div className="flex items-center gap-1">
                          <span>{formatCurrency(seat.totalForecast)}</span>
                          {seat.hasForecastAdjustments ? (
                            <PenLine
                              className="size-3.5 text-rose-700 dark:text-rose-300"
                              aria-label="Forecast contains manual adjustments"
                            />
                          ) : null}
                        </div>
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
            <Card className="brand-card">
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
                        {selectedSeat.team || "No team"}
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        {(selectedSeat as SeatRow & { description?: string | null }).description || "No role"} ·{" "}
                        {selectedSeat.band || "No band"}
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
              <Card className="brand-card">
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
                    onChange={(event) => selectSeat(event.target.value)}
                  >
                    {seats.map((seat) => (
                      <option key={seat.id} value={seat.id}>
                        {seat.seatId} · {seat.inSeat || "Unassigned"}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="override-pillar">Pillar</Label>
                  <Popover open={pillarPickerOpen} onOpenChange={setPillarPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="override-pillar"
                        variant="outline"
                        role="combobox"
                        aria-expanded={pillarPickerOpen}
                        className="w-full justify-between"
                      >
                        <span className="truncate text-left">
                          {selectedOverrideArea
                            ? selectedOverrideArea.displayName ||
                              selectedOverrideArea.pillar ||
                              selectedOverrideArea.subDomain ||
                              selectedOverrideArea.projectCode
                            : "Keep derived mapping"}
                        </span>
                        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[420px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Find pillar..." />
                        <CommandList>
                          <CommandEmpty>No pillar found.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="keep-derived-mapping"
                              onSelect={() => {
                                setOverrideValues((current) => ({
                                  ...current,
                                  budgetAreaId: "",
                                }))
                                setPillarPickerOpen(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 size-4",
                                  !overrideValues.budgetAreaId ? "opacity-100" : "opacity-0"
                                )}
                              />
                              Keep derived mapping
                            </CommandItem>
                            {pillarOptions.map((option) => (
                              <CommandItem
                                key={option.id}
                                value={`${option.label} ${option.detail}`}
                                onSelect={() => {
                                  setOverrideValues((current) => ({
                                    ...current,
                                    budgetAreaId: option.id,
                                  }))
                                  setPillarPickerOpen(false)
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 size-4",
                                    overrideValues.budgetAreaId === option.id
                                      ? "opacity-100"
                                      : "opacity-0"
                                  )}
                                />
                                <div className="flex min-w-0 flex-col">
                                  <span className="truncate font-medium">{option.label}</span>
                                  <span className="text-muted-foreground text-xs">
                                    {option.detail}
                                  </span>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                {selectedOverrideArea ? (
                  <div className="grid gap-3 rounded-xl border border-dashed border-border px-4 py-3 text-sm md:grid-cols-4">
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Domain
                      </div>
                      <div className="mt-1 font-medium">
                        {selectedOverrideArea.domain || "Unmapped"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Sub-domain
                      </div>
                      <div className="mt-1 font-medium">
                        {selectedOverrideArea.subDomain || "Unmapped"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Cost Center
                      </div>
                      <div className="mt-1 font-medium">{selectedOverrideArea.costCenter}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Project Code
                      </div>
                      <div className="mt-1 font-medium">{selectedOverrideArea.projectCode}</div>
                    </div>
                  </div>
                ) : null}
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
                          domain: selectedOverrideArea?.domain || null,
                          subDomain: selectedOverrideArea?.subDomain || null,
                          budgetAreaId: overrideValues.budgetAreaId || null,
                          funding: selectedOverrideArea?.funding || null,
                          pillar:
                            selectedOverrideArea?.displayName ||
                            selectedOverrideArea?.pillar ||
                            selectedOverrideArea?.subDomain ||
                            null,
                          costCenter: selectedOverrideArea?.costCenter || null,
                          projectCode: selectedOverrideArea?.projectCode || null,
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
