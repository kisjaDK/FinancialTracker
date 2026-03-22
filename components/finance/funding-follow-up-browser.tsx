"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { FinancePageIntro } from "@/components/finance/page-intro"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCurrency, formatNumber } from "@/lib/finance/format"
import type {
  FundingFollowUpSeatView,
  FundingFollowUpSummaryView,
} from "@/lib/finance/types"
import { cn } from "@/lib/utils"

type TrackingYearOption = {
  id: string
  year: number
  isActive: boolean
}

type FundingFollowUpBrowserProps = {
  activeYear: number
  trackingYears: TrackingYearOption[]
  selectedDomain: string
  selectedSubDomain: string
  selectedProjectCode: string
  filterOptions: {
    domains: string[]
    subDomains: string[]
    projectCodes: string[]
  }
  selectedFunding: string
  fundingOptions: {
    value: string
    label: string
  }[]
  summaries: FundingFollowUpSummaryView[]
  seats: FundingFollowUpSeatView[]
}

function formatOptionalDate(value: Date | null) {
  if (!value) {
    return "No date"
  }

  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value))
}

function formatAccountingAmount(value: number) {
  const absolute = formatNumber(Math.abs(value))

  if (value < 0) {
    return `(${absolute})`
  }

  return absolute
}

export function FundingFollowUpBrowser({
  activeYear,
  trackingYears,
  selectedDomain,
  selectedSubDomain,
  selectedProjectCode,
  filterOptions,
  selectedFunding,
  fundingOptions,
  summaries,
  seats,
}: FundingFollowUpBrowserProps) {
  const router = useRouter()
  const visibleSummaries = summaries.filter(
    (summary) =>
      summary.allocatedFunding !== 0 ||
      summary.usedFunding !== 0 ||
      summary.projectedFunding !== 0
  )

  function applyFundingFilter(funding: string) {
    const nextFunding = selectedFunding === funding ? "" : funding
    const searchParams = new URLSearchParams({
      year: String(activeYear),
    })

    if (selectedDomain) {
      searchParams.set("domain", selectedDomain)
    }
    if (selectedSubDomain) {
      searchParams.set("subDomain", selectedSubDomain)
    }
    if (selectedProjectCode) {
      searchParams.set("projectCode", selectedProjectCode)
    }
    if (nextFunding) {
      searchParams.set("funding", nextFunding)
    }

    router.push(`/tracker/funding-follow-up?${searchParams.toString()}`)
  }

  return (
    <main className="space-y-6">
      <FinancePageIntro
        title="Funding Follow-Up"
        subtitle={
          selectedSubDomain || selectedDomain
            ? `Review allocated funding against seat actuals and projected year-end spend for ${[selectedSubDomain || selectedDomain, selectedProjectCode].filter(Boolean).join(" · ")} in ${activeYear}.`
            : "Review allocated funding against seat actuals and projected year-end spend for the selected year."
        }
        actions={
          <Button asChild variant="outline">
            <Link href={`/tracker?year=${activeYear}`}>Back to Tracker</Link>
          </Button>
        }
      />

      <Card className="brand-card">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Narrow the follow-up view to a specific year or funding value.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-5" method="GET">
            <div className="space-y-2">
              <Label htmlFor="funding-follow-up-year">Year</Label>
              <select
                id="funding-follow-up-year"
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
              <Label htmlFor="funding-follow-up-domain">Domain</Label>
              <select
                id="funding-follow-up-domain"
                name="domain"
                defaultValue={selectedDomain}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="">All domains</option>
                {filterOptions.domains.map((domain) => (
                  <option key={domain} value={domain}>
                    {domain}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="funding-follow-up-sub-domain">Sub-domain</Label>
              <select
                id="funding-follow-up-sub-domain"
                name="subDomain"
                defaultValue={selectedSubDomain}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="">All sub-domains</option>
                {filterOptions.subDomains.map((subDomain) => (
                  <option key={subDomain} value={subDomain}>
                    {subDomain}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="funding-follow-up-funding">Funding</Label>
              <select
                id="funding-follow-up-funding"
                name="funding"
                defaultValue={selectedFunding}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="">All funding</option>
                {fundingOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="funding-follow-up-project-code">Project code</Label>
              <select
                id="funding-follow-up-project-code"
                name="projectCode"
                defaultValue={selectedProjectCode}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="">All project codes</option>
                {filterOptions.projectCodes.map((projectCode) => (
                  <option key={projectCode} value={projectCode}>
                    {projectCode}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit">Apply</Button>
              <Button asChild variant="outline">
                <Link href={`/tracker/funding-follow-up?year=${activeYear}`}>Reset</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="brand-card">
        <CardHeader>
          <CardTitle>Funding Overview</CardTitle>
          <CardDescription>
            Allocated funding versus actuals and projected year-end spend for {activeYear}. All amounts are in DKK.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Funding</TableHead>
                <TableHead>Allocated</TableHead>
                <TableHead>Used</TableHead>
                <TableHead>Projected</TableHead>
                <TableHead>Remaining / Overrun</TableHead>
                <TableHead>Seats</TableHead>
                <TableHead>Active Seats</TableHead>
                <TableHead>Latest Movement</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleSummaries.map((summary) => {
                const filterValue =
                  summary.funding === "Unassigned" ? "__unassigned__" : summary.funding
                const isActive = selectedFunding === filterValue

                return (
                  <TableRow
                    key={summary.funding}
                    className={cn(
                      "cursor-pointer",
                      isActive && "brand-selected-row"
                    )}
                    onClick={() => applyFundingFilter(filterValue)}
                  >
                    <TableCell className="font-medium">{summary.funding}</TableCell>
                    <TableCell>{formatAccountingAmount(summary.allocatedFunding)}</TableCell>
                    <TableCell>{formatAccountingAmount(summary.usedFunding)}</TableCell>
                    <TableCell>{formatAccountingAmount(summary.projectedFunding)}</TableCell>
                    <TableCell
                      className={cn(
                        summary.remainingFunding < 0
                          ? "text-rose-600"
                          : "text-emerald-700"
                      )}
                    >
                      {formatAccountingAmount(summary.remainingFunding)}
                    </TableCell>
                    <TableCell>{formatNumber(summary.seatCount)}</TableCell>
                    <TableCell>{formatNumber(summary.activeSeatCount)}</TableCell>
                    <TableCell>{formatOptionalDate(summary.latestMovementDate)}</TableCell>
                  </TableRow>
                )
              })}
              {visibleSummaries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    No funding follow-up data is available for the selected year.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="brand-card">
        <CardHeader>
          <CardTitle>Related Seats</CardTitle>
          <CardDescription>
            {selectedFunding
              ? `Seat-level actuals and projected spend for ${fundingOptions.find((option) => option.value === selectedFunding)?.label ?? "the selected funding"}.`
              : "Select a funding row above to inspect the related seats."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {selectedFunding ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Seat</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Funding</TableHead>
                  <TableHead>Context</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Actuals To Date</TableHead>
                  <TableHead>Remaining Forecast</TableHead>
                  <TableHead>Total Projected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {seats.map((seat) => (
                  <TableRow key={seat.id}>
                    <TableCell>
                      <div className="font-medium">
                        <Link
                          href={`/people-roster?year=${activeYear}&seatId=${encodeURIComponent(seat.seatId)}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {seat.seatId}
                        </Link>
                        <span>{` · ${seat.name || seat.team || "Unnamed"}`}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {seat.role || "No role"}
                      </div>
                    </TableCell>
                    <TableCell>{seat.status || "No status"}</TableCell>
                    <TableCell>{seat.funding || "Unassigned"}</TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {seat.budgetAreaDisplayName || seat.subDomain || seat.domain || "Unmapped"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {[seat.domain, seat.subDomain, seat.projectCode].filter(Boolean).join(" · ") || "No hierarchy"}
                      </div>
                    </TableCell>
                    <TableCell>{formatOptionalDate(seat.startDate)}</TableCell>
                    <TableCell>{formatOptionalDate(seat.endDate)}</TableCell>
                    <TableCell>{formatCurrency(seat.actualsToDate)}</TableCell>
                    <TableCell>{formatCurrency(seat.remainingForecast)}</TableCell>
                    <TableCell>{formatCurrency(seat.totalProjectedSpend)}</TableCell>
                  </TableRow>
                ))}
                {seats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                      No seats currently map to this funding.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          ) : (
            <div className="rounded-lg border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
              Click any funding row in the overview table to open the seat drilldown.
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
