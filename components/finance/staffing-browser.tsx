"use client"

import { Fragment } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { InfoIcon } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { FinanceHeader } from "@/components/finance/header"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { MONTH_NAMES } from "@/lib/finance/constants"
import { formatNumber } from "@/lib/finance/format"
import type { StaffingMonthBucket } from "@/lib/finance/types"
import type { AppRole } from "@/lib/roles"

type TrackingYearOption = {
  id: string
  year: number
  isActive: boolean
}

type StaffingOverviewRow = {
  id: string
  subDomain: string | null
  projectCode: string | null
  permTarget: number | null
  months: StaffingMonthBucket[]
}

type StaffingOverviewGroup = {
  subDomain: string | null
  permTarget: number | null
  months: StaffingMonthBucket[]
  rows: StaffingOverviewRow[]
}

type StaffingBrowserProps = {
  userName: string
  userEmail: string
  userRole: AppRole
  activeYear: number
  trackingYears: TrackingYearOption[]
  domains: string[]
  selectedDomain: string | null
  domainTarget: number | null
  domainMonths: StaffingMonthBucket[]
  groups: StaffingOverviewGroup[]
}

function formatTarget(value: number | null) {
  return value === null ? "-" : formatNumber(value)
}

const DOMAIN_ROLLUP_LABEL_WIDTH = "10rem"
const STAFFING_POSITIVE_COLOR = "var(--color-chart-2)"
const STAFFING_ON_LEAVE_COLOR = "var(--color-chart-1)"
const STAFFING_OPEN_COLOR = "var(--color-chart-4)"

function monthTotal(month: StaffingMonthBucket) {
  return month.active + month.onLeave + month.open
}

function sumBuckets(months: StaffingMonthBucket[]) {
  return months.reduce(
    (totals, month) => ({
      active: totals.active + month.active,
      onLeave: totals.onLeave + month.onLeave,
      open: totals.open + month.open,
    }),
    { active: 0, onLeave: 0, open: 0 }
  )
}

function DomainVarianceCell({
  month,
  target,
  totalHref,
}: {
  month: StaffingMonthBucket
  target: number | null
  totalHref: string
}) {
  const total = monthTotal(month)
  const diff = target === null ? null : total - target

  return (
    <div className="space-y-1 text-xs leading-tight">
      <div>
        Total{" "}
        <Link href={totalHref} className="brand-link">
          {formatNumber(total)}
        </Link>
      </div>
      <div>Target {formatTarget(target)}</div>
      <div
        style={{
          color:
            diff !== null && diff > 0
              ? "var(--color-destructive)"
              : STAFFING_POSITIVE_COLOR,
        }}
      >
        Diff {diff === null ? "-" : `${diff > 0 ? "+" : ""}${formatNumber(diff)}`}
      </div>
    </div>
  )
}

function LinkedBucketCell({
  month,
  activeHref,
  onLeaveHref,
  openHref,
}: {
  month: StaffingMonthBucket
  activeHref: string
  onLeaveHref: string
  openHref: string
}) {
  return (
    <div className="space-y-1 text-xs leading-tight">
      <div>
        A{" "}
        <Link href={activeHref} className="brand-link">
          {formatNumber(month.active)}
        </Link>
      </div>
      <div>
        L{" "}
        <Link href={onLeaveHref} className="brand-link">
          {formatNumber(month.onLeave)}
        </Link>
      </div>
      <div>
        O{" "}
        <Link href={openHref} className="brand-link">
          {formatNumber(month.open)}
        </Link>
      </div>
    </div>
  )
}

function MetricHelp({
  label,
  content,
}: {
  label: string
  content: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex size-4 items-center justify-center rounded-full border transition-colors brand-icon-button"
        >
          <InfoIcon className="size-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent sideOffset={6} className="max-w-64 border border-border bg-popover text-foreground">
        {content}
      </TooltipContent>
    </Tooltip>
  )
}

function LinkedBarShape({
  href,
  fill,
  x,
  y,
  width,
  height,
}: {
  href: string
  fill?: string
  x?: number
  y?: number
  width?: number
  height?: number
}) {
  if (
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined ||
    width <= 0 ||
    height <= 0
  ) {
    return null
  }

  return (
    <a href={href}>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        rx={4}
        ry={4}
        style={{ cursor: "pointer" }}
      />
    </a>
  )
}

type LinkedBarShapeProps = {
  payload: {
    monthIndex: number
  }
  fill?: string
  x?: number
  y?: number
  width?: number
  height?: number
}

export function StaffingBrowser({
  userName,
  userEmail,
  userRole,
  activeYear,
  trackingYears,
  domains,
  selectedDomain,
  domainTarget,
  domainMonths,
  groups,
}: StaffingBrowserProps) {
  const router = useRouter()
  const totals = sumBuckets(domainMonths)
  const domainMonthTotals = domainMonths.map(monthTotal)
  const domainChartData = domainMonths.map((month, index) => ({
    monthIndex: index,
    month: MONTH_NAMES[index],
    onLeave: month.onLeave,
    open: month.open,
  }))
  const averageDomainTotal =
    domainMonthTotals.reduce((sum, value) => sum + value, 0) / (domainMonthTotals.length || 1)
  const domainDiffAverage =
    domainTarget === null ? null : averageDomainTotal - domainTarget
  const domainChartConfig = {
    onLeave: {
      label: "On leave",
      color: STAFFING_ON_LEAVE_COLOR,
    },
    open: {
      label: "Open",
      color: STAFFING_OPEN_COLOR,
    },
  } as const

  function buildChartSegmentHref(
    monthIndex: number,
    staffingBucket: "on leave" | "open"
  ) {
    return buildPeopleRosterHref({
      domain: selectedDomain,
      monthIndex,
      staffingBucket,
    })
  }

  function updateFilters(nextYear: string, nextDomain: string) {
    const params = new URLSearchParams()
    params.set("year", nextYear)
    if (nextDomain) {
      params.set("domain", nextDomain)
    }

    router.push(`/staffing?${params.toString()}`)
  }

  function buildPeopleRosterHref(input: {
    domain?: string | null
    subDomain?: string | null
    projectCode?: string | null
    monthIndex?: number
    staffingBucket?: "perm total" | "active" | "on leave" | "open"
  }) {
    const params = new URLSearchParams()
    params.set("year", String(activeYear))

    if (input.domain) {
      params.append("domain", input.domain)
    }

    if (input.subDomain) {
      params.append("subDomain", input.subDomain)
    }

    if (input.projectCode) {
      params.append("projectCode", input.projectCode)
    }

    if (typeof input.monthIndex === "number") {
      params.set("month", MONTH_NAMES[input.monthIndex])
    }

    if (input.staffingBucket) {
      params.set("staffingBucket", input.staffingBucket)
    }

    return `/people-roster?${params.toString()}`
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen brand-page-shell-staffing">
      <FinanceHeader
        title="Staffing"
        subtitle="Track monthly PERM staffing by domain, sub-domain, and project code."
        userName={userName}
        userEmail={userEmail}
        userRole={userRole}
        activeYear={activeYear}
        currentPath="/staffing"
      />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <Card className="brand-card">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>
              Select the planning year and domain for the staffing view.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="staffing-year" className="text-sm font-medium">
                Year
              </label>
              <select
                id="staffing-year"
                value={String(activeYear)}
                onChange={(event) => updateFilters(event.target.value, selectedDomain || "")}
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
              <label htmlFor="staffing-domain" className="text-sm font-medium">
                Domain
              </label>
              <select
                id="staffing-domain"
                value={selectedDomain || ""}
                onChange={(event) => updateFilters(String(activeYear), event.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                {domains.length === 0 ? (
                  <option value="">No domains available</option>
                ) : null}
                {domains.map((domain) => (
                  <option key={domain} value={domain}>
                    {domain}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        <section className="grid gap-4 md:grid-cols-4">
          <Card className="brand-card">
            <CardHeader className="gap-1">
              <CardDescription>Domain Target</CardDescription>
              <CardTitle>{formatTarget(domainTarget)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="brand-card">
            <CardHeader className="gap-1">
              <CardDescription className="flex items-center gap-2">
                <span>Active Allocation Total</span>
                <MetricHelp
                  label="Active allocation total explanation"
                  content="Sum of monthly allocation for PERM seats that count as active in the staffing logic. Open and on-leave seats are excluded from this total."
                />
              </CardDescription>
              <CardTitle>
                <Link
                  href={buildPeopleRosterHref({
                      domain: selectedDomain,
                      staffingBucket: "active",
                    })}
                    className="brand-inline-link"
                  >
                    {formatNumber(totals.active)}
                  </Link>
                </CardTitle>
              </CardHeader>
            </Card>
          <Card className="brand-card">
            <CardHeader className="gap-1">
              <CardDescription className="flex items-center gap-2">
                <span>On Leave Allocation Total</span>
                <MetricHelp
                  label="On leave allocation total explanation"
                  content="Sum of monthly allocation for PERM seats whose effective status is On leave for the selected month."
                />
              </CardDescription>
              <CardTitle>
                <Link
                  href={buildPeopleRosterHref({
                    domain: selectedDomain,
                    staffingBucket: "on leave",
                  })}
                  className="brand-inline-link"
                >
                  {formatNumber(totals.onLeave)}
                </Link>
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="brand-card">
            <CardHeader className="gap-1">
              <CardDescription className="flex items-center gap-2">
                <span>Open Allocation Total</span>
                <MetricHelp
                  label="Open allocation total explanation"
                  content="Sum of monthly allocation for PERM seats whose effective status is Open. These seats are tracked separately and are not counted as active."
                />
              </CardDescription>
              <CardTitle>
                <Link
                  href={buildPeopleRosterHref({
                    domain: selectedDomain,
                    staffingBucket: "open",
                  })}
                  className="brand-inline-link"
                >
                  {formatNumber(totals.open)}
                </Link>
              </CardTitle>
            </CardHeader>
          </Card>
        </section>

        <Card className="brand-card">
          <CardHeader>
            <CardTitle>Domain Rollup</CardTitle>
            <CardDescription>
              Monthly domain totals use the seat allocation for each month, with variance shown against the domain target.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <section className="grid gap-4 md:grid-cols-3">
              <Card className="brand-soft-card">
                <CardHeader className="gap-1">
                  <CardDescription>Average Monthly Total</CardDescription>
                  <CardTitle>{formatNumber(averageDomainTotal)}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="brand-soft-card">
                <CardHeader className="gap-1">
                  <CardDescription>Domain Target</CardDescription>
                  <CardTitle>{formatTarget(domainTarget)}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="brand-soft-card">
                <CardHeader className="gap-1">
                  <CardDescription>Average Diff To Target</CardDescription>
                  <CardTitle>
                    {domainDiffAverage === null
                      ? "-"
                      : `${domainDiffAverage > 0 ? "+" : ""}${formatNumber(domainDiffAverage)}`}
                  </CardTitle>
                </CardHeader>
              </Card>
            </section>

            <div className="rounded-xl brand-soft-panel p-4">
              <div className="mb-3">
                <div className="text-sm font-medium">Open + On Leave By Month</div>
                <div className="text-xs text-muted-foreground">
                  Stacked view of the non-active PERM allocation that builds up each month.
                </div>
              </div>
              <div
                className="grid items-stretch gap-0"
                style={{ gridTemplateColumns: `${DOMAIN_ROLLUP_LABEL_WIDTH} minmax(0, 1fr)` }}
              >
                <div />
                <ChartContainer
                  config={domainChartConfig}
                  className="h-64 w-full"
                >
                  <BarChart
                    data={domainChartData}
                    margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
                    barCategoryGap="18%"
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} width={32} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                    <Bar
                      dataKey="onLeave"
                      stackId="nonActive"
                      fill="var(--color-onLeave)"
                      radius={[0, 0, 0, 0]}
                      shape={(props: unknown) => {
                        const shapeProps = props as LinkedBarShapeProps

                        return (
                        <LinkedBarShape
                          href={buildChartSegmentHref(shapeProps.payload.monthIndex, "on leave")}
                          fill={shapeProps.fill}
                          x={shapeProps.x}
                          y={shapeProps.y}
                          width={shapeProps.width}
                          height={shapeProps.height}
                        />
                        )
                      }}
                    />
                    <Bar
                      dataKey="open"
                      stackId="nonActive"
                      fill="var(--color-open)"
                      radius={[4, 4, 0, 0]}
                      shape={(props: unknown) => {
                        const shapeProps = props as LinkedBarShapeProps

                        return (
                        <LinkedBarShape
                          href={buildChartSegmentHref(shapeProps.payload.monthIndex, "open")}
                          fill={shapeProps.fill}
                          x={shapeProps.x}
                          y={shapeProps.y}
                          width={shapeProps.width}
                          height={shapeProps.height}
                        />
                        )
                      }}
                    />
                </BarChart>
              </ChartContainer>
            </div>
            </div>

            {selectedDomain ? (
              <Table className="table-fixed">
                <colgroup>
                  <col style={{ width: DOMAIN_ROLLUP_LABEL_WIDTH }} />
                  {MONTH_NAMES.map((month) => (
                    <col key={`rollup-col-${month}`} />
                  ))}
                </colgroup>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    {MONTH_NAMES.map((month) => (
                      <TableHead key={`rollup-${month}`} className="text-center">
                        {month}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">{selectedDomain}</TableCell>
                      {domainMonths.map((month, index) => (
                        <TableCell key={`rollup-cell-${index}`} className="align-top">
                          <DomainVarianceCell
                            month={month}
                            target={domainTarget}
                            totalHref={buildPeopleRosterHref({
                              domain: selectedDomain,
                              monthIndex: index,
                              staffingBucket: "perm total",
                            })}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                </TableBody>
              </Table>
            ) : null}
          </CardContent>
        </Card>

        <Card className="brand-card">
          <CardHeader>
            <CardTitle>Sub-domain Build Up</CardTitle>
            <CardDescription>
              Each row shows how the sub-domains contribute to the domain total month by month.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {groups.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sub-domain</TableHead>
                    <TableHead>Target PERM</TableHead>
                    {MONTH_NAMES.map((month) => (
                      <TableHead key={`group-${month}`}>{month}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map((group) => (
                    <TableRow key={`build-up-${group.subDomain || "unmapped"}`}>
                      <TableCell className="font-medium">{group.subDomain || "Unmapped"}</TableCell>
                      <TableCell>{formatTarget(group.permTarget)}</TableCell>
                      {group.months.map((month, index) => (
                        <TableCell key={`build-up-${group.subDomain || "unmapped"}-${index}`}>
                          <div className="space-y-1 text-xs leading-tight">
                            <div>
                              Total{" "}
                              <Link
                                href={buildPeopleRosterHref({
                                  domain: selectedDomain,
                                  subDomain: group.subDomain,
                                  monthIndex: index,
                                  staffingBucket: "perm total",
                                })}
                                className="brand-link"
                              >
                                {formatNumber(monthTotal(month))}
                              </Link>
                            </div>
                            <div>
                              A{" "}
                              <Link
                                href={buildPeopleRosterHref({
                                  domain: selectedDomain,
                                  subDomain: group.subDomain,
                                  monthIndex: index,
                                  staffingBucket: "active",
                                })}
                                className="brand-link"
                              >
                                {formatNumber(month.active)}
                              </Link>
                            </div>
                            <div>
                              L{" "}
                              <Link
                                href={buildPeopleRosterHref({
                                  domain: selectedDomain,
                                  subDomain: group.subDomain,
                                  monthIndex: index,
                                  staffingBucket: "on leave",
                                })}
                                className="brand-link"
                              >
                                {formatNumber(month.onLeave)}
                              </Link>
                            </div>
                            <div>
                              O{" "}
                              <Link
                                href={buildPeopleRosterHref({
                                  domain: selectedDomain,
                                  subDomain: group.subDomain,
                                  monthIndex: index,
                                  staffingBucket: "open",
                                })}
                                className="brand-link"
                              >
                                {formatNumber(month.open)}
                              </Link>
                            </div>
                          </div>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No sub-domain staffing totals are available for the selected domain and year.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="brand-card">
          <CardHeader>
            <CardTitle>Monthly Overview</CardTitle>
            <CardDescription>
              A = Active, L = On leave, O = Open. Open seats are tracked separately from active seats, and all values reflect monthly seat allocation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedDomain ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sub-domain</TableHead>
                    <TableHead>Project code</TableHead>
                    <TableHead>Target PERM</TableHead>
                    {MONTH_NAMES.map((month) => (
                      <TableHead key={month}>{month}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="brand-selected-row">
                    <TableCell className="font-medium">{selectedDomain}</TableCell>
                    <TableCell>Domain total</TableCell>
                    <TableCell>{formatTarget(domainTarget)}</TableCell>
                    {domainMonths.map((month, index) => (
                      <TableCell key={`domain-${index}`}>
                        <LinkedBucketCell
                          month={month}
                          activeHref={buildPeopleRosterHref({
                            domain: selectedDomain,
                            monthIndex: index,
                            staffingBucket: "active",
                          })}
                          onLeaveHref={buildPeopleRosterHref({
                            domain: selectedDomain,
                            monthIndex: index,
                            staffingBucket: "on leave",
                          })}
                          openHref={buildPeopleRosterHref({
                            domain: selectedDomain,
                            monthIndex: index,
                            staffingBucket: "open",
                          })}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                  {groups.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={15} className="py-10 text-center text-muted-foreground">
                        No staffing rows are available for the selected domain and year.
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {groups.map((group) => (
                    <Fragment key={group.subDomain || "unmapped"}>
                      {group.rows.length > 1 ? (
                        <TableRow key={`${group.subDomain || "unmapped"}-subtotal`} className="bg-muted/40">
                          <TableCell className="font-medium">{group.subDomain || "Unmapped"}</TableCell>
                          <TableCell>Subtotal</TableCell>
                          <TableCell>{formatTarget(group.permTarget)}</TableCell>
                          {group.months.map((month, index) => (
                            <TableCell key={`${group.subDomain || "unmapped"}-subtotal-${index}`}>
                              <LinkedBucketCell
                                month={month}
                                activeHref={buildPeopleRosterHref({
                                  domain: selectedDomain,
                                  subDomain: group.subDomain,
                                  monthIndex: index,
                                  staffingBucket: "active",
                                })}
                                onLeaveHref={buildPeopleRosterHref({
                                  domain: selectedDomain,
                                  subDomain: group.subDomain,
                                  monthIndex: index,
                                  staffingBucket: "on leave",
                                })}
                                openHref={buildPeopleRosterHref({
                                  domain: selectedDomain,
                                  subDomain: group.subDomain,
                                  monthIndex: index,
                                  staffingBucket: "open",
                                })}
                              />
                            </TableCell>
                          ))}
                        </TableRow>
                      ) : null}
                      {group.rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{row.subDomain || "Unmapped"}</TableCell>
                          <TableCell>{row.projectCode || "Unassigned"}</TableCell>
                          <TableCell>{formatTarget(row.permTarget)}</TableCell>
                          {row.months.map((month, index) => (
                            <TableCell key={`${row.id}-${index}`}>
                              <LinkedBucketCell
                                month={month}
                                activeHref={buildPeopleRosterHref({
                                  domain: selectedDomain,
                                  subDomain: row.subDomain,
                                  projectCode: row.projectCode,
                                  monthIndex: index,
                                  staffingBucket: "active",
                                })}
                                onLeaveHref={buildPeopleRosterHref({
                                  domain: selectedDomain,
                                  subDomain: row.subDomain,
                                  projectCode: row.projectCode,
                                  monthIndex: index,
                                  staffingBucket: "on leave",
                                })}
                                openHref={buildPeopleRosterHref({
                                  domain: selectedDomain,
                                  subDomain: row.subDomain,
                                  projectCode: row.projectCode,
                                  monthIndex: index,
                                  staffingBucket: "open",
                                })}
                              />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No staffing domains are available yet.
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
    </TooltipProvider>
  )
}
