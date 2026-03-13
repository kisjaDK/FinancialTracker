"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { GuidanceHover } from "@/components/finance/guidance-hover"
import { FinanceHeader } from "@/components/finance/header"
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
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
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
  band: string | null
  status: string | null
  resourceType: string | null
  allocation: number
  startDate: string | Date | null
  endDate: string | Date | null
  totalSpent: number
  totalForecast: number
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
  selectedSeatId: string | null
  filters: {
    subDomain: string
    team: string
    seatId: string
    name: string
    status: string
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

type SearchableSelectProps = {
  value: string
  options: string[]
  placeholder: string
  searchPlaceholder: string
  emptyLabel: string
  onValueChange: (value: string) => void
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

function SearchableSelect({
  value,
  options,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  onValueChange,
}: SearchableSelectProps) {
  return (
    <Combobox
      items={options}
      value={value}
      onValueChange={(nextValue) => onValueChange(nextValue ?? "")}
    >
      <ComboboxInput
        placeholder={searchPlaceholder}
        aria-label={placeholder}
        showClear={Boolean(value)}
        className="w-full"
      >
        <ComboboxValue placeholder={placeholder} />
      </ComboboxInput>
      <ComboboxContent>
        <ComboboxList>
          <ComboboxItem value="">
            <span>{placeholder}</span>
          </ComboboxItem>
          {options.map((option) => (
            <ComboboxItem key={option} value={option}>
              <span>{option}</span>
            </ComboboxItem>
          ))}
          <ComboboxEmpty>{emptyLabel}</ComboboxEmpty>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
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
  const [draftFilters, setDraftFilters] = useState(filters)
  const [monthDrafts, setMonthDrafts] = useState<Record<number, MonthDraft>>({})

  const selectedSeat = seats.find((seat) => seat.id === selectedSeatId) ?? seats[0]
  const filteredTeamOptions = useMemo(
    () =>
      filterOptions.teams.filter((team) => {
        if (!draftFilters.subDomain) {
          return true
        }

        return filterOptions.seats.some(
          (seat) =>
            seat.team === team && seat.subDomain === draftFilters.subDomain
        )
      }),
    [draftFilters.subDomain, filterOptions.seats, filterOptions.teams]
  )
  const downstreamSeatOptions = useMemo(
    () =>
      filterOptions.seats.filter((seat) => {
        if (draftFilters.subDomain && seat.subDomain !== draftFilters.subDomain) {
          return false
        }

        if (draftFilters.team && seat.team !== draftFilters.team) {
          return false
        }

        return true
      }),
    [draftFilters.subDomain, draftFilters.team, filterOptions.seats]
  )
  const filteredSeatIdOptions = useMemo(
    () =>
      Array.from(
        new Set(downstreamSeatOptions.map((seat) => seat.seatId).filter(Boolean))
      ).sort((left, right) => left.localeCompare(right)),
    [downstreamSeatOptions]
  )
  const filteredNameOptions = useMemo(
    () =>
      Array.from(
        new Set(downstreamSeatOptions.map((seat) => seat.name).filter(Boolean))
      ).sort((left, right) => left.localeCompare(right)),
    [downstreamSeatOptions]
  )

  useEffect(() => {
    setDraftFilters(filters)
  }, [filters])

  useEffect(() => {
    setSelectedYear(String(activeYear))
  }, [activeYear])

  useEffect(() => {
    setMonthDrafts(buildMonthDrafts(selectedSeat))
  }, [selectedSeat])

  useEffect(() => {
    setDraftFilters((current) => {
      const next = { ...current }
      let changed = false

      if (next.team && !filteredTeamOptions.includes(next.team)) {
        next.team = ""
        changed = true
      }

      if (next.seatId && !filteredSeatIdOptions.includes(next.seatId)) {
        next.seatId = ""
        changed = true
      }

      if (next.name && !filteredNameOptions.includes(next.name)) {
        next.name = ""
        changed = true
      }

      return changed ? next : current
    })
  }, [filteredNameOptions, filteredSeatIdOptions, filteredTeamOptions])

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
      router.push(`/forecasts?${params.toString()}`)
    })
  }

  function applyFilters() {
    updateParams({
      year: selectedYear,
      subDomain: draftFilters.subDomain || null,
      team: draftFilters.team || null,
      seatId: draftFilters.seatId || null,
      name: draftFilters.name || null,
      status: draftFilters.status || null,
      selectedSeatId: null,
    })
  }

  function resetFilters() {
    setDraftFilters({
      subDomain: "",
      team: "",
      seatId: "",
      name: "",
      status: "",
    })
    updateParams({
      year: selectedYear,
      subDomain: null,
      team: null,
      seatId: null,
      name: null,
      status: null,
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.12),_transparent_35%),linear-gradient(180deg,rgba(255,251,235,0.95),rgba(255,255,255,1))]">
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
        <Card className="border-amber-200/70 bg-white/90">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>
              Narrow seats by scope, team, person, or current tracker status.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <div className="space-y-2">
                <Label htmlFor="forecast-year">Year</Label>
                <select
                  id="forecast-year"
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
              <div className="space-y-2">
                <Label htmlFor="forecast-sub-domain">Sub-domain</Label>
                <select
                  id="forecast-sub-domain"
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                  value={draftFilters.subDomain}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      team: "",
                      seatId: "",
                      name: "",
                      subDomain: event.target.value,
                    }))
                  }
                >
                  <option value="">All sub-domains</option>
                  {filterOptions.subDomains.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="forecast-team">Team</Label>
                <select
                  id="forecast-team"
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                  value={draftFilters.team}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      seatId: "",
                      name: "",
                      team: event.target.value,
                    }))
                  }
                >
                  <option value="">All teams</option>
                  {filteredTeamOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Seat ID</Label>
                <SearchableSelect
                  value={draftFilters.seatId}
                  options={filteredSeatIdOptions}
                  placeholder="All seat IDs"
                  searchPlaceholder="Search seat ID"
                  emptyLabel="No seat IDs available"
                  onValueChange={(value) =>
                    setDraftFilters((current) => ({
                      ...current,
                      seatId: value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <SearchableSelect
                  value={draftFilters.name}
                  options={filteredNameOptions}
                  placeholder="All names"
                  searchPlaceholder="Search name"
                  emptyLabel="No names available"
                  onValueChange={(value) =>
                    setDraftFilters((current) => ({
                      ...current,
                      name: value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="forecast-status">Status</Label>
                <select
                  id="forecast-status"
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                  value={draftFilters.status}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      status: event.target.value,
                    }))
                  }
                >
                  <option value="">All statuses</option>
                  {filterOptions.statuses.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={applyFilters} disabled={isPending}>
                Apply filters
              </Button>
              <Button variant="outline" onClick={resetFilters} disabled={isPending}>
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <Card className="flex h-fit flex-col border-amber-200/70 bg-white/90 lg:sticky lg:top-6 lg:max-h-[calc(100vh-2.5rem)]">
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
                          "w-full rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2",
                          isSelected
                            ? "border-amber-400 bg-amber-50 shadow-sm"
                            : "border-border/70 bg-background hover:bg-accent"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium">{seat.inSeat || "Unassigned"}</div>
                            <div className="text-sm text-muted-foreground">
                              {seat.seatId} · {seat.team || "No team"}
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
                          {(seat.subDomain || "Unmapped")} · {seat.band || "No band"}
                        </div>
                        <div className="mt-3 flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            {formatPercent(seat.allocation)}
                          </span>
                          <span className="font-medium">{formatCurrency(seat.totalForecast)}</span>
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

          <Card className="flex h-full flex-col border-amber-200/70 bg-white/90">
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
                  <div className="grid gap-4 rounded-2xl bg-muted/40 p-4 md:grid-cols-2 xl:grid-cols-4">
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
                                <div className="text-xs text-emerald-700">Actuals imported</div>
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

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border px-4 py-3 text-sm">
                    <div className="text-muted-foreground">
                      Total forecast for seat
                    </div>
                    <div className="font-medium">{formatCurrency(selectedSeat.totalForecast)}</div>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    <Link
                      href={`/people-roster?year=${activeYear}&seatId=${encodeURIComponent(selectedSeat.seatId)}`}
                      className="underline underline-offset-4"
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
