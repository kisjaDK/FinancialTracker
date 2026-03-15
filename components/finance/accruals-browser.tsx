"use client"

import { useMemo, useState, useTransition } from "react"
import { Download, FileSpreadsheet } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { FinancePageIntro } from "@/components/finance/page-intro"
import { MultiSelectFilter } from "@/components/finance/multi-select-filter"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { serializeCsv } from "@/lib/finance/csv"
import { formatCurrency } from "@/lib/finance/format"
import type {
  AccrualFilters,
  AccrualSummaryRow,
} from "@/lib/finance/types"

type TrackingYearOption = {
  id: string
  year: number
  isActive: boolean
}

type AccrualsBrowserProps = {
  activeYear: number
  trackingYears: TrackingYearOption[]
  filters: AccrualFilters
  filterOptions: {
    domains: string[]
    pillars: string[]
    pillarsByDomain: Record<string, string[]>
    months: string[]
  }
  rows: AccrualSummaryRow[]
  totals: {
    amountDkk: number
    vendorCount: number
    detailCount: number
    includedMonthLabels: string[]
  }
}

function downloadCsv(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

export function AccrualsBrowser({
  activeYear,
  trackingYears,
  filters,
  filterOptions,
  rows,
  totals,
}: AccrualsBrowserProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [selectedYear, setSelectedYear] = useState(String(activeYear))
  const [selectedDomain, setSelectedDomain] = useState(filters.domain)
  const [selectedPillar, setSelectedPillar] = useState(filters.pillar)
  const [selectedMonths, setSelectedMonths] = useState(filters.months)

  const availablePillars = useMemo(() => {
    if (selectedDomain && filterOptions.pillarsByDomain[selectedDomain]) {
      return filterOptions.pillarsByDomain[selectedDomain]
    }

    return filterOptions.pillars
  }, [filterOptions.pillars, filterOptions.pillarsByDomain, selectedDomain])

  function updateParams(next: {
    year?: string
    domain?: string
    pillar?: string
    months?: string[]
  }) {
    const params = new URLSearchParams(searchParams.toString())

    if (next.year) {
      params.set("year", next.year)
    } else {
      params.delete("year")
    }

    if (next.domain) {
      params.set("domain", next.domain)
    } else {
      params.delete("domain")
    }

    if (next.pillar) {
      params.set("pillar", next.pillar)
    } else {
      params.delete("pillar")
    }

    params.delete("month")
    ;(next.months ?? []).forEach((month) => params.append("month", month))

    startTransition(() => {
      router.replace(`/accruals?${params.toString()}`, { scroll: false })
    })
  }

  function handleApply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    updateParams({
      year: selectedYear,
      domain: selectedDomain,
      pillar: selectedPillar,
      months: selectedMonths,
    })
  }

  function handleReset() {
    setSelectedDomain("")
    setSelectedPillar("")
    setSelectedMonths([])
    updateParams({
      year: selectedYear,
      domain: "",
      pillar: "",
      months: [],
    })
  }

  function handleDomainChange(value: string) {
    setSelectedDomain(value)

    if (!value) {
      setSelectedPillar("")
      return
    }

    const nextPillars = filterOptions.pillarsByDomain[value] ?? []
    if (selectedPillar && !nextPillars.includes(selectedPillar)) {
      setSelectedPillar("")
    }
  }

  function handleExport() {
    const content = serializeCsv(
      rows.map((row) => ({
        "Department name": row.departmentName,
        "Department code": row.departmentCode,
        "Cost type": row.costType,
        Account: row.account,
        "Amount in DKK": row.amountDkk.toFixed(2),
        "Project number": row.projectNumber,
        "Vendor name": row.vendorName,
        "Item/Service the invoice is for": row.itemService,
        "Period the invoice relates to": row.periodLabel,
        "Submitted by": row.submittedBy,
        "Invoice number": row.invoiceNumber,
      })),
      [
        "Department name",
        "Department code",
        "Cost type",
        "Account",
        "Amount in DKK",
        "Project number",
        "Vendor name",
        "Item/Service the invoice is for",
        "Period the invoice relates to",
        "Submitted by",
        "Invoice number",
      ]
    )

    downloadCsv(`accruals-${activeYear}.csv`, content)
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 py-2">
      <FinancePageIntro
        title="Accruals"
        subtitle="Build finance-ready accrual rows from past-month external forecasts that still have no actuals. Permanent seats are excluded."
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-amber-50 via-background to-emerald-50 shadow-sm dark:from-amber-950/20 dark:via-background dark:to-emerald-950/20">
          <CardHeader className="gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-foreground text-background shadow-sm">
                <FileSpreadsheet className="size-5" />
              </div>
              <div>
                <CardTitle>Finance Submission Preview</CardTitle>
                <CardDescription>
                  Rows are grouped for submission and can be expanded into the seat-month lines that create each vendor entry.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Accrual amount
              </div>
              <div className="mt-2 text-2xl font-semibold">{formatCurrency(totals.amountDkk)}</div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Submission rows
              </div>
              <div className="mt-2 text-2xl font-semibold">{rows.length}</div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Source lines
              </div>
              <div className="mt-2 text-2xl font-semibold">{totals.detailCount}</div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>
              Domain narrows the pillar list. Included months:{" "}
              {totals.includedMonthLabels.length > 0
                ? totals.includedMonthLabels.join(", ")
                : "none"}
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={handleApply}>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="accrual-year">Year</Label>
                  <NativeSelect
                    id="accrual-year"
                    className="w-full"
                    value={selectedYear}
                    onChange={(event) => setSelectedYear(event.target.value)}
                  >
                    {trackingYears.map((year) => (
                      <NativeSelectOption key={year.id} value={String(year.year)}>
                        {year.year}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accrual-domain">Domain</Label>
                  <NativeSelect
                    id="accrual-domain"
                    className="w-full"
                    value={selectedDomain}
                    onChange={(event) => handleDomainChange(event.target.value)}
                  >
                    <NativeSelectOption value="">All domains</NativeSelectOption>
                    {filterOptions.domains.map((domain) => (
                      <NativeSelectOption key={domain} value={domain}>
                        {domain}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accrual-pillar">Pillar</Label>
                  <NativeSelect
                    id="accrual-pillar"
                    className="w-full"
                    value={selectedPillar}
                    onChange={(event) => setSelectedPillar(event.target.value)}
                  >
                    <NativeSelectOption value="">All pillars</NativeSelectOption>
                    {availablePillars.map((pillar) => (
                      <NativeSelectOption key={pillar} value={pillar}>
                        {pillar}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
              </div>

              <div className="grid gap-4">
                <MultiSelectFilter
                  label="Period Covered By Accrual"
                  name="month"
                  options={filterOptions.months}
                  selectedValues={selectedMonths}
                  onSelectedValuesChange={setSelectedMonths}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Applying..." : "Apply filters"}
                </Button>
                <Button type="button" variant="outline" onClick={handleReset} disabled={isPending}>
                  Reset
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleExport}
                  disabled={rows.length === 0}
                >
                  <Download className="size-4" />
                  Download CSV
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle>Submission Rows</CardTitle>
          <CardDescription>
            Project number and invoice number are intentionally left blank in the export. Expand a row to inspect its seat lines.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground md:grid-cols-[1.4fr_1fr_0.9fr_1fr_1fr_1.2fr_88px]">
            <div>Vendor / Item</div>
            <div>Department</div>
            <div>Account</div>
            <div>Period</div>
            <div>Amount</div>
            <div>Submitted by</div>
            <div className="text-right">Lines</div>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/80 px-6 py-10 text-sm text-muted-foreground">
              No accrual rows match the current filters.
            </div>
          ) : (
            <ScrollArea className="w-full">
              <Accordion type="multiple" className="rounded-2xl border border-border/70 bg-card">
                {rows.map((row) => (
                  <AccordionItem key={row.id} value={row.id} className="px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="grid w-full gap-3 pr-2 text-sm md:grid-cols-[1.4fr_1fr_0.9fr_1fr_1fr_1.2fr_88px] md:items-start">
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{row.vendorName}</div>
                          <div className="truncate text-muted-foreground">{row.itemService}</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {row.pillar ? <Badge variant="outline">{row.pillar}</Badge> : null}
                            {row.domain ? <Badge variant="secondary">{row.domain}</Badge> : null}
                          </div>
                        </div>
                        <div>
                          <div className="font-medium">{row.departmentName}</div>
                          <div className="text-muted-foreground">{row.departmentCode || "No code"}</div>
                        </div>
                        <div>
                          <div className="font-medium">{row.account}</div>
                          <div className="text-muted-foreground">{row.costType}</div>
                        </div>
                        <div>{row.periodLabel}</div>
                        <div className="font-medium">{formatCurrency(row.amountDkk)}</div>
                        <div>{row.submittedBy}</div>
                        <div className="text-right font-medium">{row.detailCount}</div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="rounded-2xl border border-border/70 bg-muted/30">
                        <div className="grid gap-2 border-b border-border/70 px-4 py-3 text-xs uppercase tracking-[0.16em] text-muted-foreground md:grid-cols-[96px_120px_1fr_1fr_1fr_120px]">
                          <div>Seat ID</div>
                          <div>Period</div>
                          <div>Person / Team</div>
                          <div>Service detail</div>
                          <div>Project / Pillar</div>
                          <div className="text-right">Amount</div>
                        </div>
                        <div className="divide-y divide-border/60">
                          {row.details.map((detail) => (
                            <div
                              key={detail.id}
                              className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[96px_120px_1fr_1fr_1fr_120px]"
                            >
                              <div className="font-medium">{detail.seatId}</div>
                              <div>{detail.periodLabel}</div>
                              <div>
                                <div>{detail.inSeat || "Unassigned"}</div>
                                <div className="text-muted-foreground">{detail.team || "No team"}</div>
                              </div>
                              <div>
                                <div>{detail.serviceLabel}</div>
                                <div className="text-muted-foreground">
                                  {detail.resourceType || "No resource type"}
                                </div>
                              </div>
                              <div>
                                <div>{detail.projectCode || "No project code"}</div>
                                <div className="text-muted-foreground">
                                  {detail.pillar || "No pillar"}
                                </div>
                              </div>
                              <div className="text-right font-medium">
                                {formatCurrency(detail.amountDkk)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
