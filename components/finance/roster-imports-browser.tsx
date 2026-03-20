"use client"

import { useRef, useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { FinancePageIntro } from "@/components/finance/page-intro"
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

type TrackingYearOption = {
  id: string
  year: number
  isActive: boolean
}

type RosterImportBatch = {
  id: string
  fileName: string
  importedAt: string | Date
  rowCount: number
  importedByName?: string | null
  importedByEmail?: string | null
}

type RosterImportsBrowserProps = {
  activeYear: number
  trackingYears: TrackingYearOption[]
  rosterImports: RosterImportBatch[]
  backHref?: string
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

export function RosterImportsBrowser({
  activeYear,
  trackingYears,
  rosterImports,
  backHref,
}: RosterImportsBrowserProps) {
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
        window.location.href = `/people-roster/imports?year=${selectedYear}`
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
        window.location.href = `/people-roster/imports?year=${activeYear}`
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Rollback failed")
      }
    })
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 py-2">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <FinancePageIntro
          title="Roster Imports"
          subtitle="Import the people roster CSV and review recent approved import batches."
        />
        {backHref ? (
          <Button asChild variant="outline" className="sm:mt-1">
            <Link href={backHref}>Back To People Roster</Link>
          </Button>
        ) : null}
      </section>

      <Card className="brand-card">
        <CardHeader>
          <CardTitle>Import Roster</CardTitle>
          <CardDescription>
            Upload a new people roster CSV for the selected year.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)_auto]">
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
    </main>
  )
}
