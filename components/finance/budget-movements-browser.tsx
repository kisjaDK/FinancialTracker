"use client"

import { useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { FinanceHeader } from "@/components/finance/header"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
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
  BudgetMovementImportBatchView,
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
  imports: BudgetMovementImportBatchView[]
}

type MovementFormValues = {
  id: string | null
  givingFunding: string
  givingPillar: string
  amountGiven: string
  receivingCostCenter: string
  receivingProjectCode: string
  notes: string
  effectiveDate: string
  category: string
  financeViewAmount: string
  capexTarget: string
}

const EMPTY_FORM: MovementFormValues = {
  id: null,
  givingFunding: "",
  givingPillar: "",
  amountGiven: "",
  receivingCostCenter: "",
  receivingProjectCode: "",
  notes: "",
  effectiveDate: "",
  category: "",
  financeViewAmount: "",
  capexTarget: "",
}

async function fetchJson(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init)
  const body = await response.json()

  if (!response.ok) {
    throw new Error(body.error || "Request failed")
  }

  return body
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

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function toDateInputValue(value: Date | null) {
  if (!value) {
    return ""
  }

  return new Date(value).toISOString().slice(0, 10)
}

function buildFormValues(movement: BudgetMovementView): MovementFormValues {
  return {
    id: movement.id,
    givingFunding: movement.givingFunding || "",
    givingPillar: movement.givingPillar || "",
    amountGiven: String(movement.amountGiven),
    receivingCostCenter: movement.receivingFunding,
    receivingProjectCode: movement.receivingProjectCode,
    notes: movement.notes || "",
    effectiveDate: toDateInputValue(movement.effectiveDate),
    category: movement.category || "",
    financeViewAmount:
      movement.financeViewAmount === null ? "" : String(movement.financeViewAmount),
    capexTarget: movement.capexTarget === null ? "" : String(movement.capexTarget),
  }
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
  imports,
}: BudgetMovementsBrowserProps) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [values, setValues] = useState<MovementFormValues>(EMPTY_FORM)
  const [isImporting, startImportTransition] = useTransition()
  const [isSaving, startSaveTransition] = useTransition()
  const [isDeleting, startDeleteTransition] = useTransition()
  const [pendingDelete, setPendingDelete] = useState<BudgetMovementView | null>(null)

  const isEditing = values.id !== null

  function resetForm() {
    setValues(EMPTY_FORM)
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
        formData.set("year", String(activeYear))

        await fetchJson("/api/imports/budget-movements", {
          method: "POST",
          body: formData,
        })

        toast.success(`Imported ${file.name}`)
        router.refresh()
        if (fileRef.current) {
          fileRef.current.value = ""
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Import failed")
      }
    })
  }

  function handleSave() {
    startSaveTransition(async () => {
      try {
        const payload = {
          year: activeYear,
          id: values.id,
          givingFunding: values.givingFunding,
          givingPillar: values.givingPillar,
          amountGiven: Number(values.amountGiven),
          receivingCostCenter: values.receivingCostCenter,
          receivingProjectCode: values.receivingProjectCode,
          notes: values.notes,
          effectiveDate: values.effectiveDate || null,
          category: values.category,
          financeViewAmount:
            values.financeViewAmount.trim().length > 0
              ? Number(values.financeViewAmount)
              : null,
          capexTarget:
            values.capexTarget.trim().length > 0 ? Number(values.capexTarget) : null,
        }

        await fetchJson("/api/budget-movements", {
          method: isEditing ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        })

        toast.success(isEditing ? "Budget movement updated" : "Budget movement created")
        resetForm()
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Save failed")
      }
    })
  }

  function handleDelete() {
    if (!pendingDelete) {
      return
    }

    startDeleteTransition(async () => {
      try {
        await fetchJson("/api/budget-movements", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            year: activeYear,
            id: pendingDelete.id,
          }),
        })

        toast.success("Budget movement deleted")
        if (values.id === pendingDelete.id) {
          resetForm()
        }
        setPendingDelete(null)
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Delete failed")
      }
    })
  }

  return (
    <div className="min-h-screen brand-page-shell">
      <FinanceHeader
        title="Budget Movements"
        subtitle="Import CSV batches, maintain manual adjustments, and review movement rows by hierarchy and notes."
        userName={userName}
        userEmail={userEmail}
        userRole={userRole}
        activeYear={activeYear}
        currentPath="/budget-movements"
      />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <AlertDialog
          open={Boolean(pendingDelete)}
          onOpenChange={(open) => {
            if (!open) {
              setPendingDelete(null)
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete budget movement?</AlertDialogTitle>
              <AlertDialogDescription>
                {pendingDelete
                  ? `This will permanently delete the ${pendingDelete.isManual ? "manual" : "imported"} movement for ${pendingDelete.receivingFunding} / ${pendingDelete.receivingProjectCode}. This action cannot be undone.`
                  : "This action cannot be undone."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  handleDelete()
                }}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <section className="grid gap-4 md:grid-cols-3">
          <Card className="brand-card">
            <CardHeader className="gap-1">
              <CardDescription>Filtered Movements</CardDescription>
              <CardTitle>{formatNumber(totals.movementCount)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="brand-card">
            <CardHeader className="gap-1">
              <CardDescription>Finance View Total</CardDescription>
              <CardTitle>{formatCurrency(totals.financeViewAmount)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="brand-card">
            <CardHeader className="gap-1">
              <CardDescription>Amount Given Total</CardDescription>
              <CardTitle>{formatCurrency(totals.amountGiven)}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="brand-card">
            <CardHeader>
              <CardTitle>Import CSV</CardTitle>
              <CardDescription>
                Replace imported rows for {activeYear} while keeping manual entries intact.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <Label htmlFor="budget-movement-file">Budget Movements CSV</Label>
                <Input
                  id="budget-movement-file"
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                />
              </div>
              <div className="flex items-end">
                <Button type="button" onClick={handleImport} disabled={isImporting}>
                  {isImporting ? "Importing..." : "Import"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="brand-card">
            <CardHeader>
              <CardTitle>Import History</CardTitle>
              <CardDescription>Recent CSV batches for {activeYear}.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {imports.map((batch) => (
                <div
                  key={batch.id}
                  className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">{batch.fileName}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(batch.importedAt)}
                    </div>
                  </div>
                  <Badge variant="outline">{formatNumber(batch.rowCount)} rows</Badge>
                </div>
              ))}
              {imports.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No CSV imports recorded for this year yet.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </section>

        <Card className="brand-card">
          <CardHeader>
            <CardTitle>{isEditing ? "Edit Movement" : "Add Manual Movement"}</CardTitle>
            <CardDescription>
              {isEditing
                ? "Update the selected row. Imported rows can be corrected here as needed."
                : `Add a manual budget movement for ${activeYear}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="movement-effective-date">Effective Date</Label>
                <Input
                  id="movement-effective-date"
                  type="date"
                  value={values.effectiveDate}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      effectiveDate: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="movement-category">Category</Label>
                <Input
                  id="movement-category"
                  value={values.category}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, category: event.target.value }))
                  }
                  placeholder="Opex transfer"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="movement-giving-funding">Giving Funding</Label>
                <Input
                  id="movement-giving-funding"
                  value={values.givingFunding}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      givingFunding: event.target.value,
                    }))
                  }
                  placeholder="D1234"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="movement-giving-pillar">Giving Pillar</Label>
                <Input
                  id="movement-giving-pillar"
                  value={values.givingPillar}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      givingPillar: event.target.value,
                    }))
                  }
                  placeholder="Platform"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="movement-receiving-cost-center">Receiving Cost Center</Label>
                <Input
                  id="movement-receiving-cost-center"
                  value={values.receivingCostCenter}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      receivingCostCenter: event.target.value,
                    }))
                  }
                  placeholder="D6861"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="movement-receiving-project-code">
                  Receiving Project Code
                </Label>
                <Input
                  id="movement-receiving-project-code"
                  value={values.receivingProjectCode}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      receivingProjectCode: event.target.value,
                    }))
                  }
                  placeholder="PRJ-123"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="movement-amount-given">Amount Given</Label>
                <Input
                  id="movement-amount-given"
                  type="number"
                  step="0.01"
                  value={values.amountGiven}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      amountGiven: event.target.value,
                    }))
                  }
                  placeholder="125000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="movement-finance-view-amount">Finance View Amount</Label>
                <Input
                  id="movement-finance-view-amount"
                  type="number"
                  step="0.01"
                  value={values.financeViewAmount}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      financeViewAmount: event.target.value,
                    }))
                  }
                  placeholder="125000"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
              <div className="space-y-2">
                <Label htmlFor="movement-capex-target">CAPEX Target</Label>
                <Input
                  id="movement-capex-target"
                  type="number"
                  step="0.01"
                  value={values.capexTarget}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      capexTarget: event.target.value,
                    }))
                  }
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="movement-notes">Notes</Label>
                <Input
                  id="movement-notes"
                  value={values.notes}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, notes: event.target.value }))
                  }
                  placeholder="Optional context for this movement"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : isEditing ? "Update Movement" : "Add Movement"}
              </Button>
              <Button type="button" variant="outline" onClick={resetForm}>
                {isEditing ? "Cancel Edit" : "Clear"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="brand-card">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>
              Search notes text and narrow the movement list for {activeYear}.
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

        <Card className="brand-card">
          <CardHeader>
            <CardTitle>Movements</CardTitle>
            <CardDescription>
              Showing {formatNumber(totals.movementCount)} movement rows.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Giving</TableHead>
                  <TableHead>Receiving</TableHead>
                  <TableHead>Hierarchy</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Finance View</TableHead>
                  <TableHead>Amount Given</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell>{formatDate(movement.effectiveDate)}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge variant={movement.isManual ? "default" : "outline"}>
                          {movement.isManual ? "Manual" : "Imported"}
                        </Badge>
                        <div className="text-xs text-muted-foreground">
                          {movement.batchFileName}
                        </div>
                      </div>
                    </TableCell>
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
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setValues(buildFormValues(movement))}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setPendingDelete(movement)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {movements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
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
