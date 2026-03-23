"use client"

import { useState } from "react"
import Link from "next/link"
import { FilePenLine } from "lucide-react"
import { FinancePageIntro } from "@/components/finance/page-intro"
import { MultiSelectFilter } from "@/components/finance/multi-select-filter"
import { SeatEditorDialog } from "@/components/finance/seat-editor-dialog"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatNumber } from "@/lib/finance/format"
import {
  buildCascadingHierarchyOptions,
  pruneInvalidSelections,
} from "@/lib/finance/hierarchy-filters"
import type { AppRole } from "@/lib/roles"
import type {
  DepartmentMappingView,
  PeopleRosterFilters,
  PeopleRosterView,
  SeatReferenceValueView,
} from "@/lib/finance/types"

type TrackingYearOption = {
  id: string
  year: number
  isActive: boolean
}

type BudgetAreaOption = {
  id: string
  domain: string | null
  subDomain: string | null
  funding: string | null
  pillar: string | null
  costCenter: string
  projectCode: string
  displayName: string | null
}

type PeopleRosterBrowserProps = {
  userRole: AppRole
  activeYear: number
  trackingYears: TrackingYearOption[]
  filters: PeopleRosterFilters
  filterOptions: {
    seatIds: string[]
    names: string[]
    emails: string[]
    domains: string[]
    teams: string[]
    subDomains: string[]
    hierarchyRows: {
      domain: string | null
      subDomain: string | null
      team: string | null
    }[]
    projectCodes: Array<{ value: string; label: string }>
    vendors: string[]
    locations: string[]
    statuses: string[]
    roles: string[]
    bands: string[]
  }
  people: PeopleRosterView[]
  totals: {
    rowCount: number
    totalSeatCount: number
    filteredFte: number
    totalFte: number
    uniqueTeams: number
    externalCount: number
    errorCount: number
  }
  budgetAreas: BudgetAreaOption[]
  departmentMappings: DepartmentMappingView[]
  seatReferenceValues: SeatReferenceValueView[]
}

function formatDate(value: string | Date | null) {
  if (!value) {
    return "No date"
  }

  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value))
}

export function PeopleRosterBrowser({
  userRole,
  activeYear,
  trackingYears,
  filters,
  filterOptions,
  people,
  totals,
  budgetAreas,
  departmentMappings,
  seatReferenceValues,
}: PeopleRosterBrowserProps) {
  const [selectedDomains, setSelectedDomains] = useState(filters.domains)
  const [selectedSubDomains, setSelectedSubDomains] = useState(filters.subDomains)
  const [selectedTeams, setSelectedTeams] = useState(filters.teams)
  const [seatDialogPersonId, setSeatDialogPersonId] = useState<string | null>(null)
  const [isCreatingSeat, setIsCreatingSeat] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const canEditTracker = userRole !== "GUEST"

  const hierarchyOptions = buildCascadingHierarchyOptions(
    filterOptions.hierarchyRows,
    selectedDomains,
    selectedSubDomains
  )
  const seatDialogPerson = people.find((person) => person.id === seatDialogPersonId) ?? null
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 py-2">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <FinancePageIntro
          title="People Roster"
          subtitle="Browse imported roster rows and filter them by seat, person, team, hierarchy, vendor, and location."
        />
        <div className="flex flex-wrap gap-2 sm:mt-1">
          <Button asChild variant="outline">
            <Link href={`/people-roster/imports?year=${activeYear}`}>Manage Imports</Link>
          </Button>
          {canEditTracker ? (
            <Button
              onClick={() => {
                setIsCreatingSeat(true)
                setSeatDialogPersonId(null)
              }}
            >
              Add Seat
            </Button>
          ) : null}
        </div>
      </section>

      <Collapsible open={isFilterOpen} onOpenChange={setIsFilterOpen}>
        <Card className="brand-card">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <CardTitle>Filters</CardTitle>
                <CardDescription>
                  Search each field to narrow the dropdown, then select one or more values.
                </CardDescription>
                <div className="text-sm font-medium text-foreground">
                  Showing {formatNumber(totals.rowCount)} of {formatNumber(totals.totalSeatCount)} Seats
                </div>
                <div className="text-xs text-muted-foreground">
                  FTE {formatNumber(totals.filteredFte)} of {formatNumber(totals.totalFte)}
                </div>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="outline">
                  {isFilterOpen ? "Hide filters" : "Show filters"}
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              <form
                action={`/people-roster#roster-list`}
                className="grid gap-4 lg:grid-cols-3"
                method="GET"
              >
                <div className="grid gap-4 md:grid-cols-2 lg:col-span-3">
                  <div className="space-y-2">
                    <label htmlFor="staffingBucket" className="text-sm font-medium">
                      Staffing bucket
                    </label>
                    <select
                      id="staffingBucket"
                      name="staffingBucket"
                      defaultValue={filters.staffingBucket}
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                    >
                      <option value="">All buckets</option>
                      <option value="perm total">PERM total</option>
                      <option value="ext total">EXT total</option>
                      <option value="active">Active</option>
                      <option value="on leave">On leave</option>
                      <option value="open">Open</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="validation" className="text-sm font-medium">
                      Validation
                    </label>
                    <select
                      id="validation"
                      name="validation"
                      defaultValue={filters.validation}
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                    >
                      <option value="">All rows</option>
                      <option value="error">Errors only</option>
                      <option value="ok">OK only</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:col-span-3">
                  <div className="space-y-2">
                    <label htmlFor="year" className="text-sm font-medium">
                      Year
                    </label>
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
                    <label htmlFor="month" className="text-sm font-medium">
                      Month
                    </label>
                    <select
                      id="month"
                      name="month"
                      defaultValue={filters.month}
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                    >
                      <option value="">All months</option>
                      {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((month) => (
                        <option key={month} value={month}>
                          {month}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3 lg:col-span-3">
                  <MultiSelectFilter
                    label="Seat ID"
                    name="seatId"
                    options={filterOptions.seatIds}
                    selectedValues={filters.seatIds}
                  />
                  <MultiSelectFilter
                    label="Name"
                    name="name"
                    options={filterOptions.names}
                    selectedValues={filters.names}
                  />
                  <MultiSelectFilter
                    label="Email"
                    name="email"
                    options={filterOptions.emails}
                    selectedValues={filters.emails}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 lg:col-span-3">
                  <MultiSelectFilter
                    label="Domain"
                    name="domain"
                    options={filterOptions.domains}
                    selectedValues={selectedDomains}
                    onSelectedValuesChange={(values) => {
                      setSelectedDomains(values)
                      const nextHierarchyOptions = buildCascadingHierarchyOptions(
                        filterOptions.hierarchyRows,
                        values,
                        selectedSubDomains
                      )
                      setSelectedSubDomains((current) =>
                        pruneInvalidSelections(current, nextHierarchyOptions.subDomains)
                      )
                      setSelectedTeams((current) =>
                        pruneInvalidSelections(current, nextHierarchyOptions.teams)
                      )
                    }}
                  />
                  <MultiSelectFilter
                    label="Sub-domain"
                    name="subDomain"
                    options={hierarchyOptions.subDomains}
                    selectedValues={selectedSubDomains}
                    onSelectedValuesChange={(values) => {
                      setSelectedSubDomains(values)
                      const nextHierarchyOptions = buildCascadingHierarchyOptions(
                        filterOptions.hierarchyRows,
                        selectedDomains,
                        values
                      )
                      setSelectedTeams((current) =>
                        pruneInvalidSelections(current, nextHierarchyOptions.teams)
                      )
                    }}
                  />
                  <MultiSelectFilter
                    label="Team"
                    name="team"
                    options={hierarchyOptions.teams}
                    selectedValues={selectedTeams}
                    onSelectedValuesChange={setSelectedTeams}
                  />
                  <MultiSelectFilter
                    label="Project code"
                    name="projectCode"
                    options={filterOptions.projectCodes}
                    selectedValues={filters.projectCodes}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:col-span-3">
                  <MultiSelectFilter
                    label="Vendor"
                    name="vendor"
                    options={filterOptions.vendors}
                    selectedValues={filters.vendors}
                  />
                  <MultiSelectFilter
                    label="Status"
                    name="status"
                    options={filterOptions.statuses}
                    selectedValues={filters.statuses}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-3 lg:col-span-3">
                  <MultiSelectFilter
                    label="Location"
                    name="location"
                    options={filterOptions.locations}
                    selectedValues={filters.locations}
                  />
                  <MultiSelectFilter
                    label="Role"
                    name="role"
                    options={filterOptions.roles}
                    selectedValues={filters.roles}
                  />
                  <MultiSelectFilter
                    label="Band"
                    name="band"
                    options={filterOptions.bands}
                    selectedValues={filters.bands}
                  />
                </div>

                <div className="flex items-end gap-2 lg:col-span-3">
                  <Button type="submit">Apply</Button>
                  <Button asChild variant="outline">
                    <Link href={`/people-roster?year=${activeYear}`}>Reset</Link>
                  </Button>
                </div>
              </form>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <section className="grid gap-4 md:grid-cols-3">
          <Card className="brand-card">
            <CardHeader className="gap-1">
              <CardDescription>Filtered Rows</CardDescription>
              <CardTitle>{formatNumber(totals.rowCount)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="brand-card">
            <CardHeader className="gap-1">
              <CardDescription>Teams</CardDescription>
              <CardTitle>{formatNumber(totals.uniqueTeams)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="brand-card">
            <CardHeader className="gap-1">
              <CardDescription>External Resources</CardDescription>
              <CardTitle>{formatNumber(totals.externalCount)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="brand-card">
            <CardHeader className="gap-1">
              <CardDescription>Error Rows</CardDescription>
              <CardTitle>{formatNumber(totals.errorCount)}</CardTitle>
            </CardHeader>
          </Card>
      </section>

      <Card id="roster-list" className="brand-card">
          <CardHeader>
            <CardTitle>Roster List</CardTitle>
            <CardDescription>
              Showing {formatNumber(totals.rowCount)} roster rows for {activeYear}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Seat</TableHead>
                  <TableHead>Person</TableHead>
                  <TableHead>Hierarchy</TableHead>
                  <TableHead>Project Code</TableHead>
                  <TableHead>Funding</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Planning</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Validation</TableHead>
                  <TableHead>Import</TableHead>
                  {canEditTracker ? (
                    <TableHead className="text-right">Action</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map((person) => (
                  <TableRow key={person.id}>
                    <TableCell>
                      <Link
                        href={`/forecasts?year=${activeYear}&seatId=${encodeURIComponent(person.seatId)}`}
                        className="brand-inline-link"
                      >
                        {person.seatId}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {person.departmentCode || "No department code"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{person.name || "Unnamed"}</div>
                      <div className="text-xs text-muted-foreground">
                        {person.email || "No email"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{person.team || "No team"}</div>
                      <div className="text-xs text-muted-foreground">
                        Raw: {person.subDomain || "No sub-domain"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Mapped: {person.mappedSubDomain || "No mapping"}
                      </div>
                    </TableCell>
                    <TableCell>{person.projectCode || "No project code"}</TableCell>
                    <TableCell>{person.funding || "No funding"}</TableCell>
                    <TableCell>
                      <div>{person.vendor || "No vendor"}</div>
                      {person.dailyRate && person.dailyRate > 0 ? (
                        <div className="text-xs text-muted-foreground">
                          Daily rate: {formatNumber(person.dailyRate)}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>{person.location || "No location"}</TableCell>
                    <TableCell>
                      <div>{person.role || "No role"}</div>
                      <div className="text-xs text-muted-foreground">
                        Band: {person.band || "No band"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>FTE: {person.fte ?? 0}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(person.effectiveStartDate || person.startDate)} to{" "}
                        {formatDate(person.effectiveEndDate || person.endDate)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Manager: {person.manager || "No manager"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>{person.status || "No status"}</div>
                      <div className="text-xs text-muted-foreground">
                        {person.resourceType || "No type"}
                      </div>
                    </TableCell>
                    <TableCell>
                      {person.importError ? (
                        <>
                          <div className="font-medium text-red-700">Error</div>
                          <div className="text-xs text-red-600">{person.importError}</div>
                        </>
                      ) : (
                        <div className="text-xs text-muted-foreground">OK</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {person.importFileName}
                    </TableCell>
                    {canEditTracker ? (
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          disabled={!person.trackerSeatId}
                          aria-label={`Edit seat ${person.seatId}`}
                          onClick={() => {
                            setSeatDialogPersonId(person.id)
                            setIsCreatingSeat(false)
                          }}
                        >
                          <FilePenLine className="size-4" />
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
                {people.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={canEditTracker ? 13 : 12}
                      className="py-10 text-center text-muted-foreground"
                    >
                      No roster rows match the current filters.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <SeatEditorDialog
          activeYear={activeYear}
          open={isCreatingSeat || seatDialogPersonId !== null}
          onOpenChange={(open) => {
            if (!open) {
              setIsCreatingSeat(false)
              setSeatDialogPersonId(null)
            }
          }}
          seat={isCreatingSeat ? null : seatDialogPerson}
          budgetAreas={budgetAreas}
          departmentMappings={departmentMappings}
          seatReferenceValues={seatReferenceValues}
          statusOptions={filterOptions.statuses}
          userRole={userRole}
        />
    </main>
  )
}
