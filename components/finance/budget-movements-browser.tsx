import Link from "next/link"
import { FinanceHeader } from "@/components/finance/header"
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
import { formatCurrency, formatNumber } from "@/lib/finance/format"
import type {
  BudgetMovementFilters,
  BudgetMovementFilterOption,
  BudgetMovementView,
} from "@/lib/finance/types"
import type { AppRole } from "@/lib/roles"

type TrackingYearOption = {
  id: string
  year: number
  isActive: boolean
}

type BudgetMovementsBrowserProps = {
  userName: string
  userEmail: string
  userRole: AppRole
  activeYear: number
  trackingYears: TrackingYearOption[]
  filters: BudgetMovementFilters
  filterOptions: {
    categories: string[]
    receivingFunding: BudgetMovementFilterOption[]
    givingPillars: string[]
  }
  movements: BudgetMovementView[]
  totals: {
    movementCount: number
    financeViewAmount: number
    amountGiven: number
  }
}

function formatDate(value: Date | null) {
  if (!value) {
    return "No date"
  }

  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value))
}

export function BudgetMovementsBrowser({
  userName,
  userEmail,
  userRole,
  activeYear,
  trackingYears,
  filters,
  filterOptions,
  movements,
  totals,
}: BudgetMovementsBrowserProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(187,108,37,0.16),_transparent_32%),linear-gradient(180deg,_rgba(255,250,243,1)_0%,_rgba(246,240,232,1)_100%)]">
      <FinanceHeader
        title="Budget Movements"
        subtitle="Review imported budget movement rows and filter them by notes, category, receiving funding, or giving pillar."
        userName={userName}
        userEmail={userEmail}
        userRole={userRole}
        activeYear={activeYear}
        currentPath="/budget-movements"
      />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <section className="grid gap-4 md:grid-cols-3">
          <Card className="border-amber-200/70 bg-white/90">
            <CardHeader className="gap-1">
              <CardDescription>Filtered Movements</CardDescription>
              <CardTitle>{formatNumber(totals.movementCount)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-amber-200/70 bg-white/90">
            <CardHeader className="gap-1">
              <CardDescription>Finance View Total</CardDescription>
              <CardTitle>{formatCurrency(totals.financeViewAmount)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-amber-200/70 bg-white/90">
            <CardHeader className="gap-1">
              <CardDescription>Amount Given Total</CardDescription>
              <CardTitle>{formatCurrency(totals.amountGiven)}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        <Card className="border-amber-200/70 bg-white/90">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>
              Search notes text and narrow the imported movement list for {activeYear}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 lg:grid-cols-[0.9fr_1.2fr_1fr_1fr_1fr_auto]" method="GET">
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
                <Label htmlFor="search">Notes Search</Label>
                <Input
                  id="search"
                  name="search"
                  defaultValue={filters.search}
                  placeholder="Search notes text"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <select
                  id="category"
                  name="category"
                  defaultValue={filters.category}
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                >
                  <option value="">All categories</option>
                  {filterOptions.categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="receivingFunding">Receiving Funding</Label>
                <select
                  id="receivingFunding"
                  name="receivingFunding"
                  defaultValue={filters.receivingFunding}
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                >
                  <option value="">All receiving funding</option>
                  {filterOptions.receivingFunding.map((funding) => (
                    <option key={funding.value} value={funding.value}>
                      {funding.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="givingPillar">Giving Pillar</Label>
                <select
                  id="givingPillar"
                  name="givingPillar"
                  defaultValue={filters.givingPillar}
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                >
                  <option value="">All giving pillars</option>
                  {filterOptions.givingPillars.map((pillar) => (
                    <option key={pillar} value={pillar}>
                      {pillar}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end gap-2">
                <Button type="submit">Apply</Button>
                <Button asChild variant="outline">
                  <Link href={`/budget-movements?year=${activeYear}`}>Reset</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-amber-200/70 bg-white/90">
          <CardHeader>
            <CardTitle>Imported Movements</CardTitle>
            <CardDescription>
              Showing {formatNumber(totals.movementCount)} imported movement rows.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Giving</TableHead>
                  <TableHead>Receiving</TableHead>
                  <TableHead>Hierarchy</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Finance View</TableHead>
                  <TableHead>Amount Given</TableHead>
                  <TableHead>Batch</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell>{formatDate(movement.effectiveDate)}</TableCell>
                    <TableCell>{movement.category || "Uncategorized"}</TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {movement.givingFunding || "No giving funding"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {movement.givingPillar || "No giving pillar"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{movement.receivingFunding}</div>
                      <div className="text-xs text-muted-foreground">
                        {movement.receivingProjectCode} · {movement.receivingDomainCode}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {movement.areaSubDomain || movement.areaDisplayName || "Unmapped"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {(movement.areaDomain || "Unmapped")} ·{" "}
                        {movement.areaSubDomain || "Unmapped"}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-sm whitespace-normal text-sm text-muted-foreground">
                      {movement.notes || "No notes"}
                    </TableCell>
                    <TableCell>
                      {formatCurrency(movement.financeViewAmount ?? movement.amountGiven)}
                    </TableCell>
                    <TableCell>{formatCurrency(movement.amountGiven)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {movement.batchFileName}
                    </TableCell>
                  </TableRow>
                ))}
                {movements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                      No budget movements match the current filters.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
