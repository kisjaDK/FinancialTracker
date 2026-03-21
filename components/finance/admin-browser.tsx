"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import type { BudgetMovementBucket } from "@prisma/client"
import { FinancePageIntro } from "@/components/finance/page-intro"
import { SeatReferenceValuesCard } from "@/components/finance/seat-reference-values-card"
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
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { serializeCsv } from "@/lib/finance/csv"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatNumber } from "@/lib/finance/format"
import type { SeatReferenceValueView } from "@/lib/finance/types"

type TrackingYearOption = {
  id: string
  year: number
  isActive: boolean
}

type StatusDefinition = {
  id: string
  label: string
  isActiveStatus: boolean
  sortOrder: number
}

type DepartmentMapping = {
  id: string
  sourceCode: string
  domain: string
  subDomain: string
  projectCode: string
  teams: string[]
  notes: string | null
}

type ExchangeRate = {
  currency: "DKK" | "EUR" | "USD"
  rateToDkk: number
  effectiveDate: Date
  notes: string | null
}

type AccrualAccountMapping = {
  id: string
  resourceType: string
  accountCode: string
  notes: string | null
}

type BudgetMovementCategoryMapping = {
  id: string
  category: string
  bucket: BudgetMovementBucket
  notes: string | null
}

type ResetDataset =
  | "people-roster"
  | "forecasts"
  | "actuals"
  | "budget-movements"
  | "internal-costs"

type AdminBrowserProps = {
  activeYear: number
  trackingYears: TrackingYearOption[]
  statuses: StatusDefinition[]
  departmentMappings: DepartmentMapping[]
  accrualAccountMappings: AccrualAccountMapping[]
  rosterResourceTypes: string[]
  exchangeRates: ExchangeRate[]
  seatReferenceValues: SeatReferenceValueView[]
  budgetMovementCategoryMappings: BudgetMovementCategoryMapping[]
  budgetMovementCategories: string[]
}

const BUDGET_MOVEMENT_BUCKET_OPTIONS: BudgetMovementBucket[] = [
  "PERM",
  "EXT",
  "CLOUD",
  "AMS",
  "LICENSES",
]

function inferBudgetMovementBucket(category: string): BudgetMovementBucket {
  const normalizedCategory = category.trim().toLowerCase()

  if (normalizedCategory.includes("cloud")) {
    return "CLOUD"
  }

  if (normalizedCategory.includes("license") || normalizedCategory.includes("licence")) {
    return "LICENSES"
  }

  if (normalizedCategory.includes("ams")) {
    return "AMS"
  }

  if (/\bext\b/.test(normalizedCategory) || normalizedCategory.includes("external")) {
    return "EXT"
  }

  return "PERM"
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

function toDateInputValue(value: Date) {
  return new Date(value).toISOString().slice(0, 10)
}

export function AdminBrowser({
  activeYear,
  trackingYears,
  statuses,
  departmentMappings,
  accrualAccountMappings,
  rosterResourceTypes,
  exchangeRates,
  seatReferenceValues,
  budgetMovementCategoryMappings,
  budgetMovementCategories,
}: AdminBrowserProps) {
  const router = useRouter()
  const mappingImportRef = useRef<HTMLInputElement | null>(null)
  const forecastOverrideImportRef = useRef<HTMLInputElement | null>(null)
  const trackerOverrideImportRef = useRef<HTMLInputElement | null>(null)
  const [editingMappingId, setEditingMappingId] = useState<string | null>(null)
  const [mappingValues, setMappingValues] = useState({
    sourceCode: "",
    domain: "",
    subDomain: "",
    projectCode: "",
    teams: "",
    notes: "",
  })
  const [pendingDelete, setPendingDelete] = useState<DepartmentMapping | null>(null)
  const [editingAccrualMappingId, setEditingAccrualMappingId] = useState<string | null>(null)
  const [accrualMappingValues, setAccrualMappingValues] = useState({
    resourceType: "",
    accountCode: "",
    notes: "",
  })
  const [pendingAccrualMappingDelete, setPendingAccrualMappingDelete] =
    useState<AccrualAccountMapping | null>(null)
  const [isDeletingMapping, setIsDeletingMapping] = useState(false)
  const [isDeletingAccrualMapping, setIsDeletingAccrualMapping] = useState(false)
  const [categoryBucketDrafts, setCategoryBucketDrafts] = useState<Record<string, BudgetMovementBucket>>(
    () =>
      Object.fromEntries(
        Array.from(
          new Set([
            ...budgetMovementCategories,
            ...budgetMovementCategoryMappings.map((mapping) => mapping.category),
          ])
        ).map((category) => {
          const explicitMapping = budgetMovementCategoryMappings.find(
            (mapping) => mapping.category === category
          )

          return [
            category,
            explicitMapping?.bucket ?? inferBudgetMovementBucket(category),
          ]
        })
      )
  )
  const [savingCategory, setSavingCategory] = useState<string | null>(null)
  const [deletingCategoryMappingId, setDeletingCategoryMappingId] = useState<string | null>(null)
  const [pendingReset, setPendingReset] = useState<ResetDataset | null>(null)
  const [isResetting, setIsResetting] = useState(false)
  const [pendingOverrideDelete, setPendingOverrideDelete] = useState<
    "forecast-overrides" | "tracker-overrides" | null
  >(null)
  const [isDeletingOverrideDataset, setIsDeletingOverrideDataset] = useState(false)
  const [fxValues, setFxValues] = useState({
    currency: "EUR" as "DKK" | "EUR" | "USD",
    rateToDkk: "",
    effectiveDate: `${activeYear}-01-01`,
    notes: "",
  })
  const availableAccrualResourceTypes = Array.from(
    new Set([
      ...rosterResourceTypes,
      ...accrualAccountMappings.map((mapping) => mapping.resourceType),
    ])
  ).sort((left, right) => left.localeCompare(right))
  const exchangeRateHistoryByCurrency = ["EUR", "USD"].map((currency) => ({
    currency,
    rates: exchangeRates.filter((rate) => rate.currency === currency),
  }))
  const vendorValues = seatReferenceValues.filter((value) => value.type === "VENDOR")
  const locationValues = seatReferenceValues.filter((value) => value.type === "LOCATION")
  const managerValues = seatReferenceValues.filter((value) => value.type === "MANAGER")
  const roleValues = seatReferenceValues.filter((value) => value.type === "ROLE")
  const bandValues = seatReferenceValues.filter((value) => value.type === "BAND")
  const resourceTypeValues = seatReferenceValues.filter(
    (value) => value.type === "RESOURCE_TYPE"
  )
  const budgetMovementCategoryRows = Array.from(
    new Set([
      ...budgetMovementCategories,
      ...budgetMovementCategoryMappings.map((mapping) => mapping.category),
    ])
  )
    .sort((left, right) => left.localeCompare(right))
    .map((category) => {
    const explicitMapping =
      budgetMovementCategoryMappings.find((mapping) => mapping.category === category) ?? null

    return {
      category,
      explicitMapping,
      effectiveBucket:
        categoryBucketDrafts[category] ??
        explicitMapping?.bucket ??
        inferBudgetMovementBucket(category),
    }
  })

  useEffect(() => {
    setCategoryBucketDrafts(
      Object.fromEntries(
        Array.from(
          new Set([
            ...budgetMovementCategories,
            ...budgetMovementCategoryMappings.map((mapping) => mapping.category),
          ])
        ).map((category) => {
          const explicitMapping = budgetMovementCategoryMappings.find(
            (mapping) => mapping.category === category
          )

          return [
            category,
            explicitMapping?.bucket ?? inferBudgetMovementBucket(category),
          ]
        })
      )
    )
  }, [budgetMovementCategories, budgetMovementCategoryMappings])


  function resetMappingForm() {
    setEditingMappingId(null)
    setMappingValues({
      sourceCode: "",
      domain: "",
      subDomain: "",
      projectCode: "",
      teams: "",
      notes: "",
    })
  }

  function resetAccrualMappingForm() {
    setEditingAccrualMappingId(null)
    setAccrualMappingValues({
      resourceType: "",
      accountCode: "",
      notes: "",
    })
  }

  async function handleJsonSubmit(
    payload: unknown,
    endpoint: string,
    successMessage: string
  ) {
    try {
      await fetchJson(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })
      toast.success(successMessage)
      if (endpoint === "/api/department-mappings") {
        resetMappingForm()
      }
      if (endpoint === "/api/accrual-account-mappings") {
        resetAccrualMappingForm()
      }
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed")
    }
  }

  async function updateStatus(label: string, isActiveStatus: boolean) {
    await handleJsonSubmit(
      {
        year: activeYear,
        label,
        isActiveStatus,
      },
      "/api/status-definitions",
      "Status mapping saved"
    )
  }

  async function deleteMapping() {
    if (!pendingDelete) {
      return
    }

    setIsDeletingMapping(true)

    try {
      await fetchJson("/api/department-mappings", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          year: activeYear,
          id: pendingDelete.id,
        }),
      })
      toast.success("Hierarchy mapping deleted")
      setPendingDelete(null)
      setMappingValues((current) =>
        current.sourceCode === pendingDelete.sourceCode
          ? {
              sourceCode: "",
              domain: "",
              subDomain: "",
              projectCode: "",
              teams: "",
              notes: "",
            }
          : current
      )
      if (pendingDelete.id === editingMappingId) {
        setEditingMappingId(null)
      }
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed")
    } finally {
      setIsDeletingMapping(false)
    }
  }

  async function deleteAccrualMapping() {
    if (!pendingAccrualMappingDelete) {
      return
    }

    setIsDeletingAccrualMapping(true)

    try {
      await fetchJson("/api/accrual-account-mappings", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          year: activeYear,
          id: pendingAccrualMappingDelete.id,
        }),
      })
      toast.success("Accrual account mapping deleted")
      setPendingAccrualMappingDelete(null)
      if (pendingAccrualMappingDelete.id === editingAccrualMappingId) {
        resetAccrualMappingForm()
      }
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed")
    } finally {
      setIsDeletingAccrualMapping(false)
    }
  }

  async function saveBudgetMovementCategory(category: string) {
    const bucket = categoryBucketDrafts[category]
    if (!bucket) {
      toast.error("Select a bucket first")
      return
    }

    const existing = budgetMovementCategoryMappings.find((mapping) => mapping.category === category)
    setSavingCategory(category)

    try {
      await fetchJson("/api/admin/budget-movement-category-mappings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: existing?.id,
          year: activeYear,
          category,
          bucket,
        }),
      })
      toast.success("Budget movement category mapping saved")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed")
    } finally {
      setSavingCategory(null)
    }
  }

  async function resetBudgetMovementCategoryMapping(mappingId: string) {
    setDeletingCategoryMappingId(mappingId)

    try {
      await fetchJson("/api/admin/budget-movement-category-mappings", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          year: activeYear,
          id: mappingId,
        }),
      })
      toast.success("Budget movement category mapping reset")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reset failed")
    } finally {
      setDeletingCategoryMappingId(null)
    }
  }

  function downloadCsv(fileName: string, content: string) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  }

  async function importMappings(file: File) {
    const formData = new FormData()
    formData.append("year", String(activeYear))
    formData.append("file", file)

    try {
      const body = await fetchJson("/api/imports/department-mappings", {
        method: "POST",
        body: formData,
      })
      toast.success(
        `${body.importedCount} hierarchy mapping row${body.importedCount === 1 ? "" : "s"} imported`
      )
      if (mappingImportRef.current) {
        mappingImportRef.current.value = ""
      }
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed")
    }
  }

  async function downloadAdminCsv(endpoint: string, fileName: string) {
    try {
      const response = await fetch(`${endpoint}?year=${activeYear}`)
      if (!response.ok) {
        const body = await response.json()
        throw new Error(body.error || "Export failed")
      }

      downloadCsv(fileName, await response.text())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed")
    }
  }

  async function importOverrideFile(
    endpoint: string,
    file: File,
    inputRef: React.RefObject<HTMLInputElement | null>,
    successLabel: string
  ) {
    const formData = new FormData()
    formData.append("year", String(activeYear))
    formData.append("file", file)

    try {
      const body = await fetchJson(endpoint, {
        method: "POST",
        body: formData,
      })
      toast.success(
        `${body.importedCount} ${successLabel} row${body.importedCount === 1 ? "" : "s"} imported`
      )
      if (inputRef.current) {
        inputRef.current.value = ""
      }
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed")
    }
  }

  async function deleteOverrideDataset(dataset: "forecast-overrides" | "tracker-overrides") {
    setIsDeletingOverrideDataset(true)

    try {
      const body = await fetchJson(
        dataset === "forecast-overrides"
          ? "/api/admin/forecast-overrides"
          : "/api/admin/tracker-overrides",
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            year: activeYear,
          }),
        }
      )
      toast.success(
        `${body.deletedCount} ${dataset === "forecast-overrides" ? "forecast" : "tracker"} override${body.deletedCount === 1 ? "" : "s"} deleted`
      )
      setPendingOverrideDelete(null)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed")
    } finally {
      setIsDeletingOverrideDataset(false)
    }
  }

  async function resetDataset(dataset: ResetDataset) {
    setIsResetting(true)

    try {
      await fetchJson("/api/admin/year-reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          year: activeYear,
          dataset,
        }),
      })
      toast.success("Year data reset")
      setPendingReset(null)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reset failed")
    } finally {
      setIsResetting(false)
    }
  }

  return (
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 py-2">
        <FinancePageIntro
          title="Admin"
          subtitle="Maintain tracker configuration, hierarchy mappings, and exchange rates."
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
              <AlertDialogTitle>Delete hierarchy mapping?</AlertDialogTitle>
              <AlertDialogDescription>
                {pendingDelete
                  ? `This will remove the mapping for ${pendingDelete.sourceCode} (${pendingDelete.domain} / ${pendingDelete.subDomain}). This action cannot be undone.`
                  : "This action cannot be undone."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeletingMapping}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={isDeletingMapping}
                onClick={() => {
                  void deleteMapping()
                }}
              >
                {isDeletingMapping ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={Boolean(pendingAccrualMappingDelete)}
          onOpenChange={(open) => {
            if (!open) {
              setPendingAccrualMappingDelete(null)
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete accrual account mapping?</AlertDialogTitle>
              <AlertDialogDescription>
                {pendingAccrualMappingDelete
                  ? `This will remove the account mapping for ${pendingAccrualMappingDelete.resourceType}. This action cannot be undone.`
                  : "This action cannot be undone."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeletingAccrualMapping}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={isDeletingAccrualMapping}
                onClick={() => {
                  void deleteAccrualMapping()
                }}
              >
                {isDeletingAccrualMapping ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={Boolean(pendingReset)}
          onOpenChange={(open) => {
            if (!open) {
              setPendingReset(null)
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset year data?</AlertDialogTitle>
              <AlertDialogDescription>
                {pendingReset
                  ? `This will permanently clear ${pendingReset.replaceAll("-", " ")} for ${activeYear}.`
                  : "This action cannot be undone."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isResetting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={isResetting}
                onClick={() => {
                  if (pendingReset) {
                    void resetDataset(pendingReset)
                  }
                }}
              >
                {isResetting ? "Resetting..." : "Reset"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={Boolean(pendingOverrideDelete)}
          onOpenChange={(open) => {
            if (!open) {
              setPendingOverrideDelete(null)
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete override dataset?</AlertDialogTitle>
              <AlertDialogDescription>
                {pendingOverrideDelete === "forecast-overrides"
                  ? `This will permanently clear all forecast overrides for ${activeYear}.`
                  : pendingOverrideDelete === "tracker-overrides"
                    ? `This will permanently clear all tracker overrides for ${activeYear}.`
                    : "This action cannot be undone."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeletingOverrideDataset}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={isDeletingOverrideDataset}
                onClick={() => {
                  if (pendingOverrideDelete) {
                    void deleteOverrideDataset(pendingOverrideDelete)
                  }
                }}
              >
                {isDeletingOverrideDataset ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Card className="brand-card">
          <CardHeader>
            <CardTitle>Year</CardTitle>
            <CardDescription>Select the tracker year to administer.</CardDescription>
          </CardHeader>
          <CardContent>
            <select
              id="admin-year"
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              value={String(activeYear)}
              onChange={(event) => {
                router.push(`/admin?year=${event.target.value}`)
              }}
            >
              {trackingYears.map((year) => (
                <option key={year.id} value={year.year}>
                  {year.year}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
        <Tabs defaultValue="other" className="gap-4">
          <TabsList variant="line" className="w-full flex-wrap justify-start gap-2">
            <TabsTrigger value="other">Other</TabsTrigger>
            <TabsTrigger value="data">Year Data</TabsTrigger>
            <TabsTrigger value="roster-selects">Roster Selects</TabsTrigger>
            <TabsTrigger value="fx">Exchange Rates</TabsTrigger>
          </TabsList>

          <TabsContent value="other" className="space-y-6">
            <section className="grid gap-6 xl:grid-cols-2">
              <Card className="brand-card">
                <CardHeader>
                  <CardTitle>Status Definitions</CardTitle>
                  <CardDescription>
                    The allowed statuses are fixed. Use the toggle to control which statuses count as active in the tracker.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Counts As Active</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {statuses.map((status) => (
                        <TableRow key={status.id}>
                          <TableCell>{status.label}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={status.isActiveStatus}
                                onChange={(event) =>
                                  void updateStatus(status.label, event.target.checked)
                                }
                              />
                              <span className="text-sm text-muted-foreground">
                                {status.isActiveStatus ? "Active" : "Not active"}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <div className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                    Statuses available: {statuses.map((status) => status.label).join(", ")}
                  </div>
                </CardContent>
              </Card>

              <Card className="brand-card">
                <CardHeader>
                  <CardTitle>Budget Movement Category Mapping</CardTitle>
                  <CardDescription>
                    Map imported budget movement categories into the app buckets used for budget reporting.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                    Categories default to an inferred bucket until you save an explicit mapping. Buckets available: PERM, EXT, Cloud, AMS, Licenses.
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead>Bucket</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {budgetMovementCategoryRows.map((row) => (
                        <TableRow key={row.category}>
                          <TableCell className="font-medium">{row.category}</TableCell>
                          <TableCell>
                            <select
                              className="h-9 min-w-36 rounded-md border border-border bg-background px-3 text-sm"
                              value={row.effectiveBucket}
                              onChange={(event) =>
                                setCategoryBucketDrafts((current) => ({
                                  ...current,
                                  [row.category]: event.target.value as BudgetMovementBucket,
                                }))
                              }
                            >
                              {BUDGET_MOVEMENT_BUCKET_OPTIONS.map((bucket) => (
                                <option key={bucket} value={bucket}>
                                  {bucket}
                                </option>
                              ))}
                            </select>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {row.explicitMapping ? "Explicit mapping" : "Default inference"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={savingCategory === row.category}
                                onClick={() => void saveBudgetMovementCategory(row.category)}
                              >
                                {savingCategory === row.category ? "Saving..." : "Save"}
                              </Button>
                              {row.explicitMapping ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={deletingCategoryMappingId === row.explicitMapping.id}
                                  onClick={() =>
                                    void resetBudgetMovementCategoryMapping(row.explicitMapping!.id)
                                  }
                                >
                                  {deletingCategoryMappingId === row.explicitMapping.id
                                    ? "Resetting..."
                                    : "Reset"}
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {budgetMovementCategoryRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground">
                            No budget movement categories found for this year.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card className="brand-card xl:col-span-2">
                <CardHeader>
                  <CardTitle>Hierarchy Mapping</CardTitle>
                  <CardDescription>
                    Map department codes into domain, sub-domain, project code, and one or more allowed teams.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3">
                    <div className="rounded-xl border border-dashed border-border p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-sm font-medium">CSV Import / Export</p>
                          <p className="text-xs text-muted-foreground">
                            Import `Department Code`, `Domain`, `Sub-domain`, `Project Code`, comma-separated `Teams`, and optional `Notes`.
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() =>
                            downloadCsv(
                              `hierarchy-mappings-${activeYear}.csv`,
                              serializeCsv(
                                departmentMappings.map((mapping) => ({
                                  "Department Code": mapping.sourceCode,
                                  Domain: mapping.domain,
                                  "Sub-domain": mapping.subDomain,
                                  "Project Code": mapping.projectCode,
                                  Teams: mapping.teams.join(", "),
                                  Notes: mapping.notes ?? "",
                                })),
                                ["Department Code", "Domain", "Sub-domain", "Project Code", "Teams", "Notes"]
                              )
                            )
                          }
                        >
                          Export CSV
                        </Button>
                      </div>
                      <div className="mt-3 flex flex-col gap-2 md:flex-row">
                        <Input
                          ref={mappingImportRef}
                          type="file"
                          accept=".csv,text/csv"
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            if (file) {
                              void importMappings(file)
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <Input
                        placeholder="Department code, e.g. D6861"
                        value={mappingValues.sourceCode}
                        onChange={(event) =>
                          setMappingValues((current) => ({
                            ...current,
                            sourceCode: event.target.value,
                          }))
                        }
                      />
                      <Input
                        placeholder="Data & Analytics"
                        value={mappingValues.domain}
                        onChange={(event) =>
                          setMappingValues((current) => ({
                            ...current,
                            domain: event.target.value,
                          }))
                        }
                      />
                      <Input
                        placeholder="Architecture"
                        value={mappingValues.subDomain}
                        onChange={(event) =>
                          setMappingValues((current) => ({
                            ...current,
                            subDomain: event.target.value,
                          }))
                        }
                      />
                      <Input
                        placeholder="L68610001"
                        value={mappingValues.projectCode}
                        onChange={(event) =>
                          setMappingValues((current) => ({
                            ...current,
                            projectCode: event.target.value,
                          }))
                        }
                      />
                      <Input
                        placeholder="Teams, comma separated"
                        value={mappingValues.teams}
                        onChange={(event) =>
                          setMappingValues((current) => ({
                            ...current,
                            teams: event.target.value,
                          }))
                        }
                      />
                      <Input
                        placeholder="Optional notes"
                        value={mappingValues.notes}
                        onChange={(event) =>
                          setMappingValues((current) => ({
                            ...current,
                            notes: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          void handleJsonSubmit(
                            {
                              id: editingMappingId,
                              year: activeYear,
                              sourceCode: mappingValues.sourceCode,
                              domain: mappingValues.domain,
                              subDomain: mappingValues.subDomain,
                              projectCode: mappingValues.projectCode,
                              teams: mappingValues.teams
                                .split(",")
                                .map((team) => team.trim())
                                .filter(Boolean),
                              notes: mappingValues.notes,
                            },
                            "/api/department-mappings",
                            editingMappingId ? "Hierarchy mapping updated" : "Hierarchy mapping saved"
                          )
                        }}
                      >
                        {editingMappingId ? "Update Mapping" : "Save Mapping"}
                      </Button>
                      <Button variant="ghost" onClick={resetMappingForm}>
                        {editingMappingId ? "Cancel Edit" : "Clear"}
                      </Button>
                    </div>
                  </div>

                  <div className="max-h-72 overflow-y-auto rounded-xl border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Department Code</TableHead>
                          <TableHead>Domain</TableHead>
                          <TableHead>Sub-domain</TableHead>
                          <TableHead>Project Code</TableHead>
                          <TableHead>Teams</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {departmentMappings.map((mapping) => (
                          <TableRow key={mapping.id}>
                            <TableCell>{mapping.sourceCode}</TableCell>
                            <TableCell>{mapping.domain}</TableCell>
                            <TableCell>{mapping.subDomain}</TableCell>
                            <TableCell>{mapping.projectCode}</TableCell>
                            <TableCell>
                              {mapping.teams.length > 0 ? (
                                <div className="space-y-1">
                                  {mapping.teams.map((team) => (
                                    <div key={team} className="break-words">
                                      {team}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                "No teams"
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setEditingMappingId(mapping.id)
                                    setMappingValues({
                                      sourceCode: mapping.sourceCode,
                                      domain: mapping.domain,
                                      subDomain: mapping.subDomain,
                                      projectCode: mapping.projectCode,
                                      teams: mapping.teams.join(", "),
                                      notes: mapping.notes || "",
                                    })
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700"
                                  onClick={() => {
                                    setPendingDelete(mapping)
                                  }}
                                >
                                  Delete
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {departmentMappings.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                              No hierarchy mappings saved yet.
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <Card className="brand-card xl:col-span-2">
                <CardHeader>
                  <CardTitle>Accrual Account Mapping</CardTitle>
                  <CardDescription>
                    Map current roster resource types to the finance account code used in accrual exports.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3">
                    <select
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                      value={accrualMappingValues.resourceType}
                      onChange={(event) =>
                        setAccrualMappingValues((current) => ({
                          ...current,
                          resourceType: event.target.value,
                        }))
                      }
                    >
                      <option value="">Select resource type</option>
                      {availableAccrualResourceTypes.map((resourceType) => (
                        <option key={resourceType} value={resourceType}>
                          {resourceType}
                        </option>
                      ))}
                    </select>
                    <Input
                      placeholder="4800213"
                      value={accrualMappingValues.accountCode}
                      onChange={(event) =>
                        setAccrualMappingValues((current) => ({
                          ...current,
                          accountCode: event.target.value,
                        }))
                      }
                    />
                    <Input
                      placeholder="Optional notes"
                      value={accrualMappingValues.notes}
                      onChange={(event) =>
                        setAccrualMappingValues((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          void handleJsonSubmit(
                            {
                              id: editingAccrualMappingId,
                              year: activeYear,
                              resourceType: accrualMappingValues.resourceType,
                              accountCode: accrualMappingValues.accountCode,
                              notes: accrualMappingValues.notes,
                            },
                            "/api/accrual-account-mappings",
                            editingAccrualMappingId
                              ? "Accrual account mapping updated"
                              : "Accrual account mapping saved"
                          )
                        }}
                      >
                        {editingAccrualMappingId ? "Update Mapping" : "Save Mapping"}
                      </Button>
                      <Button variant="ghost" onClick={resetAccrualMappingForm}>
                        {editingAccrualMappingId ? "Cancel Edit" : "Clear"}
                      </Button>
                    </div>
                  </div>

                  <div className="max-h-72 overflow-y-auto rounded-xl border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Resource Type</TableHead>
                          <TableHead>Account</TableHead>
                          <TableHead>Notes</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {accrualAccountMappings.map((mapping) => (
                          <TableRow key={mapping.id}>
                            <TableCell>{mapping.resourceType}</TableCell>
                            <TableCell>{mapping.accountCode}</TableCell>
                            <TableCell>{mapping.notes || "No notes"}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setEditingAccrualMappingId(mapping.id)
                                    setAccrualMappingValues({
                                      resourceType: mapping.resourceType,
                                      accountCode: mapping.accountCode,
                                      notes: mapping.notes || "",
                                    })
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700"
                                  onClick={() => {
                                    setPendingAccrualMappingDelete(mapping)
                                  }}
                                >
                                  Delete
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {accrualAccountMappings.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                              No accrual account mappings saved yet.
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </section>
          </TabsContent>

          <TabsContent value="data" className="space-y-6">
            <Card className="brand-card">
              <CardHeader>
                <CardTitle>Reset Year Data</CardTitle>
                <CardDescription>
                  Clear one year-scoped dataset at a time without touching service messages.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {[
                  { key: "people-roster", label: "Reset People Roster" },
                  { key: "forecasts", label: "Reset Forecasts" },
                  { key: "actuals", label: "Reset Actuals" },
                  { key: "budget-movements", label: "Reset Budget Movements" },
                  { key: "internal-costs", label: "Reset Internal Costs" },
                ].map((item) => (
                  <Button
                    key={item.key}
                    variant="outline"
                    className="justify-start"
                    onClick={() => setPendingReset(item.key as ResetDataset)}
                  >
                    {item.label}
                  </Button>
                ))}
              </CardContent>
            </Card>

            <Card className="brand-card">
              <CardHeader>
                <CardTitle>Override Backups</CardTitle>
                <CardDescription>
                  Export, import, or clear forecast overrides and tracker overrides independently.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-dashed border-border p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Forecast Overrides</p>
                    <p className="text-xs text-muted-foreground">
                      Month-level forecast override amounts and forecast on/off flags.
                    </p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() =>
                        void downloadAdminCsv(
                          "/api/admin/forecast-overrides",
                          `forecast-overrides-${activeYear}.csv`
                        )
                      }
                    >
                      Export CSV
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => forecastOverrideImportRef.current?.click()}
                    >
                      Import CSV
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => setPendingOverrideDelete("forecast-overrides")}
                    >
                      Delete All
                    </Button>
                  </div>
                  <Input
                    ref={forecastOverrideImportRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="mt-3"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) {
                        void importOverrideFile(
                          "/api/admin/forecast-overrides",
                          file,
                          forecastOverrideImportRef,
                          "forecast override"
                        )
                      }
                    }}
                  />
                </div>

                <div className="rounded-xl border border-dashed border-border p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Tracker Overrides</p>
                    <p className="text-xs text-muted-foreground">
                      Seat-level tracker field overrides such as domain, status, allocation, and dates.
                    </p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() =>
                        void downloadAdminCsv(
                          "/api/admin/tracker-overrides",
                          `tracker-overrides-${activeYear}.csv`
                        )
                      }
                    >
                      Export CSV
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => trackerOverrideImportRef.current?.click()}
                    >
                      Import CSV
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => setPendingOverrideDelete("tracker-overrides")}
                    >
                      Delete All
                    </Button>
                  </div>
                  <Input
                    ref={trackerOverrideImportRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="mt-3"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) {
                        void importOverrideFile(
                          "/api/admin/tracker-overrides",
                          file,
                          trackerOverrideImportRef,
                          "tracker override"
                        )
                      }
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="roster-selects">
            <section className="grid gap-6 xl:grid-cols-3">
              <SeatReferenceValuesCard
                activeYear={activeYear}
                title="Vendors"
                description="Maintain the allowed vendor dropdown values used by the seat editor."
                type="VENDOR"
                values={vendorValues}
              />
              <SeatReferenceValuesCard
                activeYear={activeYear}
                title="Locations"
                description="Maintain the allowed location dropdown values used by the seat editor."
                type="LOCATION"
                values={locationValues}
              />
              <SeatReferenceValuesCard
                activeYear={activeYear}
                title="Managers"
                description="Maintain the allowed manager dropdown values used by the seat editor."
                type="MANAGER"
                values={managerValues}
              />
              <SeatReferenceValuesCard
                activeYear={activeYear}
                title="Roles"
                description="Maintain the allowed role dropdown values used by the seat editor."
                type="ROLE"
                values={roleValues}
              />
              <SeatReferenceValuesCard
                activeYear={activeYear}
                title="Bands"
                description="Maintain the allowed band dropdown values used by the seat editor."
                type="BAND"
                values={bandValues}
              />
              <SeatReferenceValuesCard
                activeYear={activeYear}
                title="Resource Types"
                description="Maintain the allowed resource type dropdown values used by the seat editor."
                type="RESOURCE_TYPE"
                values={resourceTypeValues}
              />
            </section>
          </TabsContent>

          <TabsContent value="fx">
            <Card className="brand-card">
              <CardHeader>
                <CardTitle>Exchange Rates</CardTitle>
                <CardDescription>
                  Maintain FX rates and review the full effective-date history used for conversions.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3">
                  <select
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                    value={fxValues.currency}
                    onChange={(event) =>
                      setFxValues((current) => ({
                        ...current,
                        currency: event.target.value as "DKK" | "EUR" | "USD",
                      }))
                    }
                  >
                    {["EUR", "USD"].map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                  <Input
                    placeholder="7.46"
                    value={fxValues.rateToDkk}
                    onChange={(event) =>
                      setFxValues((current) => ({
                        ...current,
                        rateToDkk: event.target.value,
                      }))
                    }
                  />
                  <Input
                    type="date"
                    value={fxValues.effectiveDate}
                    onChange={(event) =>
                      setFxValues((current) => ({
                        ...current,
                        effectiveDate: event.target.value,
                      }))
                    }
                  />
                  <Input
                    placeholder="ECB closing rate"
                    value={fxValues.notes}
                    onChange={(event) =>
                      setFxValues((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        void handleJsonSubmit(
                          {
                            year: activeYear,
                            currency: fxValues.currency,
                            rateToDkk: Number(fxValues.rateToDkk),
                            effectiveDate: fxValues.effectiveDate,
                            notes: fxValues.notes,
                          },
                          "/api/exchange-rates",
                          "Exchange rate saved"
                        )
                      }}
                    >
                      Save FX Rate
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setFxValues({
                          currency: "EUR",
                          rateToDkk: "",
                          effectiveDate: `${activeYear}-01-01`,
                          notes: "",
                        })
                      }
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  {exchangeRateHistoryByCurrency.map(({ currency, rates }) => (
                    <div key={currency} className="space-y-2 rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{currency}</div>
                          <div className="text-xs text-muted-foreground">
                            {rates.length > 0
                              ? `${rates.length} saved rate${rates.length === 1 ? "" : "s"}`
                              : "No saved FX history yet"}
                          </div>
                        </div>
                        {rates[0] ? (
                          <div className="text-right text-sm">
                            <div>Latest: 1 {currency} = {formatNumber(rates[0].rateToDkk)} DKK</div>
                            <div className="text-xs text-muted-foreground">
                              Effective {formatDate(rates[0].effectiveDate)}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <div className="overflow-x-auto rounded-md border border-border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Effective Date</TableHead>
                              <TableHead>Rate</TableHead>
                              <TableHead>Notes</TableHead>
                              <TableHead className="w-[88px] text-right">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rates.map((rate, index) => (
                              <TableRow key={`${rate.currency}-${rate.effectiveDate.toString()}`}>
                                <TableCell>{formatDate(rate.effectiveDate)}</TableCell>
                                <TableCell>1 {rate.currency} = {formatNumber(rate.rateToDkk)} DKK</TableCell>
                                <TableCell className="text-muted-foreground">
                                  {rate.notes || (index === 0 ? "Latest configured rate" : "No notes")}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      setFxValues({
                                        currency: rate.currency,
                                        rateToDkk: String(rate.rateToDkk),
                                        effectiveDate: toDateInputValue(rate.effectiveDate),
                                        notes: rate.notes || "",
                                      })
                                    }
                                  >
                                    Edit
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                            {rates.length === 0 ? (
                              <TableRow>
                                <TableCell
                                  colSpan={4}
                                  className="py-6 text-center text-muted-foreground"
                                >
                                  No FX history saved for {currency}.
                                </TableCell>
                              </TableRow>
                            ) : null}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ))}

                  <div className="text-sm text-muted-foreground">
                    DKK is treated as 1.00 automatically.
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
  )
}
