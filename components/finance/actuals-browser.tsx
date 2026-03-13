"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { GuidanceHover } from "@/components/finance/guidance-hover"
import { FinanceHeader } from "@/components/finance/header"
import { Checkbox } from "@/components/ui/checkbox"
import { MONTH_NAMES, SUPPORTED_CURRENCIES } from "@/lib/finance/constants"
import { formatCurrency, formatFteAsPercent, formatNumber } from "@/lib/finance/format"
import type {
  ExternalActualImportBatchView,
  ExternalActualImportFilters,
  ExternalActualImportView,
} from "@/lib/finance/types"
import type { AppRole } from "@/lib/roles"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type TrackingYearOption = {
  id: string
  year: number
  isActive: boolean
}

type CheckedState = boolean | "indeterminate"

type SummaryRow = {
  id: string
  domain: string | null
  subDomain: string | null
  displayName: string
  seatCount: number
  activeSeatCount: number
  spentToDate: number
  totalForecast: number
}

type SeatRow = {
  id: string
  seatId: string
  domain: string | null
  subDomain: string | null
  team: string | null
  inSeat: string | null
  band: string | null
  status: string | null
  totalSpent: number
  totalForecast: number
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

type BulkForecastPreview = {
  monthIndex: number
  monthLabel: string
  subDomain: string | null
  seats: {
    trackerSeatId: string
    seatId: string
    inSeat: string | null
    team: string | null
    status: string | null
    allocationPercent: number
    requiresConfirmation: boolean
    amount: number
  }[]
}

type ActualsBrowserProps = {
  userName: string
  userEmail: string
  userRole: AppRole
  activeYear: number
  trackingYears: TrackingYearOption[]
  selectedAreaId: string | null
  summary: SummaryRow[]
  seats: SeatRow[]
  internalActualsMessage: string | null
  filters: ExternalActualImportFilters
  filterOptions: {
    users: string[]
    fileNames: string[]
    seatIds: string[]
    teams: string[]
  }
  imports: ExternalActualImportBatchView[]
  entries: ExternalActualImportView[]
  totals: {
    entryCount: number
    amount: number
    matchedCount: number
  }
}

async function fetchJson(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init)
  const body = await response.json()

  if (!response.ok) {
    throw new Error(body.error || "Request failed")
  }

  return body
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export function ActualsBrowser({
  userName,
  userEmail,
  userRole,
  activeYear,
  trackingYears,
  selectedAreaId,
  summary,
  seats,
  internalActualsMessage,
  filters,
  filterOptions,
  imports,
  entries,
  totals,
}: ActualsBrowserProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [isImporting, startImportTransition] = useTransition()
  const [isRollingBack, startRollbackTransition] = useTransition()
  const [selectedSeatId, setSelectedSeatId] = useState(seats[0]?.id ?? "")
  const [selectedMonth, setSelectedMonth] = useState("0")
  const [actualAmount, setActualAmount] = useState("")
  const [actualCurrency, setActualCurrency] = useState<"DKK" | "EUR" | "USD">("DKK")
  const [forecastIncluded, setForecastIncluded] = useState(true)
  const [bulkCopyDialogOpen, setBulkCopyDialogOpen] = useState(false)
  const [bulkCopyPreview, setBulkCopyPreview] = useState<BulkForecastPreview | null>(null)
  const [bulkCopyOverrides, setBulkCopyOverrides] = useState<Record<string, string>>({})
  const [bulkCopyConfirmations, setBulkCopyConfirmations] = useState<Record<string, boolean>>({})
  const [bulkCopyLoading, setBulkCopyLoading] = useState(false)
  const [selectedYear, setSelectedYear] = useState(String(activeYear))
  const [selectedImportYear, setSelectedImportYear] = useState(String(activeYear))
  const [fileInput, setFileInput] = useState<File | null>(null)
  const activeView =
    searchParams.get("view") === "external" ? "external" : "internal"

  const selectedArea = summary.find((row) => row.id === selectedAreaId) ?? summary[0]
  const effectiveSelectedAreaId = selectedAreaId ?? selectedArea?.id ?? null
  const selectedSeat = seats.find((seat) => seat.id === selectedSeatId) ?? seats[0]

  useEffect(() => {
    if (!selectedSeatId || !seats.some((seat) => seat.id === selectedSeatId)) {
      setSelectedSeatId(seats[0]?.id ?? "")
    }
  }, [selectedSeatId, seats])

  useEffect(() => {
    setSelectedYear(String(activeYear))
    setSelectedImportYear(String(activeYear))
  }, [activeYear])

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
      router.push(`/actuals?${params.toString()}`)
    })
  }

  async function saveSeatMonth() {
    if (!selectedSeatId) {
      return
    }

    try {
      await fetchJson(`/api/tracker-seats/${selectedSeatId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          monthIndex: Number(selectedMonth),
          actualAmount: Number(actualAmount || 0),
          actualCurrency,
          forecastIncluded,
        }),
      })
      toast.success("Monthly actual updated")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Request failed")
    }
  }

  async function copyForecastToInternalActuals() {
    if (!effectiveSelectedAreaId || !selectedArea?.subDomain) {
      return
    }

    try {
      setBulkCopyLoading(true)
      const response = (await fetchJson("/api/tracker/bulk-forecast-actuals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "preview",
          year: activeYear,
          budgetAreaId: effectiveSelectedAreaId,
          monthIndex: Number(selectedMonth),
        }),
      })) as BulkForecastPreview
      setBulkCopyPreview(response)
      setBulkCopyOverrides(
        Object.fromEntries(
          response.seats.map((seat) => [seat.trackerSeatId, String(seat.amount)])
        )
      )
      setBulkCopyConfirmations(
        Object.fromEntries(
          response.seats
            .filter((seat) => seat.requiresConfirmation)
            .map((seat) => [seat.trackerSeatId, false])
        )
      )
      setBulkCopyDialogOpen(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk update failed")
    } finally {
      setBulkCopyLoading(false)
    }
  }

  async function completeBulkForecastCopy() {
    if (!bulkCopyPreview || !effectiveSelectedAreaId) {
      return
    }

    try {
      setBulkCopyLoading(true)
      const response = await fetchJson("/api/tracker/bulk-forecast-actuals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "apply",
          year: activeYear,
          budgetAreaId: effectiveSelectedAreaId,
          monthIndex: bulkCopyPreview.monthIndex,
          overrides: bulkCopyPreview.seats.map((seat) => ({
            trackerSeatId: seat.trackerSeatId,
            amount: Number(bulkCopyOverrides[seat.trackerSeatId] || 0),
          })),
          confirmedTrackerSeatIds: bulkCopyPreview.seats
            .filter((seat) => bulkCopyConfirmations[seat.trackerSeatId])
            .map((seat) => seat.trackerSeatId),
        }),
      })

      toast.success(
        `Copied forecast to actuals for ${response.updatedCount} internal seat${
          response.updatedCount === 1 ? "" : "s"
        }.`
      )
      setBulkCopyDialogOpen(false)
      setBulkCopyPreview(null)
      setBulkCopyConfirmations({})
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk update failed")
    } finally {
      setBulkCopyLoading(false)
    }
  }

  const pendingOnLeaveConfirmations =
    bulkCopyPreview?.seats.filter(
      (seat) => seat.requiresConfirmation && !bulkCopyConfirmations[seat.trackerSeatId]
    ) ?? []

  function updateBulkCopyConfirmation(trackerSeatId: string, checked: CheckedState) {
    setBulkCopyConfirmations((current) => ({
      ...current,
      [trackerSeatId]: checked === true,
    }))
  }

  function handleImport() {
    if (!fileInput) {
      toast.error("Choose a CSV file to import.")
      return
    }

    startImportTransition(async () => {
      try {
        const formData = new FormData()
        formData.set("file", fileInput)
        formData.set("year", selectedImportYear)

        const response = await fetch("/api/imports/external-actuals", {
          method: "POST",
          body: formData,
        })
        const body = await response.json()

        if (!response.ok) {
          throw new Error(body.error || "Import failed")
        }

        toast.success(`Imported ${fileInput.name}`)
        const nextUrl = new URLSearchParams()
        nextUrl.set("year", selectedImportYear)
        if (effectiveSelectedAreaId) {
          nextUrl.set("budgetAreaId", effectiveSelectedAreaId)
        }
        window.location.href = `/actuals?${nextUrl.toString()}`
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Import failed")
      }
    })
  }

  function handleRollback(importId: string, fileName: string) {
    if (!window.confirm(`Roll back external actual import ${fileName}?`)) {
      return
    }

    startRollbackTransition(async () => {
      try {
        const response = await fetch(
          `/api/external-actual-imports/${importId}/rollback`,
          {
            method: "POST",
          }
        )
        const body = await response.json()

        if (!response.ok) {
          throw new Error(body.error || "Rollback failed")
        }

        toast.success(`Rolled back ${fileName}`)
        window.location.href = window.location.pathname + window.location.search
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Rollback failed")
      }
    })
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(187,108,37,0.16),_transparent_32%),linear-gradient(180deg,_rgba(255,250,243,1)_0%,_rgba(246,240,232,1)_100%)]">
      <FinanceHeader
        title="Actuals"
        subtitle="Work separately with internal monthly actuals and imported external actuals."
        userName={userName}
        userEmail={userEmail}
        userRole={userRole}
        activeYear={activeYear}
        currentPath="/actuals"
      />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <Dialog
          open={bulkCopyDialogOpen}
          onOpenChange={(open) => {
            setBulkCopyDialogOpen(open)
            if (!open) {
              setBulkCopyPreview(null)
              setBulkCopyConfirmations({})
            }
          }}
        >
          <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle>Review forecast copy to actuals</DialogTitle>
                <GuidanceHover
                  content={internalActualsMessage}
                  label="Internal actuals service message"
                />
              </div>
              <DialogDescription>
                {bulkCopyPreview
                  ? `Month: ${bulkCopyPreview.monthLabel}. Review the internal seats in ${
                      bulkCopyPreview.subDomain || "the selected sub-domain"
                    } before completing the copy.`
                  : "Review the affected seats before completing the copy."}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[55vh] overflow-y-auto pr-2">
              {bulkCopyPreview?.seats.length ? (
                <div className="space-y-3">
                  {bulkCopyPreview.seats.map((seat) => (
                    <div
                      key={seat.trackerSeatId}
                      className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-[1.4fr_0.8fr_0.8fr]"
                    >
                      <div>
                        <div className="flex items-center gap-2 font-medium">
                          <span>
                            {seat.seatId} · {seat.inSeat || "Unassigned"} · {formatFteAsPercent(seat.allocationPercent)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {seat.team || "No team"} · {bulkCopyPreview.monthLabel}
                        </div>
                        {seat.requiresConfirmation ? (
                          <label className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                            <Checkbox
                              checked={bulkCopyConfirmations[seat.trackerSeatId] ?? false}
                              onCheckedChange={(checked) =>
                                updateBulkCopyConfirmation(seat.trackerSeatId, checked)
                              }
                              className="mt-0.5"
                            />
                            <span>
                              Confirm this seat is on leave and should still receive copied
                              internal actuals.
                            </span>
                          </label>
                        ) : null}
                      </div>
                      <div className="text-sm">
                        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          Forecast
                        </div>
                        <div className="mt-1 font-medium">{formatCurrency(seat.amount)}</div>
                        <Badge variant="secondary" className="mt-2">
                          {seat.status || "No status"}
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`bulk-amount-${seat.trackerSeatId}`}>Override Actual</Label>
                        <Input
                          id={`bulk-amount-${seat.trackerSeatId}`}
                          type="number"
                          inputMode="decimal"
                          value={bulkCopyOverrides[seat.trackerSeatId] ?? ""}
                          onChange={(event) =>
                            setBulkCopyOverrides((current) => ({
                              ...current,
                              [seat.trackerSeatId]: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-4 text-sm text-muted-foreground">
                  No active internal seats with forecast for{" "}
                  {bulkCopyPreview?.monthLabel || "the selected month"}.
                </p>
              )}
            </div>
            <DialogFooter>
              {pendingOnLeaveConfirmations.length > 0 ? (
                <div className="mr-auto text-sm text-amber-900">
                  Confirm {pendingOnLeaveConfirmations.length} on-leave seat
                  {pendingOnLeaveConfirmations.length === 1 ? "" : "s"} before completing.
                </div>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setBulkCopyDialogOpen(false)
                  setBulkCopyPreview(null)
                  setBulkCopyConfirmations({})
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={
                  !bulkCopyPreview?.seats.length ||
                  bulkCopyLoading ||
                  pendingOnLeaveConfirmations.length > 0
                }
                onClick={() => void completeBulkForecastCopy()}
              >
                Complete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Manual month entries and forecast copy
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose the year and sub-domain you are working on, then update seat actuals or copy monthly forecast into internal actuals.
            </p>
          </div>

          <section className="grid gap-4 md:grid-cols-4">
            <Card className="border-amber-200/70 bg-white/90">
              <CardHeader className="gap-1">
                <CardDescription>Selected Sub-domain</CardDescription>
                <CardTitle>{selectedArea?.subDomain || "Unmapped"}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-amber-200/70 bg-white/90">
              <CardHeader className="gap-1">
                <CardDescription>Seats In Scope</CardDescription>
                <CardTitle>{formatNumber(selectedArea?.seatCount ?? 0)}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-amber-200/70 bg-white/90">
              <CardHeader className="gap-1">
                <CardDescription>Spent To Date</CardDescription>
                <CardTitle>{formatCurrency(selectedArea?.spentToDate ?? 0)}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-amber-200/70 bg-white/90">
              <CardHeader className="gap-1">
                <CardDescription>Forecast Remaining</CardDescription>
                <CardTitle>{formatCurrency(selectedArea?.totalForecast ?? 0)}</CardTitle>
              </CardHeader>
            </Card>
          </section>
        </section>

        <Tabs
          value={activeView}
          onValueChange={(value) =>
            updateParams({ view: value === "external" ? "external" : "internal" })
          }
          className="gap-4"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Actuals Workspace</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Switch between internal and external actuals without leaving the page.
              </p>
            </div>
            <TabsList className="bg-white/80">
              <TabsTrigger value="internal">Internals</TabsTrigger>
              <TabsTrigger value="external">Externals</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="internal" className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                Internal Actuals
              </p>
              <h3 className="mt-1 text-2xl font-semibold tracking-tight">Internal workflow</h3>
            </div>

            <Card className="border-amber-200/70 bg-white/90">
              <CardHeader className="flex-row items-end justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle>Internal Actuals Controls</CardTitle>
                    <GuidanceHover
                      content={internalActualsMessage}
                      label="Internal actuals service message"
                    />
                  </div>
                  <CardDescription>
                    Scope the internal actuals work before editing seat-month values.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-[180px_1fr]">
                <div className="space-y-2">
                  <Label htmlFor="internal-year">Year</Label>
                  <select
                    id="internal-year"
                    value={selectedYear}
                    disabled={isPending}
                    onChange={(event) => {
                      setSelectedYear(event.target.value)
                      updateParams({ year: event.target.value })
                    }}
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                  >
                    {trackingYears.map((year) => (
                      <option key={year.id} value={year.year}>
                        {year.year}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="internal-subdomain">Sub-domain</Label>
                  <select
                    id="internal-subdomain"
                    value={effectiveSelectedAreaId ?? ""}
                    disabled={isPending || summary.length === 0}
                    onChange={(event) =>
                      updateParams({ budgetAreaId: event.target.value || null })
                    }
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                  >
                    {summary.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.displayName} ({row.domain || "Unmapped"} / {row.subDomain || "Unmapped"})
                      </option>
                    ))}
                  </select>
                </div>
              </CardContent>
            </Card>

            <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <Card className="border-amber-200/70 bg-white/90">
              <CardHeader>
                <CardTitle>Internal Seats</CardTitle>
                <CardDescription>
                  Seats currently mapped to {selectedArea?.subDomain || "the selected sub-domain"}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Seat</TableHead>
                      <TableHead>Resource</TableHead>
                      <TableHead>Spent</TableHead>
                      <TableHead>Forecast</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {seats.map((seat) => (
                      <TableRow
                        key={seat.id}
                        className={seat.id === selectedSeatId ? "bg-amber-50" : "cursor-pointer"}
                        onClick={() => setSelectedSeatId(seat.id)}
                      >
                        <TableCell>
                          <div className="font-medium">{seat.seatId}</div>
                          <div className="text-xs text-muted-foreground">
                            {seat.team || "No team"} · {seat.subDomain || "Unmapped"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>{seat.inSeat || "Unassigned"}</div>
                          <div className="text-xs text-muted-foreground">
                            {seat.band || "No band"} · {seat.status || "No status"}
                          </div>
                        </TableCell>
                        <TableCell>{formatCurrency(seat.totalSpent)}</TableCell>
                        <TableCell>{formatCurrency(seat.totalForecast)}</TableCell>
                      </TableRow>
                    ))}
                    {seats.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                          No internal seats are available for the selected sub-domain and year.
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
                    Review forecast and actual values before updating a month.
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
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No seat selected.</p>
                  )}
                </CardContent>
              </Card>

              <Card className="border-amber-200/70 bg-white/90">
                <CardHeader>
                  <CardTitle>Monthly Actuals</CardTitle>
                  <CardDescription>
                    Enter manual internal actual spend or bulk copy forecast for the selected month.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="seat-select">Seat</Label>
                    <select
                      id="seat-select"
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
                  {internalActualsMessage ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                      <div className="flex items-center gap-2 font-medium">
                        <span>Internal actuals service message</span>
                        <GuidanceHover
                          content={internalActualsMessage}
                          label="Internal actuals service message"
                        />
                      </div>
                      <div className="mt-1 text-amber-900/80">
                        Hover the info icon to review the instructions before entering or copying
                        actuals.
                      </div>
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="month-select">Month</Label>
                      <select
                        id="month-select"
                        className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                        value={selectedMonth}
                        onChange={(event) => setSelectedMonth(event.target.value)}
                      >
                        {MONTH_NAMES.map((month, index) => (
                          <option key={month} value={index}>
                            {month}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="actual-amount">Actual Spend</Label>
                      <Input
                        id="actual-amount"
                        type="number"
                        inputMode="decimal"
                        value={actualAmount}
                        onChange={(event) => setActualAmount(event.target.value)}
                        placeholder="25000"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="actual-currency">Input Currency</Label>
                    <select
                      id="actual-currency"
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                      value={actualCurrency}
                      onChange={(event) =>
                        setActualCurrency(event.target.value as "DKK" | "EUR" | "USD")
                      }
                    >
                      {SUPPORTED_CURRENCIES.map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={forecastIncluded}
                      onChange={(event) => setForecastIncluded(event.target.checked)}
                    />
                    Keep forecast for this month
                  </label>
                  <Button
                    type="button"
                    disabled={!selectedSeatId}
                    onClick={() => void saveSeatMonth()}
                  >
                    Save Month
                  </Button>
                  <div className="rounded-xl border border-dashed border-border px-4 py-3 text-sm">
                    <div className="font-medium">Bulk copy forecast to actuals</div>
                    <div className="mt-1 text-muted-foreground">
                      Copy the selected month&apos;s forecast into actuals for all internal seats in{" "}
                      {selectedArea?.subDomain || "the selected sub-domain"}.
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3"
                      disabled={
                        !effectiveSelectedAreaId || !selectedArea?.subDomain || bulkCopyLoading
                      }
                      onClick={() => void copyForecastToInternalActuals()}
                    >
                      Copy {MONTH_NAMES[Number(selectedMonth)]} Forecast For Internal Seats
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
            </section>
          </TabsContent>

          <TabsContent value="external" className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                External Actuals
              </p>
              <h3 className="mt-1 text-2xl font-semibold tracking-tight">
                Imported external spend
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Import CSV data, review batches, and filter imported external seat-month rows.
              </p>
            </div>

            <section className="grid gap-4 md:grid-cols-3">
            <Card className="border-amber-200/70 bg-white/90">
              <CardHeader className="gap-1">
                <CardDescription>Imported Entries</CardDescription>
                <CardTitle>{formatNumber(totals.entryCount)}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-amber-200/70 bg-white/90">
              <CardHeader className="gap-1">
                <CardDescription>Imported Amount</CardDescription>
                <CardTitle>{formatCurrency(totals.amount)}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-amber-200/70 bg-white/90">
              <CardHeader className="gap-1">
                <CardDescription>Matched Seats</CardDescription>
                <CardTitle>{formatNumber(totals.matchedCount)}</CardTitle>
              </CardHeader>
            </Card>
            </section>

            <Card className="border-amber-200/70 bg-white/90">
            <CardHeader>
              <CardTitle>Import CSV</CardTitle>
              <CardDescription>
                Match imported amounts to seat ID and month columns like Jan-26 ID, Feb-26 ID, and later months.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-[140px_1fr_auto]">
              <div className="space-y-2">
                <Label htmlFor="external-year">Year</Label>
                <select
                  id="external-year"
                  value={selectedImportYear}
                  onChange={(event) => setSelectedImportYear(event.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                >
                  {trackingYears.map((year) => (
                    <option key={year.id} value={year.year}>
                      {year.year}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="external-file">CSV file</Label>
                <Input
                  id="external-file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => setFileInput(event.target.files?.[0] ?? null)}
                />
              </div>
              <div className="flex items-end">
                <Button type="button" onClick={handleImport} disabled={isImporting}>
                  {isImporting ? "Importing..." : "Import"}
                </Button>
              </div>
            </CardContent>
            </Card>

            <Card className="border-amber-200/70 bg-white/90">
            <CardHeader>
              <CardTitle>Import History</CardTitle>
              <CardDescription>
                Roll back an external actual import batch. Only the user who created the import can do this.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Imported</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Rows</TableHead>
                    <TableHead>Entries</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Matched</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {imports.map((importBatch) => {
                    const canRollback =
                      importBatch.importedByEmail?.toLowerCase() === userEmail.toLowerCase()

                    return (
                      <TableRow key={importBatch.id}>
                        <TableCell>{formatDateTime(importBatch.importedAt)}</TableCell>
                        <TableCell>{importBatch.fileName}</TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {importBatch.importedByName || "Unknown user"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {importBatch.importedByEmail || "No email"}
                          </div>
                        </TableCell>
                        <TableCell>{formatNumber(importBatch.rowCount)}</TableCell>
                        <TableCell>{formatNumber(importBatch.entryCount)}</TableCell>
                        <TableCell>{formatCurrency(importBatch.amount)}</TableCell>
                        <TableCell>{formatNumber(importBatch.matchedCount)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!canRollback || isRollingBack}
                            onClick={() =>
                              handleRollback(importBatch.id, importBatch.fileName)
                            }
                          >
                            Roll Back
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {imports.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        No import history matches the current filters.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
            </Card>

            <Card className="border-amber-200/70 bg-white/90">
            <CardHeader>
              <CardTitle>Filters</CardTitle>
              <CardDescription>
                Filter imported external actual rows by user, file name, and import time.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form method="GET" className="grid gap-4 lg:grid-cols-[0.8fr_1fr_1fr_1fr_1fr_1fr_1fr_auto]">
                <input type="hidden" name="budgetAreaId" value={effectiveSelectedAreaId ?? ""} />
                <div className="space-y-2">
                  <Label htmlFor="year">Year</Label>
                  <select
                    id="year"
                    name="year"
                    defaultValue={String(activeYear)}
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                  >
                    {trackingYears.map((year) => (
                      <option key={year.id} value={year.year}>
                        {year.year}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user">User</Label>
                  <Input id="user" name="user" list="external-users" defaultValue={filters.user} placeholder="Name or email" />
                  <datalist id="external-users">
                    {filterOptions.users.map((user) => (
                      <option key={user} value={user} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fileName">Filename</Label>
                  <Input id="fileName" name="fileName" list="external-files" defaultValue={filters.fileName} placeholder="CSV filename" />
                  <datalist id="external-files">
                    {filterOptions.fileNames.map((fileName) => (
                      <option key={fileName} value={fileName} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="seatId">Seat ID</Label>
                  <Input
                    id="seatId"
                    name="seatId"
                    list="external-seat-ids"
                    defaultValue={filters.seatId}
                    placeholder="Seat ID"
                  />
                  <datalist id="external-seat-ids">
                    {filterOptions.seatIds.map((seatId) => (
                      <option key={seatId} value={seatId} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="team">Team</Label>
                  <Input
                    id="team"
                    name="team"
                    list="external-teams"
                    defaultValue={filters.team}
                    placeholder="Team name"
                  />
                  <datalist id="external-teams">
                    {filterOptions.teams.map((team) => (
                      <option key={team} value={team} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="importedFrom">Imported from</Label>
                  <Input id="importedFrom" name="importedFrom" type="datetime-local" defaultValue={filters.importedFrom} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="importedTo">Imported to</Label>
                  <Input id="importedTo" name="importedTo" type="datetime-local" defaultValue={filters.importedTo} />
                </div>
                <div className="flex items-end gap-2">
                  <Button type="submit">Apply</Button>
                  <Button asChild variant="outline">
                    <Link
                      href={
                        effectiveSelectedAreaId
                          ? `/actuals?year=${activeYear}&budgetAreaId=${encodeURIComponent(effectiveSelectedAreaId)}`
                          : `/actuals?year=${activeYear}`
                      }
                    >
                      Reset
                    </Link>
                  </Button>
                </div>
              </form>
            </CardContent>
            </Card>

            <Card className="border-amber-200/70 bg-white/90">
            <CardHeader>
              <CardTitle>Imported External Actuals</CardTitle>
              <CardDescription>
                Showing {formatNumber(totals.entryCount)} imported seat-month actual rows.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Imported</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Seat</TableHead>
                    <TableHead>Month</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{formatDateTime(entry.importedAt)}</TableCell>
                      <TableCell>{entry.fileName}</TableCell>
                      <TableCell>
                        <div className="font-medium">{entry.importedByName || "Unknown user"}</div>
                        <div className="text-xs text-muted-foreground">
                          {entry.importedByEmail || "No email"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{entry.seatId}</div>
                        <div className="text-xs text-muted-foreground">
                          {entry.inSeat || "No in-seat"} · {entry.team || "No team"}
                        </div>
                      </TableCell>
                      <TableCell>{entry.monthLabel}</TableCell>
                      <TableCell>{formatCurrency(entry.amount)}</TableCell>
                      <TableCell>
                        {entry.matchedTrackerSeatId ? "Matched" : "No tracker seat match"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {entries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                        No external actual imports match the current filters.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
