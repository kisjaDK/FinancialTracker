"use client"

import { useRef, useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { FinanceHeader } from "@/components/finance/header"
import { MultiSelectFilter } from "@/components/finance/multi-select-filter"
import { Button } from "@/components/ui/button"
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
import { formatNumber } from "@/lib/finance/format"
import type { PeopleRosterFilters, PeopleRosterView } from "@/lib/finance/types"
import type { AppRole } from "@/lib/roles"

type TrackingYearOption = {
  id: string
  year: number
  isActive: boolean
}

type PeopleRosterBrowserProps = {
  userName: string
  userEmail: string
  userRole: AppRole
  activeYear: number
  trackingYears: TrackingYearOption[]
  filters: PeopleRosterFilters
  filterOptions: {
    seatIds: string[]
    names: string[]
    emails: string[]
    teams: string[]
    subDomains: string[]
    vendors: string[]
    locations: string[]
    statuses: string[]
    roles: string[]
    bands: string[]
  }
  people: PeopleRosterView[]
  totals: {
    rowCount: number
    uniqueTeams: number
    externalCount: number
    errorCount: number
  }
  rosterImports: {
    id: string
    fileName: string
    importedAt: string | Date
    rowCount: number
    importedByName?: string | null
    importedByEmail?: string | null
  }[]
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
  userName,
  userEmail,
  userRole,
  activeYear,
  trackingYears,
  filters,
  filterOptions,
  people,
  totals,
  rosterImports,
}: PeopleRosterBrowserProps) {
  const [selectedYear, setSelectedYear] = useState(String(activeYear))
  const [isImporting, startImportTransition] = useTransition()
  const [isRollingBack, startRollbackTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement | null>(null)

  function handleImport() {
    const file = fileRef.current?.files?.[0]
    if (!file) {
      toast.error("Choose a CSV file to import.")
      return
    }

    startImportTransition(async () => {
      try {
        const formData = new FormData()
        formData.set("file", file)
        formData.set("year", selectedYear)

        const response = await fetch("/api/imports/roster", {
          method: "POST",
          body: formData,
        })
        const body = await response.json()

        if (!response.ok) {
          throw new Error(body.error || "Import failed")
        }

        toast.success(`Imported ${file.name}`)
        if ((body.errorRowCount ?? 0) > 0) {
          toast.error(
            `${body.errorRowCount} roster row${body.errorRowCount === 1 ? "" : "s"} imported with hierarchy mapping errors`
          )
        }
        window.location.href = `/people-roster?year=${selectedYear}`
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Import failed")
      }
    })
  }

  function rollbackImport(importId: string, fileName: string) {
    if (!window.confirm(`Roll back roster import ${fileName}?`)) {
      return
    }

    startRollbackTransition(async () => {
      try {
        const response = await fetch(`/api/roster-imports/${importId}/rollback`, {
          method: "POST",
        })
        const body = await response.json()

        if (!response.ok) {
          throw new Error(body.error || "Rollback failed")
        }

        toast.success(`Rolled back ${fileName}`)
        window.location.href = `/people-roster?year=${activeYear}`
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Rollback failed")
      }
    })
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(187,108,37,0.16),_transparent_32%),linear-gradient(180deg,_rgba(255,250,243,1)_0%,_rgba(246,240,232,1)_100%)]">
      <FinanceHeader
        title="People Roster"
        subtitle="Browse imported roster rows and filter them by seat, person, team, hierarchy, vendor, and location."
        userName={userName}
        userEmail={userEmail}
        userRole={userRole}
        activeYear={activeYear}
        currentPath="/people-roster"
      />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <section className="grid gap-4 md:grid-cols-3">
          <Card className="border-amber-200/70 bg-white/90">
            <CardHeader className="gap-1">
              <CardDescription>Filtered Rows</CardDescription>
              <CardTitle>{formatNumber(totals.rowCount)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-amber-200/70 bg-white/90">
            <CardHeader className="gap-1">
              <CardDescription>Teams</CardDescription>
              <CardTitle>{formatNumber(totals.uniqueTeams)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-amber-200/70 bg-white/90">
            <CardHeader className="gap-1">
              <CardDescription>External Resources</CardDescription>
              <CardTitle>{formatNumber(totals.externalCount)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-amber-200/70 bg-white/90">
            <CardHeader className="gap-1">
              <CardDescription>Error Rows</CardDescription>
              <CardTitle>{formatNumber(totals.errorCount)}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        <Card className="border-amber-200/70 bg-white/90">
          <CardHeader>
            <CardTitle>Roster Import</CardTitle>
            <CardDescription>
              Import full or delta People Roster CSV files for {activeYear}.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[140px_1fr_auto]">
            <div className="space-y-2">
              <label htmlFor="roster-import-year" className="text-sm font-medium">
                Year
              </label>
              <select
                id="roster-import-year"
                value={selectedYear}
                onChange={(event) => setSelectedYear(event.target.value)}
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
              <label htmlFor="roster-import-file" className="text-sm font-medium">
                People Roster CSV
              </label>
              <input
                id="roster-import-file"
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex items-end">
              <Button type="button" disabled={isImporting} onClick={handleImport}>
                {isImporting ? "Importing..." : "Import Roster"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-200/70 bg-white/90">
          <CardHeader>
            <CardTitle>Import History</CardTitle>
            <CardDescription>
              Only the latest roster import can be rolled back. Earlier imports are locked once a later import exists.
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
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rosterImports.map((batch, index) => (
                  <TableRow key={batch.id}>
                    <TableCell>{formatDate(batch.importedAt)}</TableCell>
                    <TableCell>{batch.fileName}</TableCell>
                    <TableCell>
                      <div className="font-medium">{batch.importedByName || "Unknown user"}</div>
                      <div className="text-xs text-muted-foreground">
                        {batch.importedByEmail || "No email"}
                      </div>
                    </TableCell>
                    <TableCell>{formatNumber(batch.rowCount)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={index !== 0 || isRollingBack}
                        onClick={() => rollbackImport(batch.id, batch.fileName)}
                      >
                        Roll back
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {rosterImports.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No roster imports yet.
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
              Search each field to narrow the dropdown, then select one or more values.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 lg:grid-cols-3" method="GET">
              <div className="space-y-2 lg:col-span-3">
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
              <MultiSelectFilter
                label="Team"
                name="team"
                options={filterOptions.teams}
                selectedValues={filters.teams}
              />
              <MultiSelectFilter
                label="Sub-domain"
                name="subDomain"
                options={filterOptions.subDomains}
                selectedValues={filters.subDomains}
              />
              <MultiSelectFilter
                label="Vendor"
                name="vendor"
                options={filterOptions.vendors}
                selectedValues={filters.vendors}
              />
              <MultiSelectFilter
                label="Location"
                name="location"
                options={filterOptions.locations}
                selectedValues={filters.locations}
              />
              <MultiSelectFilter
                label="Status"
                name="status"
                options={filterOptions.statuses}
                selectedValues={filters.statuses}
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

              <div className="flex items-end gap-2 lg:col-span-3">
                <Button type="submit">Apply</Button>
                <Button asChild variant="outline">
                  <Link href={`/people-roster?year=${activeYear}`}>Reset</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-amber-200/70 bg-white/90">
          <CardHeader>
            <CardTitle>Imported Roster Rows</CardTitle>
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
                  <TableHead>Vendor</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Planning</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Validation</TableHead>
                  <TableHead>Import</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map((person) => (
                  <TableRow key={person.id}>
                    <TableCell>
                      <div className="font-medium">{person.seatId}</div>
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
                        {formatDate(person.startDate)} to {formatDate(person.endDate)}
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
                  </TableRow>
                ))}
                {people.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                      No roster rows match the current filters.
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
