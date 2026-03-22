"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { FinancePageIntro } from "@/components/finance/page-intro"
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
  BudgetMovementFundingSummaryView,
  BudgetMovementImportBatchView,
  BudgetMovementView,
} from "@/lib/finance/types"

type TrackingYearOption = {
  id: string
  year: number
  isActive: boolean
}

type BudgetMovementsBrowserProps = {
  activeYear: number
  trackingYears: TrackingYearOption[]
  filters: BudgetMovementFilters
  filterOptions: {
    categories: string[]
    funding: string[]
    receivingFunding: BudgetMovementFilterOption[]
    givingPillars: string[]
  }
  fundingValues: string[]
  fundingSummaries: BudgetMovementFundingSummaryView[]
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
  year: string
  funding: string
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

type MovementSortField =
  | "date"
  | "source"
  | "category"
  | "funding"
  | "giving"
  | "receiving"
  | "hierarchy"
  | "notes"
  | "financeView"
  | "amountGiven"

function makeEmptyForm(year: number): MovementFormValues {
  return {
    id: null,
    year: String(year),
    funding: "",
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

function buildFormValues(
  movement: BudgetMovementView,
  year: number
): MovementFormValues {
  return {
    id: movement.id,
    year: String(year),
    funding: movement.funding || "",
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
  activeYear,
  trackingYears,
  filters,
  filterOptions,
  fundingValues,
  fundingSummaries,
  movements,
  totals,
  imports,
}: BudgetMovementsBrowserProps) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [values, setValues] = useState<MovementFormValues>(makeEmptyForm(activeYear))
  const [availableFundingValues, setAvailableFundingValues] = useState(fundingValues)
  const [newFundingValue, setNewFundingValue] = useState("")
  const [isImporting, startImportTransition] = useTransition()
  const [isSaving, startSaveTransition] = useTransition()
  const [isDeleting, startDeleteTransition] = useTransition()
  const [isAddingFunding, startAddFundingTransition] = useTransition()
  const [isExporting, startExportTransition] = useTransition()
  const [isRollingBackImport, startRollbackImportTransition] = useTransition()
  const [pendingDelete, setPendingDelete] = useState<BudgetMovementView | null>(null)
  const [activeSortField, setActiveSortField] = useState<MovementSortField>("date")
  const [activeSortDirection, setActiveSortDirection] = useState<"asc" | "desc">("desc")

  const isEditing = values.id !== null
  const activeFundingFilter = filters.funding

  useEffect(() => {
    setAvailableFundingValues(fundingValues)
  }, [fundingValues])

  useEffect(() => {
    if (isEditing) {
      return
    }

    const targetYear = Number(values.year)
    if (!Number.isInteger(targetYear)) {
      return
    }

    let cancelled = false

    void fetch(`/api/seat-reference-values?year=${targetYear}&type=FUNDING`)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json()
          throw new Error(body.error || "Load failed")
        }

        return response.json()
      })
      .then((body: { values?: Array<{ value: string }> }) => {
        if (cancelled) {
          return
        }

        const nextValues = Array.from(
          new Set(
            (body.values ?? [])
              .map((value) => value.value)
              .filter((value): value is string => Boolean(value))
          )
        ).sort((left, right) => left.localeCompare(right))
        setAvailableFundingValues(nextValues)
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableFundingValues([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [isEditing, values.year])

  function resetForm() {
    setValues(makeEmptyForm(activeYear))
    setNewFundingValue("")
  }

  function applyFundingFilter(funding: string) {
    const nextFundingFilter =
      activeFundingFilter === funding ? "" : funding
    const searchParams = new URLSearchParams({
      year: String(activeYear),
    })

    if (filters.search) {
      searchParams.set("search", filters.search)
    }
    if (filters.category) {
      searchParams.set("category", filters.category)
    }
    if (nextFundingFilter) {
      searchParams.set("funding", nextFundingFilter)
    }
    if (filters.receivingFunding) {
      searchParams.set("receivingFunding", filters.receivingFunding)
    }
    if (filters.givingPillar) {
      searchParams.set("givingPillar", filters.givingPillar)
    }

    router.push(`/budget-movements?${searchParams.toString()}`)
  }

  function updateMovementSort(field: MovementSortField) {
    if (activeSortField === field) {
      setActiveSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }

    setActiveSortField(field)
    setActiveSortDirection(field === "date" ? "desc" : "asc")
  }

  function sortIndicator(field: MovementSortField) {
    if (activeSortField !== field) {
      return "↕"
    }

    return activeSortDirection === "asc" ? "↑" : "↓"
  }

  const sortedMovements = useMemo(() => {
    const sorted = [...movements]
    const factor = activeSortDirection === "asc" ? 1 : -1
    const compareText = (
      left: string | null | undefined,
      right: string | null | undefined
    ) => (left || "").localeCompare(right || "", undefined, { sensitivity: "base" })
    const compareNumber = (left: number, right: number) => (left - right) * factor

    sorted.sort((left, right) => {
      if (activeSortField === "date") {
        const leftTime = left.effectiveDate ? new Date(left.effectiveDate).getTime() : 0
        const rightTime = right.effectiveDate ? new Date(right.effectiveDate).getTime() : 0
        return (leftTime - rightTime) * factor
      }

      if (activeSortField === "financeView") {
        return compareNumber(
          left.financeViewAmount ?? left.amountGiven,
          right.financeViewAmount ?? right.amountGiven
        )
      }

      if (activeSortField === "amountGiven") {
        return compareNumber(left.amountGiven, right.amountGiven)
      }

      const result =
        activeSortField === "source"
          ? compareText(left.isManual ? "Manual" : "Imported", right.isManual ? "Manual" : "Imported")
          : activeSortField === "category"
            ? compareText(left.category, right.category)
            : activeSortField === "funding"
              ? compareText(left.funding, right.funding)
              : activeSortField === "giving"
                ? compareText(
                    `${left.givingFunding || ""} ${left.givingPillar || ""}`.trim(),
                    `${right.givingFunding || ""} ${right.givingPillar || ""}`.trim()
                  )
                : activeSortField === "receiving"
                  ? compareText(
                      `${left.receivingFunding} ${left.receivingProjectCode}`.trim(),
                      `${right.receivingFunding} ${right.receivingProjectCode}`.trim()
                    )
                  : activeSortField === "hierarchy"
                    ? compareText(
                        `${left.areaDomain || ""} ${left.areaSubDomain || ""} ${left.areaDisplayName || ""}`.trim(),
                        `${right.areaDomain || ""} ${right.areaSubDomain || ""} ${right.areaDisplayName || ""}`.trim()
                      )
                    : compareText(left.notes, right.notes)

      return result * factor
    })

    return sorted
  }, [activeSortDirection, activeSortField, movements])

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

  function handleExport() {
    startExportTransition(async () => {
      try {
        const searchParams = new URLSearchParams({
          year: String(activeYear),
        })

        if (filters.search) {
          searchParams.set("search", filters.search)
        }
        if (filters.category) {
          searchParams.set("category", filters.category)
        }
        if (filters.funding) {
          searchParams.set("funding", filters.funding)
        }
        if (filters.receivingFunding) {
          searchParams.set("receivingFunding", filters.receivingFunding)
        }
        if (filters.givingPillar) {
          searchParams.set("givingPillar", filters.givingPillar)
        }

        const response = await fetch(`/api/budget-movements/export?${searchParams.toString()}`)
        if (!response.ok) {
          const body = await response.json()
          throw new Error(body.error || "Export failed")
        }

        const blob = new Blob([await response.text()], {
          type: "text/csv;charset=utf-8;",
        })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = `budget-movements-${activeYear}.csv`
        link.click()
        URL.revokeObjectURL(url)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Export failed")
      }
    })
  }

  function handleAddFundingValue() {
    const trimmedValue = newFundingValue.trim()
    const targetYear = Number(values.year)

    if (!trimmedValue) {
      toast.error("Enter a funding value first.")
      return
    }

    if (!Number.isInteger(targetYear)) {
      toast.error("Choose a valid year.")
      return
    }

    startAddFundingTransition(async () => {
      try {
        await fetchJson("/api/seat-reference-values", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            year: targetYear,
            type: "FUNDING",
            value: trimmedValue,
          }),
        })

        setAvailableFundingValues((current) =>
          Array.from(new Set([...current, trimmedValue])).sort((left, right) =>
            left.localeCompare(right)
          )
        )
        setValues((current) => ({ ...current, funding: trimmedValue }))
        setNewFundingValue("")
        toast.success("Funding value added")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Save failed")
      }
    })
  }

  function handleSave() {
    startSaveTransition(async () => {
      try {
        const targetYear = Number(values.year)
        const payload = {
          year: targetYear,
          id: values.id,
          funding: values.funding,
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
        if (!isEditing && targetYear !== activeYear) {
          router.push(`/budget-movements?year=${targetYear}`)
          router.refresh()
          return
        }
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

  function rollbackImport(batchId: string, fileName: string) {
    if (!window.confirm(`Roll back budget movement import ${fileName}?`)) {
      return
    }

    startRollbackImportTransition(async () => {
      try {
        const response = await fetch(
          `/api/budget-movement-imports/${batchId}/rollback`,
          {
            method: "POST",
          }
        )
        const body = await response.json()

        if (!response.ok) {
          throw new Error(body.error || "Rollback failed")
        }

        toast.success(`Rolled back ${fileName}`)
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Rollback failed")
      }
    })
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 py-2">
      <FinancePageIntro
        title="Budget Movements"
        subtitle="Import CSV batches, maintain manual adjustments, and review movement rows by hierarchy, funding, and notes."
      />
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
          <CardContent className="grid gap-4 md:grid-cols-[1fr_auto_auto]">
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
            <div className="flex items-end">
              <Button type="button" variant="outline" onClick={handleExport} disabled={isExporting}>
                {isExporting ? "Exporting..." : "Export CSV"}
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
            {imports.map((batch, index) => (
              <div
                key={batch.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{batch.fileName}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDateTime(batch.importedAt)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{formatNumber(batch.rowCount)} rows</Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={index !== 0 || isRollingBackImport}
                    onClick={() => rollbackImport(batch.id, batch.fileName)}
                  >
                    Roll back
                  </Button>
                </div>
              </div>
            ))}
            {imports.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No CSV imports recorded for this year yet.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Only the latest budget movement import can be rolled back. Manual entries are not affected.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="brand-card">
        <CardHeader>
          <CardTitle>{isEditing ? "Edit Movement" : "Add Manual Movement"}</CardTitle>
          <CardDescription>
            {isEditing
              ? "Update the selected row. Imported rows can be corrected here as needed."
              : `Add a manual budget movement and assign the funding it should link against.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="movement-year">Year</Label>
              <select
                id="movement-year"
                value={values.year}
                disabled={isEditing}
                onChange={(event) =>
                  setValues((current) => ({ ...current, year: event.target.value }))
                }
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
              <Label htmlFor="movement-funding">Funding</Label>
              <select
                id="movement-funding"
                value={values.funding}
                onChange={(event) =>
                  setValues((current) => ({ ...current, funding: event.target.value }))
                }
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="">Select funding</option>
                {availableFundingValues.map((funding) => (
                  <option key={funding} value={funding}>
                    {funding}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <Label htmlFor="new-funding-value">Add New Funding</Label>
              <Input
                id="new-funding-value"
                value={newFundingValue}
                onChange={(event) => setNewFundingValue(event.target.value)}
                placeholder="Add a year-specific funding value"
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                onClick={handleAddFundingValue}
                disabled={isAddingFunding}
              >
                {isAddingFunding ? "Adding..." : "Add Funding"}
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
          <CardTitle>Funding Summary</CardTitle>
          <CardDescription>
            Net current position by funding after all increases and decreases for {activeYear}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Funding</TableHead>
                <TableHead>Latest Change</TableHead>
                <TableHead>Movements</TableHead>
                <TableHead>Finance View Net</TableHead>
                <TableHead>Amount Given Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fundingSummaries.map((summary) => {
                const summaryFilterValue =
                  summary.funding === "Unassigned" ? "__unassigned__" : summary.funding
                const isActive = activeFundingFilter === summaryFilterValue

                return (
                  <TableRow
                    key={summary.funding}
                    className={isActive ? "brand-selected-row cursor-pointer" : "cursor-pointer"}
                    onClick={() => applyFundingFilter(summaryFilterValue)}
                  >
                    <TableCell className="font-medium">{summary.funding}</TableCell>
                    <TableCell>{formatDate(summary.latestEffectiveDate)}</TableCell>
                    <TableCell>{formatNumber(summary.movementCount)}</TableCell>
                    <TableCell>{formatCurrency(summary.financeViewAmount)}</TableCell>
                    <TableCell>{formatCurrency(summary.amountGiven)}</TableCell>
                  </TableRow>
                )
              })}
              {fundingSummaries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No funding summary available for the current filters.
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
            Search notes text and narrow the movement list for {activeYear}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 lg:grid-cols-6" method="GET">
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
              <Label htmlFor="funding">Funding</Label>
              <select
                id="funding"
                name="funding"
                defaultValue={filters.funding}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="">All funding</option>
                <option value="__unassigned__">Unassigned</option>
                {filterOptions.funding.map((funding) => (
                  <option key={funding} value={funding}>
                    {funding}
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

            <div className="flex items-end gap-2 lg:col-span-6">
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
                <TableHead>
                  <button type="button" onClick={() => updateMovementSort("date")}>Date {sortIndicator("date")}</button>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => updateMovementSort("source")}>Source {sortIndicator("source")}</button>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => updateMovementSort("category")}>Category {sortIndicator("category")}</button>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => updateMovementSort("funding")}>Funding {sortIndicator("funding")}</button>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => updateMovementSort("giving")}>Giving {sortIndicator("giving")}</button>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => updateMovementSort("receiving")}>Receiving {sortIndicator("receiving")}</button>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => updateMovementSort("hierarchy")}>Hierarchy {sortIndicator("hierarchy")}</button>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => updateMovementSort("notes")}>Notes {sortIndicator("notes")}</button>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => updateMovementSort("financeView")}>Finance View {sortIndicator("financeView")}</button>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => updateMovementSort("amountGiven")}>Amount Given {sortIndicator("amountGiven")}</button>
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedMovements.map((movement) => (
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
                  <TableCell>{movement.funding || "No funding"}</TableCell>
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
                        onClick={() => setValues(buildFormValues(movement, activeYear))}
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
                  <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                    No budget movements match the current filters.
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
