"use client"

import { useRef, useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
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
  ExternalActualImportBatchView,
  ExternalActualImportFilters,
  ExternalActualImportView,
} from "@/lib/finance/types"
import type { AppRole } from "@/lib/roles"

type TrackingYearOption = {
  id: string
  year: number
  isActive: boolean
}

type ExternalActualsBrowserProps = {
  userName: string
  userEmail: string
  userRole: AppRole
  activeYear: number
  trackingYears: TrackingYearOption[]
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

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export function ExternalActualsBrowser({
  userName,
  userEmail,
  userRole,
  activeYear,
  trackingYears,
  filters,
  filterOptions,
  imports,
  entries,
  totals,
}: ExternalActualsBrowserProps) {
  const [isImporting, startImportTransition] = useTransition()
  const [isRollingBack, startRollbackTransition] = useTransition()
  const [selectedYear, setSelectedYear] = useState(String(activeYear))
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

        const response = await fetch("/api/imports/external-actuals", {
          method: "POST",
          body: formData,
        })
        const body = await response.json()

        if (!response.ok) {
          throw new Error(body.error || "Import failed")
        }

        toast.success(`Imported ${file.name}`)
        window.location.href = `/external-actuals?year=${selectedYear}`
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
        title="External Actuals"
        subtitle="Import external spend by seat and month, then review imported actual rows."
        userName={userName}
        userEmail={userEmail}
        userRole={userRole}
        activeYear={activeYear}
        currentPath="/external-actuals"
      />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
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
              <Label htmlFor="external-file">CSV file</Label>
              <Input id="external-file" ref={fileRef} type="file" accept=".csv,text/csv" />
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
            <CardDescription>Filter imported external actual rows by user, file name, and import time.</CardDescription>
          </CardHeader>
          <CardContent>
            <form method="GET" className="grid gap-4 lg:grid-cols-[0.8fr_1fr_1fr_1fr_1fr_1fr_1fr_auto]">
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
                  <Link href={`/external-actuals?year=${activeYear}`}>Reset</Link>
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
      </main>
    </div>
  )
}
