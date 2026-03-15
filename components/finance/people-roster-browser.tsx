"use client"

import { useRef, useState, useTransition } from "react"
import Link from "next/link"
import { Check, ChevronsUpDown, FilePenLine } from "lucide-react"
import { toast } from "sonner"
import { FinancePageIntro } from "@/components/finance/page-intro"
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatNumber } from "@/lib/finance/format"
import type { AppRole } from "@/lib/roles"
import type { PeopleRosterFilters, PeopleRosterView } from "@/lib/finance/types"
import { cn } from "@/lib/utils"

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
  rosterImports: {
    id: string
    fileName: string
    importedAt: string | Date
    rowCount: number
    importedByName?: string | null
    importedByEmail?: string | null
  }[]
  budgetAreas: BudgetAreaOption[]
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

function normalizeValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ""
}

function normalizeDomainLabel(value: string | null | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) {
    return null
  }

  return normalizeValue(trimmed) === "data and analytics"
    ? "Data & Analytics"
    : trimmed
}

function normalizeSubDomainLabel(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed || null
}

function isCodeLikeAreaLabel(value: string | null | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) {
    return false
  }

  return /^[A-Z]\d+\s*·\s*[A-Z]\d+$/i.test(trimmed)
}

export function PeopleRosterBrowser({
  userRole,
  activeYear,
  trackingYears,
  filters,
  filterOptions,
  people,
  totals,
  rosterImports,
  budgetAreas,
}: PeopleRosterBrowserProps) {
  const [selectedYear, setSelectedYear] = useState(String(activeYear))
  const [isImporting, startImportTransition] = useTransition()
  const [isRollingBack, startRollbackTransition] = useTransition()
  const [isSavingOverride, startOverrideTransition] = useTransition()
  const [overrideDialogPersonId, setOverrideDialogPersonId] = useState<string | null>(null)
  const [pillarPickerOpen, setPillarPickerOpen] = useState(false)
  const [overrideValues, setOverrideValues] = useState(() => ({
    budgetAreaId: "",
    spendPlanId: "",
    ritm: "",
    sow: "",
    notes: "",
  }))
  const fileRef = useRef<HTMLInputElement | null>(null)
  const canEditTracker = userRole !== "GUEST"

  const overrideDialogPerson =
    people.find((person) => person.id === overrideDialogPersonId) ?? null

  const scopedPillarOptions = overrideDialogPerson
    ? budgetAreas
        .filter(
          (area) =>
            normalizeValue(normalizeDomainLabel(area.domain)) ===
              normalizeValue(normalizeDomainLabel(overrideDialogPerson.domain))
        )
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
        .sort((left, right) => left.label.localeCompare(right.label))
    : []
  const selectedOverrideArea =
    scopedPillarOptions.find((option) => option.id === overrideValues.budgetAreaId)?.area ?? null

  function buildOverrideValuesFromPerson(person?: PeopleRosterView | null) {
    if (!person) {
      return {
        budgetAreaId: "",
        spendPlanId: "",
        ritm: "",
        sow: "",
        notes: "",
      }
    }

    return {
      budgetAreaId: person.overrideBudgetAreaId || "",
      spendPlanId: person.spendPlanId || "",
      ritm: person.ritm || "",
      sow: person.sow || "",
      notes: person.notes || "",
    }
  }

  function openOverrideDialog(person: PeopleRosterView) {
    if (!person.trackerSeatId) {
      toast.error(`No tracker seat is available for ${person.seatId}.`)
      return
    }

    setOverrideDialogPersonId(person.id)
    setOverrideValues(buildOverrideValuesFromPerson(person))
    setPillarPickerOpen(false)
  }

  async function saveOverride() {
    if (!overrideDialogPerson?.trackerSeatId) {
      return
    }

    startOverrideTransition(async () => {
      try {
        const response = await fetch(`/api/tracker-seats/${overrideDialogPerson.trackerSeatId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
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
              notes: overrideValues.notes || null,
            },
          }),
        })
        const body = await response.json()

        if (!response.ok) {
          throw new Error(body.error || "Failed to save tracker override")
        }

        toast.success("Seat override saved")
        window.location.href = `/people-roster?year=${activeYear}`
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save tracker override")
      }
    })
  }

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
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 py-2">
        <FinancePageIntro
          title="People Roster"
          subtitle="Browse imported roster rows and filter them by seat, person, team, hierarchy, vendor, and location."
        />
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

        <Card className="brand-card">
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

        <Card className="brand-card">
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

        <Card className="brand-card">
          <CardHeader>
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
          </CardHeader>
          <CardContent>
            <form
              action={`/people-roster#imported-roster-rows`}
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
                  selectedValues={filters.domains}
                />
                <MultiSelectFilter
                  label="Sub-domain"
                  name="subDomain"
                  options={filterOptions.subDomains}
                  selectedValues={filters.subDomains}
                />
                <MultiSelectFilter
                  label="Team"
                  name="team"
                  options={filterOptions.teams}
                  selectedValues={filters.teams}
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
        </Card>

        <Card id="imported-roster-rows" className="brand-card">
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
                    {canEditTracker ? (
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          disabled={!person.trackerSeatId}
                          aria-label={`Open budget override for ${person.seatId}`}
                          onClick={() => openOverrideDialog(person)}
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
                      colSpan={canEditTracker ? 11 : 10}
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

        <Dialog
          open={overrideDialogPersonId !== null}
          onOpenChange={(open) => {
            if (!open) {
              setOverrideDialogPersonId(null)
              setPillarPickerOpen(false)
            }
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Budget Override</DialogTitle>
              <DialogDescription>
                Update budget-facing metadata for the imported roster row.
              </DialogDescription>
            </DialogHeader>
            {overrideDialogPerson ? (
              <div className="space-y-4">
                <div className="rounded-2xl bg-muted/40 p-4 text-sm">
                  <div className="font-medium">
                    {overrideDialogPerson.seatId} · {overrideDialogPerson.name || "Unnamed"}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {overrideDialogPerson.domain || "Unmapped"} ·{" "}
                    {overrideDialogPerson.mappedSubDomain ||
                      overrideDialogPerson.subDomain ||
                      "Unmapped"}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    Current project code: {overrideDialogPerson.projectCode || "No project code"}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="roster-override-pillar">Pillar</Label>
                  <Popover open={pillarPickerOpen} onOpenChange={setPillarPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="roster-override-pillar"
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
                            {scopedPillarOptions.map((option) => (
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
                                  <span className="text-xs text-muted-foreground">
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
                    <Label htmlFor="roster-spend-plan">Spend Plan ID</Label>
                    <Input
                      id="roster-spend-plan"
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
                    <Label htmlFor="roster-ritm">RITM</Label>
                    <Input
                      id="roster-ritm"
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
                    <Label htmlFor="roster-sow">SOW</Label>
                    <Input
                      id="roster-sow"
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
                    <Label htmlFor="roster-override-notes">Notes</Label>
                    <Input
                      id="roster-override-notes"
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
                  type="button"
                  disabled={!overrideDialogPerson.trackerSeatId || isSavingOverride}
                  onClick={saveOverride}
                >
                  {isSavingOverride ? "Saving..." : "Save Override"}
                </Button>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </main>
  )
}
