"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { PenLine } from "lucide-react"
import { toast } from "sonner"
import { GuidanceHover } from "@/components/finance/guidance-hover"
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
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { MONTH_NAMES } from "@/lib/finance/constants"
import { formatCurrency, formatPercent } from "@/lib/finance/format"
import type { AppRole } from "@/lib/roles"
import { cn } from "@/lib/utils"

type TrackingYearOption = {
  id: string
  year: number
  isActive: boolean
}

type ForecastMonthRow = {
  monthIndex: number
  actualAmountDkk: number
  actualAmountRaw: number | null
  actualCurrency: "DKK" | "EUR" | "USD"
  exchangeRateUsed: number | null
  forecastOverrideAmount: number | null
  forecastIncluded: boolean
  notes: string | null
}

type ForecastSeatRow = {
  id: string
  seatId: string
  domain: string | null
  subDomain: string | null
  team: string | null
  inSeat: string | null
  description: string | null
  band: string | null
  status: string | null
  resourceType: string | null
  location: string | null
  allocation: number
  startDate: string | Date | null
  endDate: string | Date | null
  totalSpent: number
  totalForecast: number
  baseTotalForecast: number
  baseMonthlyForecast: number[]
  monthlyForecast: number[]
  months: ForecastMonthRow[]
}

type ForecastsBrowserProps = {
  userName: string
  userEmail: string
  userRole: AppRole
  activeYear: number
  trackingYears: TrackingYearOption[]
  seats: ForecastSeatRow[]
  totalSeatCount: number
  selectedSeatId: string | null
  filters: {
    subDomains: string[]
    teams: string[]
    seatIds: string[]
    names: string[]
    statuses: string[]
    hideInactiveStatuses: boolean
    nonMonthStart: boolean
    nonMonthEnd: boolean
    reducedOnLeaveForecast: boolean
  }
  filterOptions: {
    subDomains: string[]
    teams: string[]
    statuses: string[]
    seats: {
      id: string
      seatId: string
      name: string
      team: string
      subDomain: string
      status: string
    }[]
  }
  internalCostServiceMessage: string | null
}

type MonthDraft = {
  forecastOverrideAmount: string
  forecastIncluded: boolean
}

async function fetchJson(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init)
  const body = await response.json()

  if (!response.ok) {
    throw new Error(body.error || "Request failed")
  }

  return body
}

function formatOptionalDate(value: string | Date | null | undefined) {
  if (!value) {
    return "n/a"
  }

  const parsed = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return "n/a"
  }

  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed)
}

function normalizeStatus(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ""
}

function buildMonthDrafts(seat: ForecastSeatRow | undefined) {
  return Object.fromEntries(
    MONTH_NAMES.map((_, monthIndex) => {
      const month = seat?.months.find((entry) => entry.monthIndex === monthIndex)

      return [
        monthIndex,
        {
          forecastOverrideAmount:
            month?.forecastOverrideAmount === null ||
            month?.forecastOverrideAmount === undefined
              ? ""
              : String(month.forecastOverrideAmount),
          forecastIncluded: month?.forecastIncluded ?? true,
        } satisfies MonthDraft,
      ]
    })
  ) as Record<number, MonthDraft>
}

export function ForecastsBrowser({
  userName,
  userEmail,
  userRole,
  activeYear,
  trackingYears,
  seats,
  totalSeatCount,
  selectedSeatId,
  filters,
  filterOptions,
  internalCostServiceMessage,
}: ForecastsBrowserProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [isSaving, startSavingTransition] = useTransition()
  const [selectedYear, setSelectedYear] = useState(String(activeYear))
  const [hideInactiveStatuses, setHideInactiveStatuses] = useState(
    filters.hideInactiveStatuses
  )
  const [nonMonthStart, setNonMonthStart] = useState(filters.nonMonthStart)
  const [nonMonthEnd, setNonMonthEnd] = useState(filters.nonMonthEnd)
  const [reducedOnLeaveForecast, setReducedOnLeaveForecast] = useState(
    filters.reducedOnLeaveForecast
  )
  const [monthDrafts, setMonthDrafts] = useState<Record<number, MonthDraft>>({})

  const selectedSeat = seats.find((seat) => seat.id === selectedSeatId) ?? seats[0]

  useEffect(() => {
    setSelectedYear(String(activeYear))
  }, [activeYear])

  useEffect(() => {
    setHideInactiveStatuses(filters.hideInactiveStatuses)
    setNonMonthStart(filters.nonMonthStart)
    setNonMonthEnd(filters.nonMonthEnd)
    setReducedOnLeaveForecast(filters.reducedOnLeaveForecast)
  }, [
    filters.hideInactiveStatuses,
    filters.nonMonthEnd,
    filters.nonMonthStart,
    filters.reducedOnLeaveForecast,
  ])

  useEffect(() => {
    setMonthDrafts(buildMonthDrafts(selectedSeat))
  }, [selectedSeat])

  const forecastTotals = selectedSeat
    ? MONTH_NAMES.reduce(
        (totals, _, monthIndex) => {
          const draft = monthDrafts[monthIndex] ?? {
            forecastOverrideAmount: "",
            forecastIncluded: true,
          }
          const derived = selectedSeat.baseMonthlyForecast[monthIndex] ?? 0
          const effective =
            draft.forecastIncluded === false
              ? 0
              : draft.forecastOverrideAmount.trim()
                ? Number(draft.forecastOverrideAmount)
                : (selectedSeat.monthlyForecast[monthIndex] ?? 0)

          return {
            derived: totals.derived + derived,
            effective: totals.effective + effective,
          }
        },
        {
          derived: 0,
          effective: 0,
        }
      )
    : null

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
      router.replace(`/forecasts?${params.toString()}`, { scroll: false })
    })
  }

  function handleFilterSubmit(event: React.FormEvent<HTMLFormElement>) {
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
    if (year) {
      params.set("year", year)
    }

    appendValues("subDomain", formData.getAll("subDomain"))
    appendValues("team", formData.getAll("team"))
    appendValues("seatId", formData.getAll("seatId"))
    appendValues("name", formData.getAll("name"))
    appendValues("status", formData.getAll("status"))

    if (formData.get("hideInactiveStatuses") === "true") {
      params.set("hideInactiveStatuses", "true")
    } else {
      params.set("hideInactiveStatuses", "false")
    }

    if (formData.get("nonMonthStart") === "true") {
      params.set("nonMonthStart", "true")
    }

    if (formData.get("nonMonthEnd") === "true") {
      params.set("nonMonthEnd", "true")
    }

    if (formData.get("reducedOnLeaveForecast") === "true") {
      params.set("reducedOnLeaveForecast", "true")
    }

    startTransition(() => {
      router.replace(`/forecasts?${params.toString()}`, { scroll: false })
    })
  }

  function resetFilters() {
    setHideInactiveStatuses(true)
    setNonMonthStart(false)
    setNonMonthEnd(false)
    setReducedOnLeaveForecast(false)
    updateParams({
      year: selectedYear,
      subDomain: null,
      team: null,
      seatId: null,
      name: null,
      status: null,
      hideInactiveStatuses: "true",
      nonMonthStart: null,
      nonMonthEnd: null,
      reducedOnLeaveForecast: null,
      selectedSeatId: null,
    })
  }

  async function saveForecastOverrides() {
    if (!selectedSeat) {
      return
    }

    try {
      const payloads = MONTH_NAMES.map((_, monthIndex) => {
        const draft = monthDrafts[monthIndex]
        const value = draft?.forecastOverrideAmount?.trim() ?? ""
        const parsedValue = value === "" ? null : Number(value)

        if (parsedValue !== null && !Number.isFinite(parsedValue)) {
          throw new Error(`Enter a valid forecast amount for ${MONTH_NAMES[monthIndex]}.`)
        }

        return {
          monthIndex,
          forecastOverrideAmount: parsedValue,
          forecastIncluded: draft?.forecastIncluded ?? true,
        }
      })

      await Promise.all(
        payloads.map((payload) => {
          return fetchJson(`/api/tracker-seats/${selectedSeat.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          })
        })
      )

      toast.success("Forecast overrides updated")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Request failed")
    }
  }

  return (
    <div className="min-h-screen brand-page-shell">
      <FinanceHeader
        title="Forecasts"
        subtitle="Review seat-level forecast coverage, override month values, and compare against actuals."
        userName={userName}
        userEmail={userEmail}
        userRole={userRole}
        activeYear={activeYear}
        currentPath="/forecasts"
      />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
        <Card className="brand-card">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>
              Narrow seats by scope, team, person, or current tracker status.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleFilterSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                <div className="space-y-2">
                  <Label htmlFor="forecast-year">Year</Label>
                  <select
                    id="forecast-year"
                    name="year"
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                    value={selectedYear}
                    onChange={(event) => setSelectedYear(event.target.value)}
                  >
                    {trackingYears.map((year) => (
                      <option key={year.id} value={year.year}>
                        {year.year}
                      </option>
                    ))}
                  </select>
                </div>
                <MultiSelectFilter
                  key={`forecast-subDomains:${filters.subDomains.join("|")}`}
                  label="Sub-domain"
                  name="subDomain"
                  options={filterOptions.subDomains}
                  selectedValues={filters.subDomains}
                />
                <MultiSelectFilter
                  key={`forecast-teams:${filters.teams.join("|")}`}
                  label="Team"
                  name="team"
                  options={filterOptions.teams}
                  selectedValues={filters.teams}
                />
                <MultiSelectFilter
                  key={`forecast-seatIds:${filters.seatIds.join("|")}`}
                  label="Seat ID"
                  name="seatId"
                  options={Array.from(
                    new Set(filterOptions.seats.map((seat) => seat.seatId).filter(Boolean))
                  ).sort((left, right) => left.localeCompare(right))}
                  selectedValues={filters.seatIds}
                />
                <MultiSelectFilter
                  key={`forecast-names:${filters.names.join("|")}`}
                  label="Name"
                  name="name"
                  options={Array.from(
                    new Set(filterOptions.seats.map((seat) => seat.name).filter(Boolean))
                  ).sort((left, right) => left.localeCompare(right))}
                  selectedValues={filters.names}
                />
                <MultiSelectFilter
                  key={`forecast-statuses:${filters.statuses.join("|")}`}
                  label="Status"
                  name="status"
                  options={filterOptions.statuses}
                  selectedValues={filters.statuses}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="flex items-center justify-between rounded-xl brand-soft-panel px-4 py-3">
                  <div className="pr-4">
                    <div className="text-sm font-medium">Hide inactive statuses</div>
                    <div className="text-xs text-muted-foreground">
                      Ignore cancelled and closed forecast seats by default.
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {hideInactiveStatuses ? (
                      <input type="hidden" name="hideInactiveStatuses" value="true" />
                    ) : null}
                    <Switch
                      checked={hideInactiveStatuses}
                      onCheckedChange={setHideInactiveStatuses}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl brand-soft-panel px-4 py-3">
                  <div className="pr-4">
                    <div className="text-sm font-medium">Non-month start dates</div>
                    <div className="text-xs text-muted-foreground">
                      Show seats whose start date is not the 1st of a month.
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {nonMonthStart ? (
                      <input type="hidden" name="nonMonthStart" value="true" />
                    ) : null}
                    <Switch checked={nonMonthStart} onCheckedChange={setNonMonthStart} />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl brand-soft-panel px-4 py-3">
                  <div className="pr-4">
                    <div className="text-sm font-medium">Non-month end dates</div>
                    <div className="text-xs text-muted-foreground">
                      Show seats whose end date is not the last day of a month.
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {nonMonthEnd ? (
                      <input type="hidden" name="nonMonthEnd" value="true" />
                    ) : null}
                    <Switch checked={nonMonthEnd} onCheckedChange={setNonMonthEnd} />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl brand-soft-panel px-4 py-3">
                  <div className="pr-4">
                    <div className="text-sm font-medium">Reduced on-leave forecasts</div>
                    <div className="text-xs text-muted-foreground">
                      Show on-leave seats in Denmark, UK, Poland, or USA.
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {reducedOnLeaveForecast ? (
                      <input
                        type="hidden"
                        name="reducedOnLeaveForecast"
                        value="true"
                      />
                    ) : null}
                    <Switch
                      checked={reducedOnLeaveForecast}
                      onCheckedChange={setReducedOnLeaveForecast}
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={isPending}>
                  Apply filters
                </Button>
                <Button type="button" variant="outline" onClick={resetFilters} disabled={isPending}>
                  Reset
                </Button>
              </div>
              <div className="text-sm text-muted-foreground">
                Showing {seats.length} of {totalSeatCount} seats
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <Card className="flex h-fit flex-col brand-card lg:sticky lg:top-6 lg:max-h-[calc(100vh-2.5rem)]">
            <CardHeader>
              <CardTitle>Seat Overview</CardTitle>
              <CardDescription>
                Sorted by name to expose duplicate seat assignments for the same person.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 p-0">
              <ScrollArea className="max-h-[calc(100vh-12rem)] flex-1 lg:max-h-[calc(100vh-11rem)]">
                <div className="space-y-2 p-4">
                  {seats.map((seat) => {
                    const isSelected = seat.id === selectedSeat?.id
                    const isOnLeave = normalizeStatus(seat.status) === "on leave"
                    const hasAdjustments = seat.months.some(
                      (month) =>
                        month.forecastOverrideAmount !== null ||
                        month.forecastIncluded === false
                    )
                    const hasAdjustedTotal =
                      hasAdjustments &&
                      Math.abs(seat.baseTotalForecast - seat.totalForecast) > 0.009

                    return (
                      <div
                        key={seat.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => updateParams({ selectedSeatId: seat.id })}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault()
                            updateParams({ selectedSeatId: seat.id })
                          }
                        }}
                        className={cn(
                          "w-full rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2",
                          isSelected
                            ? "border-rose-400 brand-selected-row shadow-sm"
                            : "border-border/70 brand-soft-panel hover:bg-rose-50/70 dark:hover:bg-rose-950/25"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium">{seat.inSeat || "Unassigned"}</div>
                            <div className="text-sm text-muted-foreground">
                              {seat.seatId} · {seat.team || "No team"}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {seat.description || "No role"}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {[seat.band || "No band", seat.location || "No location"].join(" · ")}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{seat.status || "No status"}</Badge>
                            {isOnLeave ? (
                              <GuidanceHover
                                content={internalCostServiceMessage}
                                label="Internal cost guidance"
                                className="size-6"
                              />
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-3 text-sm text-muted-foreground">
                          {seat.subDomain || "Unmapped"}
                        </div>
                        <div className="mt-3 flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            {formatPercent(seat.allocation)}
                          </span>
                          <div className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {hasAdjustments ? (
                                <PenLine className="size-3.5 text-rose-700 dark:text-rose-300" aria-hidden="true" />
                              ) : null}
                              <span className="font-medium">{formatCurrency(seat.totalForecast)}</span>
                            </div>
                            {hasAdjustedTotal ? (
                              <div className="text-xs text-muted-foreground">
                                Base {formatCurrency(seat.baseTotalForecast)}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {seats.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                      No seats match the current filters.
                    </div>
                  ) : null}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="flex h-full flex-col brand-card">
            <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle>Seat Forecast Detail</CardTitle>
                <CardDescription>
                  Inspect actuals alongside month-level forecast overrides for the selected seat.
                </CardDescription>
              </div>
              <Button
                onClick={() => startSavingTransition(() => void saveForecastOverrides())}
                disabled={!selectedSeat || isSaving}
              >
                Save forecast overrides
              </Button>
            </CardHeader>
            <CardContent>
              {selectedSeat ? (
                <div className="space-y-6">
                  <div className="grid gap-4 rounded-2xl brand-soft-panel p-4 md:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Person
                      </div>
                      <div className="mt-1 font-medium">
                        {selectedSeat.inSeat || "Unassigned"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {selectedSeat.seatId}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Scope
                      </div>
                      <div className="mt-1 font-medium">
                        {selectedSeat.subDomain || "Unmapped"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {selectedSeat.team || "No team"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Status
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="outline">{selectedSeat.status || "No status"}</Badge>
                        {normalizeStatus(selectedSeat.status) === "on leave" ? (
                          <GuidanceHover
                            content={internalCostServiceMessage}
                            label="Internal cost guidance"
                          />
                        ) : null}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Window
                      </div>
                      <div className="mt-1 font-medium">
                        {formatOptionalDate(selectedSeat.startDate)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        to {formatOptionalDate(selectedSeat.endDate)}
                      </div>
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead>Derived</TableHead>
                        <TableHead>Override</TableHead>
                        <TableHead>Effective</TableHead>
                        <TableHead>Actual</TableHead>
                        <TableHead>Raw</TableHead>
                        <TableHead>Forecast On</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {MONTH_NAMES.map((monthName, monthIndex) => {
                        const month = selectedSeat.months.find(
                          (entry) => entry.monthIndex === monthIndex
                        )
                        const draft = monthDrafts[monthIndex] ?? {
                          forecastOverrideAmount: "",
                          forecastIncluded: true,
                        }
                        const hasActual = (month?.actualAmountRaw ?? month?.actualAmountDkk ?? 0) > 0
                        const currentEffectiveForecast =
                          draft.forecastIncluded === false
                            ? 0
                            : draft.forecastOverrideAmount.trim()
                              ? Number(draft.forecastOverrideAmount)
                              : (selectedSeat.monthlyForecast[monthIndex] ?? 0)

                        return (
                          <TableRow key={monthName}>
                            <TableCell className="font-medium">{monthName}</TableCell>
                            <TableCell>
                              {formatCurrency(
                                selectedSeat.baseMonthlyForecast[monthIndex] ?? 0
                              )}
                            </TableCell>
                            <TableCell className="min-w-36">
                              <Input
                                type="number"
                                step="1"
                                inputMode="decimal"
                                value={draft.forecastOverrideAmount}
                                onChange={(event) =>
                                  setMonthDrafts((current) => ({
                                    ...current,
                                    [monthIndex]: {
                                      ...(current[monthIndex] ?? {
                                        forecastOverrideAmount: "",
                                        forecastIncluded: true,
                                      }),
                                      forecastOverrideAmount: event.target.value,
                                    },
                                  }))
                                }
                                placeholder="Use derived"
                              />
                            </TableCell>
                            <TableCell>{formatCurrency(currentEffectiveForecast)}</TableCell>
                            <TableCell>
                              <div className="font-medium">
                                {formatCurrency(month?.actualAmountDkk ?? 0)}
                              </div>
                              {hasActual ? (
                                <div className="text-xs text-rose-700 dark:text-rose-300">
                                  Actuals imported
                                </div>
                              ) : (
                                <div className="text-xs text-muted-foreground">No actuals</div>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {month?.actualAmountRaw ?? 0} {month?.actualCurrency || "DKK"}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Checkbox
                                  checked={draft.forecastIncluded}
                                  onCheckedChange={(checked) =>
                                    setMonthDrafts((current) => ({
                                      ...current,
                                      [monthIndex]: {
                                        ...(current[monthIndex] ?? {
                                          forecastOverrideAmount: "",
                                          forecastIncluded: true,
                                        }),
                                        forecastIncluded: checked === true,
                                      },
                                    }))
                                  }
                                />
                                <span className="text-sm">
                                  {draft.forecastIncluded ? "Included" : "Excluded"}
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>

                  <div className="grid gap-3 rounded-2xl border border-dashed border-rose-200 bg-rose-50/50 px-4 py-3 text-sm dark:border-rose-900/40 dark:bg-rose-950/20 md:grid-cols-4">
                    <div className="text-muted-foreground">Forecast totals</div>
                    <div>
                      <div className="text-xs text-muted-foreground">Derived</div>
                      <div className="font-medium">
                        {formatCurrency(forecastTotals?.derived ?? 0)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Effective</div>
                      <div className="font-medium">
                        {formatCurrency(forecastTotals?.effective ?? 0)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Delta</div>
                      <div className="font-medium">
                        {formatCurrency(
                          (forecastTotals?.effective ?? 0) - (forecastTotals?.derived ?? 0)
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    <Link
                      href={`/people-roster?year=${activeYear}&seatId=${encodeURIComponent(selectedSeat.seatId)}`}
                      className="brand-inline-link"
                    >
                      Open seat in People Roster
                    </Link>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a seat from the overview to edit forecast overrides.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
