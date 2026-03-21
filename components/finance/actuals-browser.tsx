"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Check, ChevronsUpDown, PenLine } from "lucide-react"
import { toast } from "sonner"
import { GuidanceHover } from "@/components/finance/guidance-hover"
import { FinancePageIntro } from "@/components/finance/page-intro"
import { Checkbox } from "@/components/ui/checkbox"
import { MONTH_NAMES, SUPPORTED_CURRENCIES } from "@/lib/finance/constants"
import { formatCurrency, formatFteAsPercent, formatNumber } from "@/lib/finance/format"
import type {
  ExternalActualImportBatchView,
  ExternalActualImportFilters,
  ExternalActualImportView,
} from "@/lib/finance/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type TrackingYearOption = {
  id: string
  year: number
  isActive: boolean
}

type CheckedState = boolean | "indeterminate"

type SummaryRow = {
  id: string
  domain: string | null
  subDomain: string | null
  displayName: string
  projectCode?: string | null
  seatCount: number
  activeSeatCount: number
  spentToDate: number
  totalForecast: number
  cloudCostSpentToDate: number
  cloudCostMonthlyActuals: number[]
  cloudCostMonthlyForecast: number[]
}

type SeatRow = {
  id: string
  seatId: string
  domain: string | null
  subDomain: string | null
  projectCode?: string | null
  team: string | null
  inSeat: string | null
  band: string | null
  status: string | null
  permFte?: number
  extFte?: number
  totalSpent: number
  totalForecast: number
  monthlyForecast: number[]
  months: {
    monthIndex: number
    actualAmountDkk: number
    actualAmountRaw: number | null
    actualCurrency: "DKK" | "EUR" | "USD"
    exchangeRateUsed: number | null
    forecastIncluded: boolean
    notes: string | null
  }[]
}

type BulkForecastPreview = {
  monthIndex: number
  monthLabel: string
  subDomain: string | null
  seats: {
    trackerSeatId: string
    seatId: string
    inSeat: string | null
    team: string | null
    status: string | null
    allocationPercent: number
    requiresConfirmation: boolean
    amount: number
    baseAmount: number
  }[]
}

type ActualsView = "internal" | "external" | "cloud" | "licenses"

type PastedExternalActualPreview = {
  status: "matched" | "needs_mapping"
  year: number
  monthIndex: number | null
  monthLabel: string | null
  monthOptions: {
    monthIndex: number
    monthLabel: string
    hasActual: boolean
    isEligible: boolean
  }[]
  suggestedMonthIndex: number | null
  spendPlanId: string
  spendPlanReference: string | null
  suggestedName: string | null
  invoiceNumber: string | null
  supplierName: string | null
  originalAmount: number
  originalCurrency: "DKK" | "EUR" | "USD"
  rateToDkk: number
  rateEffectiveDate: Date
  totalDkk: number
  seats: {
    trackerSeatId: string
    seatId: string
    team: string | null
    inSeat: string | null
    description: string | null
    allocation: number
    dailyRate: number | null
    originalAmount: number
    amountDkk: number
    daysEquivalent: number | null
    usedForecastAmount: number | null
  }[]
}

type ExternalActualNameSearchResult = {
  trackerSeatId: string
  seatId: string
  inSeat: string | null
  team: string | null
  status: string | null
  spendPlanId: string | null
  allocation: number
}

type ManualSearchField = "spendPlan" | "seatId" | "name"

type ActualsBrowserProps = {
  userEmail: string
  activeYear: number
  trackingYears: TrackingYearOption[]
  selectedAreaId: string | null
  summary: SummaryRow[]
  seats: SeatRow[]
  vendorOptions: string[]
  statusDefinitions: {
    id: string
    label: string
    isActiveStatus: boolean
    sortOrder: number
  }[]
  internalActualsMessage: string | null
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

async function fetchJson(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init)
  const body = await response.json()

  if (!response.ok) {
    throw new Error(body.error || "Request failed")
  }

  return body
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

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value))
}

function splitAmountByWeights(amount: number, weights: number[]) {
  if (weights.length === 0) {
    return []
  }

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
  if (totalWeight <= 0) {
    return weights.map(() => 0)
  }

  const rawShares = weights.map((weight) => (amount * weight) / totalWeight)
  const roundedShares = rawShares.map((share) => Math.round(share * 100) / 100)
  const roundedTotal = roundedShares.reduce((sum, share) => sum + share, 0)
  const remainder = Math.round((amount - roundedTotal) * 100) / 100

  if (Math.abs(remainder) >= 0.01) {
    const targetIndex = weights.reduce(
      (bestIndex, weight, index, collection) =>
        weight > collection[bestIndex] ? index : bestIndex,
      0
    )
    roundedShares[targetIndex] =
      Math.round((roundedShares[targetIndex] + remainder) * 100) / 100
  }

  return roundedShares
}

function normalizeValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ""
}

function firstWord(value: string | null | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) {
    return ""
  }

  return trimmed.split(/\s+/)[0] ?? ""
}

function formatCloudActualInputValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? String(value) : ""
}

export function ActualsBrowser({
  userEmail,
  activeYear,
  trackingYears,
  selectedAreaId,
  summary,
  seats,
  vendorOptions,
  statusDefinitions,
  internalActualsMessage,
  filters,
  filterOptions,
  imports,
  entries,
  totals,
}: ActualsBrowserProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedExternalEntryMode = searchParams.get("externalMode")
  const initialExternalEntryMode: "csv" | "manual" | "paste" =
    requestedExternalEntryMode === "manual" || requestedExternalEntryMode === "paste"
      ? requestedExternalEntryMode
      : "csv"
  const [isPending, startTransition] = useTransition()
  const [isImporting, startImportTransition] = useTransition()
  const [isSubmittingExternal, startExternalSubmitTransition] = useTransition()
  const [isSubmittingCloud, startCloudSubmitTransition] = useTransition()
  const [isRollingBack, startRollbackTransition] = useTransition()
  const [selectedSeatId, setSelectedSeatId] = useState(seats[0]?.id ?? "")
  const [selectedMonth, setSelectedMonth] = useState("0")
  const [actualAmount, setActualAmount] = useState("")
  const [actualCurrency, setActualCurrency] = useState<"DKK" | "EUR" | "USD">("DKK")
  const [forecastIncluded, setForecastIncluded] = useState(true)
  const [bulkCopyDialogOpen, setBulkCopyDialogOpen] = useState(false)
  const [bulkCopyMonth, setBulkCopyMonth] = useState(String(new Date().getMonth()))
  const [bulkCopyPreview, setBulkCopyPreview] = useState<BulkForecastPreview | null>(null)
  const [bulkCopyOverrides, setBulkCopyOverrides] = useState<Record<string, string>>({})
  const [bulkCopyConfirmations, setBulkCopyConfirmations] = useState<Record<string, boolean>>({})
  const [bulkCopyLoading, setBulkCopyLoading] = useState(false)
  const [selectedYear, setSelectedYear] = useState(String(activeYear))
  const [selectedImportYear, setSelectedImportYear] = useState(String(activeYear))
  const [selectedExternalMonth, setSelectedExternalMonth] = useState(String(new Date().getMonth()))
  const [externalEntryMode, setExternalEntryMode] = useState<"csv" | "manual" | "paste">(
    initialExternalEntryMode
  )
  const [fileInput, setFileInput] = useState<File | null>(null)
  const [manualSpendPlanId, setManualSpendPlanId] = useState("")
  const [manualSeatIdQuery, setManualSeatIdQuery] = useState("")
  const [manualNameQuery, setManualNameQuery] = useState("")
  const [manualSeatSearchResults, setManualSeatSearchResults] = useState<
    ExternalActualNameSearchResult[]
  >([])
  const [manualSeatSearchLoading, setManualSeatSearchLoading] = useState(false)
  const [activeManualSearchField, setActiveManualSearchField] = useState<ManualSearchField | null>(
    null
  )
  const [manualSelectedSeats, setManualSelectedSeats] = useState<
    ExternalActualNameSearchResult[]
  >([])
  const [manualAmount, setManualAmount] = useState("")
  const [manualCurrency, setManualCurrency] = useState<"DKK" | "EUR" | "USD">("DKK")
  const [manualInvoiceNumber, setManualInvoiceNumber] = useState("")
  const [manualSupplierName, setManualSupplierName] = useState("")
  const [manualSupplierTypeaheadOpen, setManualSupplierTypeaheadOpen] = useState(false)
  const [manualDescription, setManualDescription] = useState("")
  const [manualDkkPreview, setManualDkkPreview] = useState<{
    totalDkk: number
    rateToDkk: number
  } | null>(null)
  const [cloudActualAmount, setCloudActualAmount] = useState("")
  const [pastedInvoiceContent, setPastedInvoiceContent] = useState("")
  const [pastePreviewDialogOpen, setPastePreviewDialogOpen] = useState(false)
  const [pastedInvoicePreview, setPastedInvoicePreview] =
    useState<PastedExternalActualPreview | null>(null)
  const [selectedPastedReviewMonth, setSelectedPastedReviewMonth] = useState("")
  const [nameSearchQuery, setNameSearchQuery] = useState("")
  const [nameSearchResults, setNameSearchResults] = useState<ExternalActualNameSearchResult[]>([])
  const [selectedSeatIdsForSpendPlanMapping, setSelectedSeatIdsForSpendPlanMapping] = useState<
    string[]
  >([])
  const [editingExternalEntry, setEditingExternalEntry] = useState<ExternalActualImportView | null>(
    null
  )
  const [editExternalAmount, setEditExternalAmount] = useState("")
  const [editExternalInvoiceNumber, setEditExternalInvoiceNumber] = useState("")
  const [editExternalSupplierName, setEditExternalSupplierName] = useState("")
  const [deletingExternalEntry, setDeletingExternalEntry] =
    useState<ExternalActualImportView | null>(null)
  const requestedView = searchParams.get("view")
  const activeView: ActualsView =
    requestedView === "external" ||
    requestedView === "cloud" ||
    requestedView === "licenses"
      ? requestedView
      : "internal"

  const selectedArea = summary.find((row) => row.id === selectedAreaId) ?? summary[0]
  const effectiveSelectedAreaId = selectedAreaId ?? selectedArea?.id ?? null
  const selectedSeat = seats.find((seat) => seat.id === selectedSeatId) ?? seats[0]
  const domainOptions = useMemo(
    () =>
      Array.from(
        new Set(
          summary
            .map((row) => row.domain?.trim())
            .filter((value): value is string => Boolean(value))
        )
      ).sort((left, right) => left.localeCompare(right)),
    [summary]
  )
  const selectedDomain = selectedArea?.domain ?? domainOptions[0] ?? ""
  const subDomainOptions = useMemo(
    () =>
      Array.from(
        new Set(
          summary
            .filter((row) => row.domain === selectedDomain)
            .map((row) => row.subDomain?.trim())
            .filter((value): value is string => Boolean(value))
        )
      ).sort((left, right) => left.localeCompare(right)),
    [selectedDomain, summary]
  )
  const selectedSubDomain = selectedArea?.subDomain ?? subDomainOptions[0] ?? ""
  const projectCodeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          summary
            .filter(
              (row) =>
                row.domain === selectedDomain && row.subDomain === selectedSubDomain
            )
            .map((row) => row.projectCode?.trim())
            .filter((value): value is string => Boolean(value))
        )
      ).sort((left, right) => left.localeCompare(right)),
    [selectedDomain, selectedSubDomain, summary]
  )
  const showProjectCodeSelector = projectCodeOptions.length > 1
  const selectedProjectCode = selectedArea?.projectCode ?? projectCodeOptions[0] ?? ""
  const selectedScopeLabel = [selectedArea?.domain || "Unmapped", selectedArea?.subDomain || "Unmapped"].join(
    " / "
  )
  const selectedScopeDetail = selectedArea?.projectCode
    ? `${selectedScopeLabel} · ${selectedArea.projectCode}`
    : selectedScopeLabel
  const selectedMonthIndex = Number(selectedMonth)
  const selectedCloudForecast = selectedArea?.cloudCostMonthlyForecast?.[selectedMonthIndex] ?? 0
  const manualAmountValue = manualAmount.trim() ? Number(manualAmount) : 0
  const manualSelectedSeatIds = manualSelectedSeats.map((seat) => seat.trackerSeatId)
  const manualSeatAllocationShares = splitAmountByWeights(
    Number.isFinite(manualAmountValue) ? manualAmountValue : 0,
    manualSelectedSeats.map((seat) => seat.allocation)
  )
  const manualSearchDropdownOpen =
    activeManualSearchField !== null &&
    (manualSeatSearchLoading || manualSeatSearchResults.length > 0)
  const enteredCloudActualAmount = cloudActualAmount.trim() ? Number(cloudActualAmount) : null
  const cloudActualMonths =
    selectedArea?.cloudCostMonthlyActuals?.map((actual, monthIndex) => ({
      monthIndex,
      monthLabel: MONTH_NAMES[monthIndex],
      actual,
      forecast: selectedArea.cloudCostMonthlyForecast?.[monthIndex] ?? 0,
      deviation:
        (selectedArea.cloudCostMonthlyForecast?.[monthIndex] ?? 0) - actual,
    })) ?? []
  const cloudActualMonthsWithValues = cloudActualMonths.filter((month) => month.actual > 0)
  const cloudSpentToDateForecastComparable = cloudActualMonthsWithValues.reduce(
    (sum, month) => sum + month.forecast,
    0
  )
  const cloudSpentToDateDeviation =
    cloudActualMonthsWithValues.length > 0
      ? cloudSpentToDateForecastComparable - (selectedArea?.cloudCostSpentToDate ?? 0)
      : null
  const cloudDeviation =
    enteredCloudActualAmount !== null && Number.isFinite(enteredCloudActualAmount)
      ? selectedCloudForecast - enteredCloudActualAmount
      : null
  const activeStatusSet = useMemo(
    () =>
      new Set(
        statusDefinitions
          .filter((definition) => definition.isActiveStatus)
          .map((definition) => normalizeValue(definition.label))
      ),
    [statusDefinitions]
  )
  const permFteInScope = seats.reduce((sum, seat) => {
    const normalizedStatus = normalizeValue(seat.status)
    const normalizedInSeat = normalizeValue(seat.inSeat)
    const matchesActiveBucket =
      activeStatusSet.has(normalizedStatus) ||
      (normalizedStatus.length === 0 &&
        normalizedInSeat.length > 0 &&
        normalizedInSeat !== "vacant")
    const countsInPermTotal =
      normalizedStatus === "open" ||
      normalizedStatus === "on leave" ||
      matchesActiveBucket

    return countsInPermTotal ? sum + (seat.permFte ?? 0) : sum
  }, 0)
  const extFteInScope = seats.reduce((sum, seat) => sum + (seat.extFte ?? 0), 0)
  const permRosterHref = `/people-roster?${new URLSearchParams(
    Object.fromEntries(
      [
        ["year", String(activeYear)],
        selectedArea?.domain ? ["domain", selectedArea.domain] : null,
        selectedArea?.subDomain ? ["subDomain", selectedArea.subDomain] : null,
        selectedArea?.projectCode ? ["projectCode", selectedArea.projectCode] : null,
        ["staffingBucket", "perm total"],
      ].filter((entry): entry is [string, string] => Boolean(entry))
    )
  ).toString()}`
  const extRosterHref = `/people-roster?${new URLSearchParams(
    Object.fromEntries(
      [
        ["year", String(activeYear)],
        selectedArea?.domain ? ["domain", selectedArea.domain] : null,
        selectedArea?.subDomain ? ["subDomain", selectedArea.subDomain] : null,
        selectedArea?.projectCode ? ["projectCode", selectedArea.projectCode] : null,
        ["staffingBucket", "ext total"],
      ].filter((entry): entry is [string, string] => Boolean(entry))
    )
  ).toString()}`

  useEffect(() => {
    if (!selectedSeatId || !seats.some((seat) => seat.id === selectedSeatId)) {
      setSelectedSeatId(seats[0]?.id ?? "")
    }
  }, [selectedSeatId, seats])

  useEffect(() => {
    setSelectedYear(String(activeYear))
    setSelectedImportYear(String(activeYear))
  }, [activeYear])

  useEffect(() => {
    if (activeView !== "cloud") {
      return
    }

    const monthlyActuals = selectedArea?.cloudCostMonthlyActuals ?? []
    const firstMissingMonthIndex = monthlyActuals.findIndex((amount) => amount <= 0)
    const nextMonthIndex =
      firstMissingMonthIndex >= 0
        ? firstMissingMonthIndex
        : monthlyActuals.findIndex((amount) => amount > 0)
    const resolvedMonthIndex = nextMonthIndex >= 0 ? nextMonthIndex : 0

    setSelectedMonth(String(resolvedMonthIndex))
    setCloudActualAmount(formatCloudActualInputValue(monthlyActuals[resolvedMonthIndex] ?? 0))
  }, [activeView, selectedArea?.id, selectedArea?.cloudCostMonthlyActuals])

  useEffect(() => {
    if (!activeManualSearchField) {
      setManualSeatSearchResults([])
      setManualSeatSearchLoading(false)
      return
    }

    if (
      !manualSpendPlanId.trim() &&
      !manualSeatIdQuery.trim() &&
      !manualNameQuery.trim()
    ) {
      setManualSeatSearchResults([])
      setManualSeatSearchLoading(false)
      return
    }

    const timeoutId = window.setTimeout(async () => {
      setManualSeatSearchLoading(true)

      try {
        const response = (await fetchJson("/api/external-actuals/search-seats", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            year: Number(selectedImportYear),
            spendPlanId: manualSpendPlanId || undefined,
            seatId: manualSeatIdQuery || undefined,
            name: manualNameQuery || undefined,
          }),
        })) as { seats: ExternalActualNameSearchResult[] }

        setManualSeatSearchResults(response.seats)
      } catch {
        setManualSeatSearchResults([])
      } finally {
        setManualSeatSearchLoading(false)
      }
    }, 180)

    return () => window.clearTimeout(timeoutId)
  }, [
    activeManualSearchField,
    manualNameQuery,
    manualSeatIdQuery,
    manualSpendPlanId,
    selectedImportYear,
  ])

  useEffect(() => {
    if (manualCurrency === "DKK" || !manualAmount.trim() || !Number.isFinite(manualAmountValue)) {
      setManualDkkPreview(null)
      return
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = (await fetchJson("/api/external-actuals/manual-preview", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            year: Number(selectedImportYear),
            monthIndex: Number(selectedExternalMonth),
            amount: manualAmountValue,
            currency: manualCurrency,
          }),
        })) as { preview: { totalDkk: number; rateToDkk: number } }

        setManualDkkPreview(response.preview)
      } catch {
        setManualDkkPreview(null)
      }
    }, 180)

    return () => window.clearTimeout(timeoutId)
  }, [manualAmount, manualAmountValue, manualCurrency, selectedExternalMonth, selectedImportYear])

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(next).forEach(([key, value]) => {
      if (!value) {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    })

    startTransition(() => {
      router.push(`/actuals?${params.toString()}`)
    })
  }

  function mapActualsViewToParam(value: string): ActualsView {
    if (value === "external" || value === "cloud" || value === "licenses") {
      return value
    }

    return "internal"
  }

  function handleCloudMonthChange(nextMonthValue: string) {
    const nextMonthIndex = Number(nextMonthValue)
    const monthlyActual = selectedArea?.cloudCostMonthlyActuals?.[nextMonthIndex] ?? 0

    setSelectedMonth(nextMonthValue)
    setCloudActualAmount(formatCloudActualInputValue(monthlyActual))
  }

  function getFirstScopeForDomain(domain: string) {
    const rows = summary.filter((row) => row.domain === domain)
    const nextSubDomain =
      Array.from(
        new Set(
          rows
            .map((row) => row.subDomain?.trim())
            .filter((value): value is string => Boolean(value))
        )
      ).sort((left, right) => left.localeCompare(right))[0] ?? null
    const nextProjectCodes =
      nextSubDomain === null
        ? []
        : Array.from(
            new Set(
              rows
                .filter((row) => row.subDomain === nextSubDomain)
                .map((row) => row.projectCode?.trim())
                .filter((value): value is string => Boolean(value))
            )
          ).sort((left, right) => left.localeCompare(right))

    return {
      subDomain: nextSubDomain,
      projectCode: nextProjectCodes[0] ?? null,
      showProjectCodeSelector: nextProjectCodes.length > 1,
    }
  }

  function getFirstProjectCodeForSubDomain(domain: string, subDomain: string) {
    const nextProjectCodes = Array.from(
      new Set(
        summary
          .filter((row) => row.domain === domain && row.subDomain === subDomain)
          .map((row) => row.projectCode?.trim())
          .filter((value): value is string => Boolean(value))
      )
    ).sort((left, right) => left.localeCompare(right))

    return {
      projectCode: nextProjectCodes[0] ?? null,
      showProjectCodeSelector: nextProjectCodes.length > 1,
    }
  }

  function buildExternalViewUrl(
    yearValue: string,
    entryMode: "csv" | "manual" | "paste" = externalEntryMode
  ) {
    const nextUrl = new URLSearchParams()
    nextUrl.set("year", yearValue)
    nextUrl.set("view", "external")
    nextUrl.set("externalMode", entryMode)
    if (selectedDomain) {
      nextUrl.set("domain", selectedDomain)
    }
    if (selectedSubDomain) {
      nextUrl.set("subDomain", selectedSubDomain)
    }
    if (showProjectCodeSelector && selectedProjectCode) {
      nextUrl.set("projectCode", selectedProjectCode)
    }
    return `/actuals?${nextUrl.toString()}`
  }

  function refreshExternalView(
    yearValue: string,
    entryMode: "csv" | "manual" | "paste" = externalEntryMode
  ) {
    router.replace(buildExternalViewUrl(yearValue, entryMode), { scroll: false })
    router.refresh()
  }

  async function saveSeatMonth() {
    if (!selectedSeatId) {
      return
    }

    try {
      await fetchJson(`/api/tracker-seats/${selectedSeatId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          monthIndex: Number(selectedMonth),
          actualAmount: Number(actualAmount || 0),
          actualCurrency,
          forecastIncluded,
        }),
      })
      toast.success("Monthly actual updated")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Request failed")
    }
  }

  async function copyForecastToInternalActuals(monthIndex: number) {
    if (!effectiveSelectedAreaId || !selectedArea?.subDomain) {
      return
    }

    try {
      setBulkCopyLoading(true)
      const response = (await fetchJson("/api/tracker/bulk-forecast-actuals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "preview",
          year: activeYear,
          budgetAreaId: effectiveSelectedAreaId,
          monthIndex,
        }),
      })) as BulkForecastPreview
      setBulkCopyPreview(response)
      setBulkCopyOverrides(
        Object.fromEntries(
          response.seats.map((seat) => [seat.trackerSeatId, String(seat.amount)])
        )
      )
      setBulkCopyConfirmations(
        Object.fromEntries(
          response.seats
            .filter((seat) => seat.requiresConfirmation)
            .map((seat) => [seat.trackerSeatId, false])
        )
      )
      setBulkCopyDialogOpen(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk update failed")
    } finally {
      setBulkCopyLoading(false)
    }
  }

  function openBulkCopyDialog() {
    setBulkCopyDialogOpen(true)
    void copyForecastToInternalActuals(Number(bulkCopyMonth))
  }

  function handleBulkCopyMonthChange(nextMonthValue: string) {
    setBulkCopyMonth(nextMonthValue)
    if (bulkCopyDialogOpen) {
      void copyForecastToInternalActuals(Number(nextMonthValue))
    }
  }

  function saveCloudActual() {
    if (!effectiveSelectedAreaId) {
      toast.error("Choose a scope before saving cloud actuals.")
      return
    }

    if (!cloudActualAmount.trim()) {
      toast.error("Enter the cloud actual amount first.")
      return
    }

    startCloudSubmitTransition(async () => {
      try {
        const response = await fetchJson("/api/actuals/cloud", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            year: activeYear,
            domain: selectedArea?.domain ?? null,
            subDomain: selectedArea?.subDomain ?? null,
            projectCode: selectedArea?.projectCode ?? null,
            monthIndex: Number(selectedMonth),
            actualAmount: Number(cloudActualAmount),
          }),
        })

        toast.success(
          `Saved ${formatCurrency(response.amount)} cloud actual for ${
            response.subDomain || "selected scope"
          } in ${response.monthLabel}.`
        )
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Cloud actual save failed")
      }
    })
  }

  async function completeBulkForecastCopy() {
    if (!bulkCopyPreview || !effectiveSelectedAreaId) {
      return
    }

    try {
      setBulkCopyLoading(true)
      const response = await fetchJson("/api/tracker/bulk-forecast-actuals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "apply",
          year: activeYear,
          budgetAreaId: effectiveSelectedAreaId,
          monthIndex: bulkCopyPreview.monthIndex,
          overrides: bulkCopyPreview.seats.map((seat) => ({
            trackerSeatId: seat.trackerSeatId,
            amount: Number(bulkCopyOverrides[seat.trackerSeatId] || 0),
          })),
          confirmedTrackerSeatIds: bulkCopyPreview.seats
            .filter((seat) => bulkCopyConfirmations[seat.trackerSeatId])
            .map((seat) => seat.trackerSeatId),
        }),
      })

      toast.success(
        `Converted forecast to actual for ${response.updatedCount} internal seat${
          response.updatedCount === 1 ? "" : "s"
        }.`
      )
      setBulkCopyDialogOpen(false)
      setBulkCopyPreview(null)
      setBulkCopyConfirmations({})
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk update failed")
    } finally {
      setBulkCopyLoading(false)
    }
  }

  const pendingOnLeaveConfirmations =
    bulkCopyPreview?.seats.filter(
      (seat) => seat.requiresConfirmation && !bulkCopyConfirmations[seat.trackerSeatId]
    ) ?? []

  function updateBulkCopyConfirmation(trackerSeatId: string, checked: CheckedState) {
    setBulkCopyConfirmations((current) => ({
      ...current,
      [trackerSeatId]: checked === true,
    }))
  }

  function handleImport() {
    if (!fileInput) {
      toast.error("Choose a CSV file to import.")
      return
    }

    startImportTransition(async () => {
      try {
        const formData = new FormData()
        formData.set("file", fileInput)
        formData.set("year", selectedImportYear)

        const response = await fetch("/api/imports/external-actuals", {
          method: "POST",
          body: formData,
        })
        const body = await response.json()

        if (!response.ok) {
          throw new Error(body.error || "Import failed")
        }

        toast.success(`Imported ${fileInput.name}`)
        refreshExternalView(selectedImportYear)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Import failed")
      }
    })
  }

  function handleManualExternalActualSubmit() {
    if (!manualSpendPlanId.trim() && manualSelectedSeatIds.length === 0) {
      toast.error("Enter a spend plan ID or select at least one matching seat.")
      return
    }

    startExternalSubmitTransition(async () => {
      try {
        await fetchJson("/api/external-actuals/manual", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            year: Number(selectedImportYear),
            monthIndex: Number(selectedExternalMonth),
            spendPlanId: manualSpendPlanId || null,
            trackerSeatIds: manualSelectedSeatIds,
            amount: Number(manualAmount),
            currency: manualCurrency,
            invoiceNumber: manualInvoiceNumber || null,
            supplierName: manualSupplierName || null,
            description: manualDescription || null,
          }),
        })

        toast.success("Saved manual external actual")
        refreshExternalView(selectedImportYear)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Manual external actual failed")
      }
    })
  }

  function toggleManualSelectedSeat(seat: ExternalActualNameSearchResult, checked: CheckedState) {
    setManualSelectedSeats((current) =>
      checked === true
        ? current.some((entry) => entry.trackerSeatId === seat.trackerSeatId)
          ? current
          : [...current, seat]
        : current.filter((entry) => entry.trackerSeatId !== seat.trackerSeatId)
    )
  }

  function selectManualSeatSuggestion(
    seat: ExternalActualNameSearchResult,
    field: ManualSearchField
  ) {
    toggleManualSelectedSeat(seat, true)

    if (field === "seatId") {
      setManualSpendPlanId("")
      setManualSeatIdQuery("")
      setManualNameQuery("")
      setManualSeatSearchResults([])
      setActiveManualSearchField(null)
    }
  }

  async function fetchPastedInvoicePreview(monthIndex?: number) {
    return (await fetchJson("/api/external-actuals/paste/preview", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        year: Number(selectedImportYear),
        ...(monthIndex === undefined ? {} : { monthIndex }),
        content: pastedInvoiceContent,
      }),
    })) as { preview: PastedExternalActualPreview }
  }

  function handlePastedExternalActualSubmit() {
    startExternalSubmitTransition(async () => {
      try {
        const response = await fetchPastedInvoicePreview()
        setPastedInvoicePreview(response.preview)
        setSelectedPastedReviewMonth("")
        setNameSearchQuery(response.preview.suggestedName ?? "")
        setNameSearchResults([])
        setSelectedSeatIdsForSpendPlanMapping([])
        setPastePreviewDialogOpen(true)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Pasted external actual failed")
      }
    })
  }

  function handleSearchExternalSeatsByName() {
    if (!nameSearchQuery.trim()) {
      toast.error("Enter a name to search for matching seats.")
      return
    }

    startExternalSubmitTransition(async () => {
      try {
        const response = (await fetchJson("/api/external-actuals/search-seats", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            year: Number(selectedImportYear),
            query: nameSearchQuery,
          }),
        })) as { seats: ExternalActualNameSearchResult[] }

        setNameSearchResults(response.seats)
        setSelectedSeatIdsForSpendPlanMapping([])
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Seat search failed")
      }
    })
  }

  function toggleSelectedSeatForSpendPlanMapping(trackerSeatId: string, checked: CheckedState) {
    setSelectedSeatIdsForSpendPlanMapping((current) =>
      checked === true
        ? Array.from(new Set([...current, trackerSeatId]))
        : current.filter((id) => id !== trackerSeatId)
    )
  }

  function handleAssignSpendPlanAndReprocess() {
    if (!pastedInvoicePreview) {
      return
    }

    if (selectedSeatIdsForSpendPlanMapping.length === 0) {
      toast.error("Select at least one seat to map the spend plan to.")
      return
    }

    startExternalSubmitTransition(async () => {
      try {
        await fetchJson("/api/external-actuals/assign-spend-plan", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            trackerSeatIds: selectedSeatIdsForSpendPlanMapping,
            spendPlanId: pastedInvoicePreview.spendPlanId,
          }),
        })

        const response = await fetchPastedInvoicePreview()
        setPastedInvoicePreview(response.preview)
        setSelectedPastedReviewMonth("")
        setNameSearchResults([])
        setSelectedSeatIdsForSpendPlanMapping([])
        setNameSearchQuery(response.preview.suggestedName ?? "")
        toast.success("Spend plan mapping updated and invoice reprocessed")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Spend plan mapping failed")
      }
    })
  }

  function handlePastedReviewMonthChange(value: string) {
    setSelectedPastedReviewMonth(value)

    if (!value) {
      setPastedInvoicePreview((current) =>
        current
          ? {
              ...current,
              monthIndex: null,
              monthLabel: null,
              seats: [],
            }
          : current
      )
      return
    }

    startExternalSubmitTransition(async () => {
      try {
        const response = await fetchPastedInvoicePreview(Number(value))
        setPastedInvoicePreview(response.preview)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Month preview failed")
      }
    })
  }

  function confirmPastedExternalActualSubmit() {
    if (pastedInvoicePreview?.status !== "matched" || !selectedPastedReviewMonth) {
      return
    }

    startExternalSubmitTransition(async () => {
      try {
        await fetchJson("/api/external-actuals/paste", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            year: Number(selectedImportYear),
            monthIndex: Number(selectedPastedReviewMonth),
            content: pastedInvoiceContent,
          }),
        })

        toast.success("Saved pasted invoice actual")
        setPastePreviewDialogOpen(false)
        setPastedInvoicePreview(null)
        setPastedInvoiceContent("")
        setSelectedPastedReviewMonth("")
        setNameSearchQuery("")
        setNameSearchResults([])
        setSelectedSeatIdsForSpendPlanMapping([])
        refreshExternalView(selectedImportYear, "paste")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Pasted external actual failed")
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

  function openEditExternalEntry(entry: ExternalActualImportView) {
    setEditingExternalEntry(entry)
    setEditExternalAmount(
      String(entry.originalAmount ?? entry.amount)
    )
    setEditExternalInvoiceNumber(entry.invoiceNumber ?? "")
    setEditExternalSupplierName(entry.supplierName ?? "")
  }

  function saveExternalEntryEdits() {
    if (!editingExternalEntry) {
      return
    }

    startExternalSubmitTransition(async () => {
      try {
        await fetchJson(`/api/external-actual-entries/${editingExternalEntry.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: Number(editExternalAmount),
            invoiceNumber: editExternalInvoiceNumber || null,
            supplierName: editExternalSupplierName || null,
          }),
        })

        toast.success("External actual updated")
        setEditingExternalEntry(null)
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "External actual update failed")
      }
    })
  }

  function deleteExternalEntry() {
    if (!deletingExternalEntry) {
      return
    }

    startExternalSubmitTransition(async () => {
      try {
        await fetchJson(`/api/external-actual-entries/${deletingExternalEntry.id}`, {
          method: "DELETE",
        })

        toast.success("External actual deleted")
        setDeletingExternalEntry(null)
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "External actual delete failed")
      }
    })
  }

  return (
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 py-2">
        <FinancePageIntro
          title="Actuals"
          subtitle="Work separately with internal monthly actuals and imported external actuals."
        />
        <Dialog
          open={bulkCopyDialogOpen}
          onOpenChange={(open) => {
            setBulkCopyDialogOpen(open)
            if (!open) {
              setBulkCopyPreview(null)
              setBulkCopyConfirmations({})
              setBulkCopyOverrides({})
            }
          }}
        >
          <DialogContent className="max-h-[85vh] max-w-6xl overflow-hidden">
            <DialogHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <DialogTitle>Review forecast conversion to actual</DialogTitle>
                  <GuidanceHover
                    content={internalActualsMessage}
                    label="Internal actuals service message"
                  />
                </div>
                {bulkCopyPreview ? (
                  <div className="mr-10 rounded-full border border-border bg-muted px-3 py-1 text-sm font-semibold tracking-[0.02em] text-foreground">
                    {bulkCopyPreview.monthLabel}
                  </div>
                ) : null}
              </div>
              <DialogDescription>
                {bulkCopyPreview
                  ? `Review the internal seats in ${
                      bulkCopyPreview.subDomain || "the selected sub-domain"
                    } before converting forecast to actual.`
                  : "Review the affected seats before converting forecast to actual."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-[220px_1fr] md:items-end">
                <div className="space-y-2">
                  <Label htmlFor="bulk-copy-month">Month</Label>
                  <select
                    id="bulk-copy-month"
                    value={bulkCopyMonth}
                    onChange={(event) => handleBulkCopyMonthChange(event.target.value)}
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                  >
                    {MONTH_NAMES.map((month, index) => (
                      <option key={month} value={index}>
                        {month}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-sm text-muted-foreground">
                  Choose the month to preview and convert. This selector is separate from the manual monthly actuals form.
                </div>
              </div>
            <div className="max-h-[55vh] overflow-y-auto pr-2">
              {bulkCopyPreview?.seats.length ? (
                <div className="space-y-3">
                  {bulkCopyPreview.seats.map((seat) => (
                    <div
                      key={seat.trackerSeatId}
                      className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-[1.4fr_0.8fr_0.8fr]"
                    >
                      <div>
                        <div className="flex items-center gap-2 font-medium">
                          <span>
                            {seat.seatId} · {seat.inSeat || "Unassigned"} · {formatFteAsPercent(seat.allocationPercent)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {seat.team || "No team"} · {bulkCopyPreview.monthLabel}
                        </div>
                        {seat.requiresConfirmation ? (
                          <label className="mt-3 flex items-start gap-2 rounded-md brand-note">
                            <Checkbox
                              checked={bulkCopyConfirmations[seat.trackerSeatId] ?? false}
                              onCheckedChange={(checked) =>
                                updateBulkCopyConfirmation(seat.trackerSeatId, checked)
                              }
                              className="mt-0.5"
                            />
                            <span>
                              Confirm this seat is on leave and should still receive converted
                              internal actuals.
                            </span>
                          </label>
                        ) : null}
                      </div>
                      <div className="text-sm">
                        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          Forecast
                        </div>
                        <div className="mt-1 flex items-center gap-1 font-medium">
                          {Math.abs(seat.baseAmount - seat.amount) > 0.009 ? (
                            <PenLine
                              className="size-3.5 text-rose-700 dark:text-rose-300"
                              aria-hidden="true"
                            />
                          ) : null}
                          <span>{formatCurrency(seat.amount)}</span>
                        </div>
                        {Math.abs(seat.baseAmount - seat.amount) > 0.009 ? (
                          <div className="text-xs text-muted-foreground">
                            Original {formatCurrency(seat.baseAmount)}
                          </div>
                        ) : null}
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="secondary"
                                className="mt-2 inline-flex max-w-full truncate"
                              >
                                <span className="block max-w-24 truncate">
                                  {seat.status || "No status"}
                                </span>
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent
                              sideOffset={6}
                              className="max-w-64 border border-border bg-popover text-foreground"
                            >
                              {seat.status || "No status"}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`bulk-amount-${seat.trackerSeatId}`}>Override Actual</Label>
                        <Input
                          id={`bulk-amount-${seat.trackerSeatId}`}
                          type="number"
                          inputMode="decimal"
                          value={bulkCopyOverrides[seat.trackerSeatId] ?? ""}
                          onChange={(event) =>
                            setBulkCopyOverrides((current) => ({
                              ...current,
                              [seat.trackerSeatId]: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-4 text-sm text-muted-foreground">
                  No active internal seats with forecast for{" "}
                  {bulkCopyPreview?.monthLabel || MONTH_NAMES[Number(bulkCopyMonth)] || "the selected month"}.
                </p>
              )}
            </div>
            </div>
            <DialogFooter>
              {pendingOnLeaveConfirmations.length > 0 ? (
                <div className="mr-auto text-sm text-rose-800 dark:text-rose-200">
                  Confirm {pendingOnLeaveConfirmations.length} on-leave seat
                  {pendingOnLeaveConfirmations.length === 1 ? "" : "s"} before completing.
                </div>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setBulkCopyDialogOpen(false)
                  setBulkCopyPreview(null)
                  setBulkCopyConfirmations({})
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={
                  !bulkCopyPreview?.seats.length ||
                  bulkCopyLoading ||
                  pendingOnLeaveConfirmations.length > 0
                }
                onClick={() => void completeBulkForecastCopy()}
              >
                Complete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={pastePreviewDialogOpen}
          onOpenChange={(open) => {
            setPastePreviewDialogOpen(open)
            if (!open) {
              setPastedInvoicePreview(null)
              setSelectedPastedReviewMonth("")
              setNameSearchQuery("")
              setNameSearchResults([])
              setSelectedSeatIdsForSpendPlanMapping([])
            }
          }}
        >
          <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden">
            <DialogHeader>
              <DialogTitle>Review pasted invoice actual</DialogTitle>
              <DialogDescription>
                Confirm the parsed invoice details and seat split before saving.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-2">
              {pastedInvoicePreview ? (
                <>
                  <div className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-2">
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Spend Plan
                      </div>
                      <div className="mt-1 font-medium">{pastedInvoicePreview.spendPlanId}</div>
                      {pastedInvoicePreview.spendPlanReference ? (
                        <div className="text-xs text-muted-foreground">
                          Reference: {pastedInvoicePreview.spendPlanReference}
                        </div>
                      ) : null}
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Month
                      </div>
                      <div className="mt-1 font-medium">
                        {pastedInvoicePreview.monthLabel || "Choose a month below"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Invoice Number
                      </div>
                      <div className="mt-1 font-medium">
                        {pastedInvoicePreview.invoiceNumber || "Not provided"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Supplier
                      </div>
                      <div className="mt-1 font-medium">
                        {pastedInvoicePreview.supplierName || "Not provided"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Original Amount
                      </div>
                      <div className="mt-1 font-medium">
                        {formatNumber(pastedInvoicePreview.originalAmount)}{" "}
                        {pastedInvoicePreview.originalCurrency}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Total In DKK
                      </div>
                      <div className="mt-1 font-medium">
                        {formatCurrency(pastedInvoicePreview.totalDkk)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        FX rate: {formatNumber(pastedInvoicePreview.rateToDkk)} from{" "}
                        {formatDate(pastedInvoicePreview.rateEffectiveDate)}
                      </div>
                    </div>
                  </div>

                  {pastedInvoicePreview.status === "matched" ? (
                    <div className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-[1fr_auto] md:items-end">
                      <div className="space-y-2">
                        <Label htmlFor="paste-review-month">Posting Month</Label>
                        <select
                          id="paste-review-month"
                          value={selectedPastedReviewMonth}
                          onChange={(event) => handlePastedReviewMonthChange(event.target.value)}
                          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                        >
                          <option value="">Select month</option>
                          {pastedInvoicePreview.monthOptions.map((option) => (
                            <option
                              key={option.monthIndex}
                              value={option.monthIndex}
                              disabled={!option.isEligible}
                            >
                              {option.monthLabel}
                              {!option.isEligible ? " (not eligible)" : ""}
                              {option.hasActual ? " (actual already exists)" : ""}
                              {option.monthIndex === pastedInvoicePreview.suggestedMonthIndex
                                ? " - suggested"
                                : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {pastedInvoicePreview.suggestedMonthIndex !== null
                          ? `Suggested: ${
                              pastedInvoicePreview.monthOptions.find(
                                (option) =>
                                  option.monthIndex === pastedInvoicePreview.suggestedMonthIndex
                              )?.monthLabel ?? "n/a"
                            }`
                          : "No month without actuals was found before the current month."}
                      </div>
                    </div>
                  ) : null}

                  {pastedInvoicePreview.status === "matched" &&
                  pastedInvoicePreview.monthIndex !== null ? (
                    <div className="space-y-3">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Seat</TableHead>
                            <TableHead className="w-16">Alloc</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Days</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pastedInvoicePreview.seats.map((seat) => (
                            <TableRow key={seat.trackerSeatId}>
                              <TableCell className="min-w-[200px]">
                                <div className="font-medium">{seat.seatId}</div>
                                <div className="text-xs text-muted-foreground">
                                  {seat.inSeat || "Unassigned"}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {seat.team || "No team"}
                                </div>
                              </TableCell>
                              <TableCell>{formatNumber(seat.allocation)}</TableCell>
                              <TableCell>
                                <div className="font-medium">{formatCurrency(seat.amountDkk)}</div>
                                {pastedInvoicePreview.originalCurrency !== "DKK" ? (
                                  <div className="text-xs text-muted-foreground">
                                    {formatNumber(seat.originalAmount)}{" "}
                                    {pastedInvoicePreview.originalCurrency}
                                  </div>
                                ) : null}
                              </TableCell>
                              <TableCell>
                                <div className="font-medium">
                                  {seat.daysEquivalent !== null
                                    ? `${formatNumber(seat.daysEquivalent)} days`
                                    : "Unavailable"}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {seat.dailyRate && seat.dailyRate > 0
                                    ? formatCurrency(seat.dailyRate)
                                    : "Daily rate not set"}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
                        Validation uses each seat&apos;s DKK-converted invoice share divided by the
                        mapped seat daily rate to show the implied number of billed days. Other
                        invoice expenses beyond billable hours can skew this check.
                      </div>
                    </div>
                  ) : pastedInvoicePreview.status === "matched" ? (
                    <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                      Select the posting month to review the split and enable save.
                    </div>
                  ) : (
                    <div className="space-y-4 rounded-lg border border-border p-4">
                      <div className="space-y-1">
                        <div className="font-medium">No spend-plan match found yet</div>
                        <div className="text-sm text-muted-foreground">
                          Search by person name, select the matching seat or seats, then map the
                          spend plan and reprocess this invoice.
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                        <div className="space-y-2">
                          <Label htmlFor="paste-name-search">Name Search</Label>
                          <Input
                            id="paste-name-search"
                            value={nameSearchQuery}
                            onChange={(event) => setNameSearchQuery(event.target.value)}
                            placeholder="Search on the FTE name"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isSubmittingExternal}
                          onClick={handleSearchExternalSeatsByName}
                        >
                          {isSubmittingExternal ? "Searching..." : "Search Matches"}
                        </Button>
                      </div>
                      {nameSearchResults.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12">Use</TableHead>
                              <TableHead>Seat</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Current Spend Plan</TableHead>
                              <TableHead>Allocation</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {nameSearchResults.map((seat) => (
                              <TableRow key={seat.trackerSeatId}>
                                <TableCell>
                                  <Checkbox
                                    checked={selectedSeatIdsForSpendPlanMapping.includes(
                                      seat.trackerSeatId
                                    )}
                                    onCheckedChange={(checked) =>
                                      toggleSelectedSeatForSpendPlanMapping(
                                        seat.trackerSeatId,
                                        checked
                                      )
                                    }
                                  />
                                </TableCell>
                                <TableCell>
                                  <div className="font-medium">{seat.seatId}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {seat.inSeat || "Unassigned"} · {seat.team || "No team"}
                                  </div>
                                </TableCell>
                                <TableCell>{seat.status || "Unknown"}</TableCell>
                                <TableCell>{seat.spendPlanId || "Not set"}</TableCell>
                                <TableCell>{formatNumber(seat.allocation)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : nameSearchQuery ? (
                        <div className="text-sm text-muted-foreground">
                          No seats found for the current name search.
                        </div>
                      ) : null}
                    </div>
                  )}
                </>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPastePreviewDialogOpen(false)
                  setPastedInvoicePreview(null)
                  setSelectedPastedReviewMonth("")
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant={pastedInvoicePreview?.status === "matched" ? "default" : "secondary"}
                disabled={
                  !pastedInvoicePreview ||
                  isSubmittingExternal ||
                  (pastedInvoicePreview.status === "matched"
                    ? !selectedPastedReviewMonth || pastedInvoicePreview.monthIndex === null
                    : selectedSeatIdsForSpendPlanMapping.length === 0)
                }
                onClick={
                  pastedInvoicePreview?.status === "matched"
                    ? confirmPastedExternalActualSubmit
                    : handleAssignSpendPlanAndReprocess
                }
              >
                {isSubmittingExternal
                  ? pastedInvoicePreview?.status === "matched"
                    ? "Saving..."
                    : "Applying..."
                  : pastedInvoicePreview?.status === "matched"
                    ? "Confirm And Save"
                    : "Apply Spend Plan And Reprocess"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(editingExternalEntry)}
          onOpenChange={(open) => {
            if (!open) {
              setEditingExternalEntry(null)
            }
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit external actual</DialogTitle>
              <DialogDescription>
                Update the amount, vendor, and invoice reference for this external actual row.
              </DialogDescription>
            </DialogHeader>
            {editingExternalEntry ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-border p-3 text-sm">
                  <div className="font-medium">{editingExternalEntry.seatId}</div>
                  <div className="text-muted-foreground">
                    {editingExternalEntry.monthLabel} · {editingExternalEntry.fileName}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-external-amount">
                    Amount ({editingExternalEntry.originalCurrency || "DKK"})
                  </Label>
                  <Input
                    id="edit-external-amount"
                    type="number"
                    step="0.01"
                    value={editExternalAmount}
                    onChange={(event) => setEditExternalAmount(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-external-supplier">Vendor</Label>
                  <Input
                    id="edit-external-supplier"
                    value={editExternalSupplierName}
                    onChange={(event) => setEditExternalSupplierName(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-external-invoice">Invoice ID</Label>
                  <Input
                    id="edit-external-invoice"
                    value={editExternalInvoiceNumber}
                    onChange={(event) => setEditExternalInvoiceNumber(event.target.value)}
                  />
                </div>
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingExternalEntry(null)}>
                Cancel
              </Button>
              <Button type="button" disabled={isSubmittingExternal} onClick={saveExternalEntryEdits}>
                {isSubmittingExternal ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(deletingExternalEntry)}
          onOpenChange={(open) => {
            if (!open) {
              setDeletingExternalEntry(null)
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Delete external actual</DialogTitle>
              <DialogDescription>
                This removes the selected external actual row and updates the linked seat month. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            {deletingExternalEntry ? (
              <div className="rounded-lg border border-border p-3 text-sm">
                <div className="font-medium">
                  {deletingExternalEntry.supplierName || "No vendor"}
                </div>
                <div className="text-muted-foreground">
                  {deletingExternalEntry.invoiceNumber || "No invoice ID"} ·{" "}
                  {deletingExternalEntry.seatId} · {deletingExternalEntry.monthLabel}
                </div>
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDeletingExternalEntry(null)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" disabled={isSubmittingExternal} onClick={deleteExternalEntry}>
                {isSubmittingExternal ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <section className="space-y-4">
          <Card className="brand-card">
            <CardHeader>
              <CardTitle>Scope</CardTitle>
              <CardDescription>
                Choose the page year and internal scope before working with actuals.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3 xl:grid-cols-[180px_1fr_1fr_220px]">
              <div className="space-y-2">
                <Label htmlFor="actuals-year">Year</Label>
                <select
                  id="actuals-year"
                  value={selectedYear}
                  disabled={isPending}
                  onChange={(event) => {
                    setSelectedYear(event.target.value)
                    updateParams({ year: event.target.value })
                  }}
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
                <Label htmlFor="actuals-domain">Domain</Label>
                <select
                  id="actuals-domain"
                  value={selectedDomain}
                  disabled={isPending || domainOptions.length === 0}
                  onChange={(event) => {
                    const nextDomain = event.target.value
                    const nextScope = getFirstScopeForDomain(nextDomain)

                    updateParams({
                      domain: nextDomain || null,
                      subDomain: nextScope.subDomain,
                      projectCode: nextScope.showProjectCodeSelector
                        ? nextScope.projectCode
                        : null,
                    })
                  }}
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                >
                  {domainOptions.map((domain) => (
                    <option key={domain} value={domain}>
                      {domain}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="actuals-subdomain">Sub-domain</Label>
                <select
                  id="actuals-subdomain"
                  value={selectedSubDomain}
                  disabled={isPending || subDomainOptions.length === 0}
                  onChange={(event) => {
                    const nextSubDomain = event.target.value
                    const nextProject = getFirstProjectCodeForSubDomain(
                      selectedDomain,
                      nextSubDomain
                    )

                    updateParams({
                      domain: selectedDomain || null,
                      subDomain: nextSubDomain || null,
                      projectCode: nextProject.showProjectCodeSelector
                        ? nextProject.projectCode
                        : null,
                    })
                  }}
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                >
                  {subDomainOptions.map((subDomain) => (
                    <option key={subDomain} value={subDomain}>
                      {subDomain}
                    </option>
                  ))}
                </select>
              </div>
              {showProjectCodeSelector ? (
                <div className="space-y-2">
                  <Label htmlFor="actuals-project-code">Project Code</Label>
                  <select
                    id="actuals-project-code"
                    value={selectedProjectCode}
                    disabled={isPending || projectCodeOptions.length === 0}
                    onChange={(event) =>
                      updateParams({
                        domain: selectedDomain || null,
                        subDomain: selectedSubDomain || null,
                        projectCode: event.target.value || null,
                      })
                    }
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                  >
                    {projectCodeOptions.map((projectCode) => (
                      <option key={projectCode} value={projectCode}>
                        {projectCode}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Manual month entries and forecast copy
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Work in the selected scope, then update seat actuals or copy monthly forecast into internal actuals.
            </p>
          </div>

          <section className="grid gap-4 md:grid-cols-4">
            <Card className="brand-card">
              <CardHeader className="gap-1">
                <CardDescription>Selected Scope</CardDescription>
                <CardTitle>{selectedArea?.subDomain || selectedArea?.domain || "Unmapped"}</CardTitle>
                <div className="text-sm text-muted-foreground">{selectedScopeDetail}</div>
              </CardHeader>
            </Card>
            <Card className="brand-card">
              <CardHeader className="gap-1">
                <CardDescription>FTE In Scope</CardDescription>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      PERM
                    </div>
                    <CardTitle>
                      <Link href={permRosterHref} className="transition-colors hover:text-primary">
                        {formatNumber(permFteInScope)}
                      </Link>
                    </CardTitle>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      EXT
                    </div>
                    <CardTitle>
                      <Link href={extRosterHref} className="transition-colors hover:text-primary">
                        {formatNumber(extFteInScope)}
                      </Link>
                    </CardTitle>
                  </div>
                </div>
              </CardHeader>
            </Card>
            <Card className="brand-card">
              <CardHeader className="gap-1">
                <CardDescription>Spent To Date</CardDescription>
                <CardTitle>{formatCurrency(selectedArea?.spentToDate ?? 0)}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="brand-card">
              <CardHeader className="gap-1">
                <CardDescription>Forecast Remaining</CardDescription>
                <CardTitle>{formatCurrency(selectedArea?.totalForecast ?? 0)}</CardTitle>
              </CardHeader>
            </Card>
          </section>
        </section>

        <Tabs
          value={activeView}
          onValueChange={(value) =>
            updateParams({ view: mapActualsViewToParam(value) })
          }
          className="gap-4"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Actuals Workspace</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Switch between internal and external actuals without leaving the page.
              </p>
            </div>
            <TabsList
              variant="line"
              className="w-full max-w-max flex-wrap justify-start gap-2 bg-white/80"
            >
              <TabsTrigger value="internal">Internals</TabsTrigger>
              <TabsTrigger value="external">Externals</TabsTrigger>
              <TabsTrigger value="cloud">Cloud</TabsTrigger>
              <TabsTrigger value="licenses">Licenses</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="internal" className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                Internal Actuals
              </p>
              <h3 className="mt-1 text-2xl font-semibold tracking-tight">Internal workflow</h3>
            </div>

            <Card className="brand-card">
              <CardHeader className="flex-row items-end justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle>Internal Actuals Controls</CardTitle>
                    <GuidanceHover
                      content={internalActualsMessage}
                      label="Internal actuals service message"
                    />
                  </div>
                  <CardDescription>
                    The internal workflow below follows the selected top-level scope.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm">
                  <div className="font-medium">Convert Forecast to Actual</div>
                  <div className="mt-1 text-muted-foreground">
                    Convert the selected month&apos;s forecast into actuals for all internal seats in{" "}
                    {selectedScopeDetail}.
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3"
                    disabled={
                      !effectiveSelectedAreaId || !selectedArea?.subDomain || bulkCopyLoading
                    }
                    onClick={openBulkCopyDialog}
                  >
                    Convert Forecast to Actual
                  </Button>
                </div>
              </CardContent>
            </Card>

            <section className="grid gap-6 xl:grid-cols-[3fr_2fr]">
            <Card className="brand-card">
              <CardHeader>
                <CardTitle>Internal Seats</CardTitle>
                <CardDescription>
                  Seats currently mapped to {selectedScopeDetail}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Seat</TableHead>
                      <TableHead>Resource</TableHead>
                      <TableHead>Spent</TableHead>
                      <TableHead>Forecast</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {seats.map((seat) => (
                      <TableRow
                        key={seat.id}
                        className={seat.id === selectedSeatId ? "brand-selected-row" : "cursor-pointer"}
                        onClick={() => setSelectedSeatId(seat.id)}
                      >
                        <TableCell>
                          <div className="font-medium">{seat.seatId}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            <div>{seat.team || "No team"}</div>
                            <div>{seat.subDomain || "Unmapped"}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>{seat.inSeat || "Unassigned"}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            <div>{seat.band || "No band"}</div>
                            <div>{firstWord(seat.status) || "No status"}</div>
                          </div>
                        </TableCell>
                        <TableCell>{formatCurrency(seat.totalSpent)}</TableCell>
                        <TableCell>{formatCurrency(seat.totalForecast)}</TableCell>
                      </TableRow>
                    ))}
                    {seats.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                          No internal seats are available for the selected scope and year.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="brand-card">
                <CardHeader>
                  <CardTitle>Seat Monthly Detail</CardTitle>
                  <CardDescription>
                    Review forecast and actual values before updating a month.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {selectedSeat ? (
                    <div className="space-y-4">
                      <div className="rounded-xl bg-muted/40 p-3 text-sm">
                        <div className="font-medium">
                          {selectedSeat.seatId} · {selectedSeat.inSeat || "Unassigned"}
                        </div>
                        <div className="mt-1 text-muted-foreground">
                          {selectedSeat.team || "No team"} · {selectedSeat.band || "No band"}
                        </div>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Month</TableHead>
                            <TableHead>Forecast</TableHead>
                            <TableHead>Actual</TableHead>
                            <TableHead>Raw</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {MONTH_NAMES.map((month, monthIndex) => {
                            const monthEntry = selectedSeat.months.find(
                              (entry) => entry.monthIndex === monthIndex
                            )

                            return (
                              <TableRow key={month}>
                                <TableCell>{month}</TableCell>
                                <TableCell>
                                  {formatCurrency(selectedSeat.monthlyForecast[monthIndex] ?? 0)}
                                </TableCell>
                                <TableCell>
                                  {formatCurrency(monthEntry?.actualAmountDkk ?? 0)}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {monthEntry?.actualAmountRaw ?? 0}{" "}
                                  {monthEntry?.actualCurrency || "DKK"}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No seat selected.</p>
                  )}
                </CardContent>
              </Card>

              <Card className="brand-card">
                <CardHeader>
                  <CardTitle>Monthly Actuals</CardTitle>
                  <CardDescription>
                    Enter manual internal actual spend for the selected month.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="seat-select">Seat</Label>
                  <select
                    id="seat-select"
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                    value={selectedSeatId}
                    onChange={(event) => setSelectedSeatId(event.target.value)}
                  >
                    {seats.map((seat) => (
                      <option key={seat.id} value={seat.id}>
                        {seat.seatId} · {seat.inSeat || "Unassigned"}
                      </option>
                    ))}
                  </select>
                </div>
                {internalActualsMessage ? (
                  <div className="rounded-xl brand-note">
                    <div className="flex items-center gap-2 font-medium">
                      <span>Internal actuals service message</span>
                      <GuidanceHover
                        content={internalActualsMessage}
                        label="Internal actuals service message"
                      />
                    </div>
                    <div className="mt-1 text-rose-900/80 dark:text-rose-100/80">
                      Hover the info icon to review the instructions before entering or copying
                      actuals.
                    </div>
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="month-select">Month</Label>
                    <select
                      id="month-select"
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                      value={selectedMonth}
                      onChange={(event) => setSelectedMonth(event.target.value)}
                    >
                      {MONTH_NAMES.map((month, index) => (
                        <option key={month} value={index}>
                          {month}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="actual-amount">Actual Spend</Label>
                    <Input
                      id="actual-amount"
                      type="number"
                      inputMode="decimal"
                      value={actualAmount}
                      onChange={(event) => setActualAmount(event.target.value)}
                      placeholder="25000"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="actual-currency">Input Currency</Label>
                  <select
                    id="actual-currency"
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                    value={actualCurrency}
                    onChange={(event) =>
                      setActualCurrency(event.target.value as "DKK" | "EUR" | "USD")
                    }
                  >
                    {SUPPORTED_CURRENCIES.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={forecastIncluded}
                    onChange={(event) => setForecastIncluded(event.target.checked)}
                  />
                  Keep forecast for this month
                </label>
                <Button
                  type="button"
                  disabled={!selectedSeatId}
                  onClick={() => void saveSeatMonth()}
                >
                  Save Month
                </Button>
                </CardContent>
              </Card>
            </div>
            </section>
          </TabsContent>

          <TabsContent value="cloud" className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                Cloud Actuals
              </p>
              <h3 className="mt-1 text-2xl font-semibold tracking-tight">
                Enter monthly cloud actual
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter the cloud actual amount directly for the selected sub-domain and month.
              </p>
            </div>

            <section className="grid gap-4 md:grid-cols-3">
              <Card className="brand-card">
                <CardHeader className="gap-1">
                  <CardDescription>Forecasted Value</CardDescription>
                  <CardTitle>{formatCurrency(selectedCloudForecast)}</CardTitle>
                  {cloudDeviation !== null ? (
                    <div
                      className={`text-sm ${
                        cloudDeviation > 0
                          ? "text-emerald-700"
                          : cloudDeviation < 0
                            ? "text-rose-700"
                            : "text-muted-foreground"
                      }`}
                    >
                      Deviation: {cloudDeviation > 0 ? "+" : ""}
                      {formatCurrency(cloudDeviation)}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      Forecast for {MONTH_NAMES[selectedMonthIndex]}.
                    </div>
                  )}
                </CardHeader>
              </Card>
              <Card className="brand-card">
                <CardHeader className="gap-1">
                  <CardDescription>Target Month</CardDescription>
                  <CardTitle>{MONTH_NAMES[selectedMonthIndex]}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="brand-card">
                <CardHeader className="gap-1">
                  <CardDescription>Cloud Spent To Date</CardDescription>
                  <CardTitle>{formatCurrency(selectedArea?.cloudCostSpentToDate ?? 0)}</CardTitle>
                  {cloudSpentToDateDeviation !== null ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className={`w-fit text-left text-sm ${
                              cloudSpentToDateDeviation > 0
                                ? "text-emerald-700"
                                : cloudSpentToDateDeviation < 0
                                  ? "text-rose-700"
                                  : "text-muted-foreground"
                            }`}
                          >
                            Deviation: {cloudSpentToDateDeviation > 0 ? "+" : ""}
                            {formatCurrency(cloudSpentToDateDeviation)}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" align="end" className="w-[420px] p-0">
                          <div className="border-b border-border px-4 py-3">
                            <div className="font-medium">Months Included In Spent To Date Deviation</div>
                            <div className="text-xs text-muted-foreground">
                              Forecast minus actual for months with cloud actuals.
                            </div>
                          </div>
                          <div className="max-h-72 overflow-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Month</TableHead>
                                  <TableHead className="text-right">Actual</TableHead>
                                  <TableHead className="text-right">Forecast</TableHead>
                                  <TableHead className="text-right">Deviation</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {cloudActualMonthsWithValues.map((month) => (
                                  <TableRow key={month.monthIndex}>
                                    <TableCell>{month.monthLabel}</TableCell>
                                    <TableCell className="text-right">
                                      {formatCurrency(month.actual)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {formatCurrency(month.forecast)}
                                    </TableCell>
                                    <TableCell
                                      className={`text-right ${
                                        month.deviation > 0
                                          ? "text-emerald-700"
                                          : month.deviation < 0
                                            ? "text-rose-700"
                                            : "text-muted-foreground"
                                      }`}
                                    >
                                      {month.deviation > 0 ? "+" : ""}
                                      {formatCurrency(month.deviation)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      Deviation appears once cloud actuals exist.
                    </div>
                  )}
                </CardHeader>
              </Card>
            </section>

            <Card className="brand-card">
              <CardHeader>
                <CardTitle>Cloud Actual Entry</CardTitle>
                <CardDescription>
                  Save a single DKK amount into the selected scope and month.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cloud-month">Month</Label>
                    <select
                      id="cloud-month"
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                      value={selectedMonth}
                      onChange={(event) => handleCloudMonthChange(event.target.value)}
                    >
                      {MONTH_NAMES.map((month, index) => (
                        <option key={month} value={index}>
                          {month}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cloud-actual-amount">Cloud Actual Amount</Label>
                    <Input
                      id="cloud-actual-amount"
                      type="number"
                      inputMode="decimal"
                      value={cloudActualAmount}
                      onChange={(event) => setCloudActualAmount(event.target.value)}
                      placeholder="512340.50"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    disabled={!effectiveSelectedAreaId || isSubmittingCloud}
                    onClick={saveCloudActual}
                  >
                    {isSubmittingCloud ? "Saving..." : "Save Cloud Actual"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="licenses" className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                License Actuals
              </p>
              <h3 className="mt-1 text-2xl font-semibold tracking-tight">
                License workflow placeholder
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                This tab is ready for the later license ingestion flow.
              </p>
            </div>

            <Card className="brand-card">
              <CardHeader>
                <CardTitle>Licenses</CardTitle>
                <CardDescription>
                  License support is not wired yet; this tab is only reserving the page structure.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                  No license import workflow has been implemented yet.
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="external" className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                External Actuals
              </p>
              <h3 className="mt-1 text-2xl font-semibold tracking-tight">
                Imported external spend
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Import CSV data, review batches, and filter imported external seat-month rows.
              </p>
            </div>

            <section className="grid gap-4 md:grid-cols-3">
            <Card className="brand-card">
              <CardHeader className="gap-1">
                <CardDescription>Imported Entries</CardDescription>
                <CardTitle>{formatNumber(totals.entryCount)}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="brand-card">
              <CardHeader className="gap-1">
                <CardDescription>Imported Amount</CardDescription>
                <CardTitle>{formatCurrency(totals.amount)}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="brand-card">
              <CardHeader className="gap-1">
                <CardDescription>Matched Seats</CardDescription>
                <CardTitle>{formatNumber(totals.matchedCount)}</CardTitle>
              </CardHeader>
            </Card>
            </section>

            <Card className="brand-card">
            <CardHeader>
              <CardTitle>Add External Actuals</CardTitle>
              <CardDescription>
                Choose one of the 3 supported ingestion methods and unfold the detail you need.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={externalEntryMode === "csv" ? "default" : "outline"}
                  onClick={() => setExternalEntryMode("csv")}
                >
                  CSV Import
                </Button>
                <Button
                  type="button"
                  variant={externalEntryMode === "manual" ? "default" : "outline"}
                  onClick={() => setExternalEntryMode("manual")}
                >
                  Manual Form
                </Button>
                <Button
                  type="button"
                  variant={externalEntryMode === "paste" ? "default" : "outline"}
                  onClick={() => setExternalEntryMode("paste")}
                >
                  Paste Invoice
                </Button>
              </div>

              {externalEntryMode === "csv" ? (
                <div className="grid gap-4 rounded-xl border border-border/70 p-4 md:grid-cols-[140px_1fr_auto]">
                  <div className="space-y-2">
                    <Label htmlFor="external-year">Year</Label>
                    <select
                      id="external-year"
                      value={selectedImportYear}
                      onChange={(event) => setSelectedImportYear(event.target.value)}
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
                    <Input
                      id="external-file"
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(event) => setFileInput(event.target.files?.[0] ?? null)}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button type="button" onClick={handleImport} disabled={isImporting}>
                      {isImporting ? "Importing..." : "Import"}
                    </Button>
                  </div>
                </div>
              ) : null}

              {externalEntryMode === "manual" ? (
                <div className="grid gap-4 rounded-xl border border-border/70 p-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="manual-external-year">Year</Label>
                    <select
                      id="manual-external-year"
                      value={selectedImportYear}
                      onChange={(event) => setSelectedImportYear(event.target.value)}
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
                    <Label htmlFor="manual-external-month">Month</Label>
                    <select
                      id="manual-external-month"
                      value={selectedExternalMonth}
                      onChange={(event) => setSelectedExternalMonth(event.target.value)}
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                    >
                      {MONTH_NAMES.map((month, index) => (
                        <option key={month} value={index}>
                          {month}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Seat Match Search</Label>
                    <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
                      <div className="relative">
                        <Input
                          id="manual-spend-plan"
                          value={manualSpendPlanId}
                          onFocus={() => setActiveManualSearchField("spendPlan")}
                          onBlur={() =>
                            window.setTimeout(() => {
                              setActiveManualSearchField((current) =>
                                current === "spendPlan" ? null : current
                              )
                            }, 120)
                          }
                          onChange={(event) => setManualSpendPlanId(event.target.value)}
                          placeholder="Spend Plan ID"
                        />
                        {activeManualSearchField === "spendPlan" && manualSearchDropdownOpen ? (
                          <div className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
                            {manualSeatSearchLoading ? (
                              <div className="px-3 py-2 text-sm text-muted-foreground">
                                Searching seats...
                              </div>
                            ) : (
                              manualSeatSearchResults.map((seat) => (
                                <button
                                  key={seat.trackerSeatId}
                                  type="button"
                                  className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-muted"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => selectManualSeatSuggestion(seat, "spendPlan")}
                                >
                                  <div>
                                    <div className="font-medium">
                                      {seat.spendPlanId || "No spend plan"}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {seat.inSeat || "Unassigned"} · {seat.seatId}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    {manualSelectedSeatIds.includes(seat.trackerSeatId) ? (
                                      <Check className="size-3.5 text-foreground" />
                                    ) : null}
                                    {formatFteAsPercent(seat.allocation)}
                                  </div>
                                </button>
                              ))
                            )}
                          </div>
                        ) : null}
                      </div>
                      <div className="relative">
                        <Input
                          id="manual-seat-id"
                          value={manualSeatIdQuery}
                          onFocus={() => setActiveManualSearchField("seatId")}
                          onBlur={() =>
                            window.setTimeout(() => {
                              setActiveManualSearchField((current) =>
                                current === "seatId" ? null : current
                              )
                            }, 120)
                          }
                          onChange={(event) => setManualSeatIdQuery(event.target.value)}
                          placeholder="Seat ID"
                        />
                        {activeManualSearchField === "seatId" && manualSearchDropdownOpen ? (
                          <div className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
                            {manualSeatSearchLoading ? (
                              <div className="px-3 py-2 text-sm text-muted-foreground">
                                Searching seats...
                              </div>
                            ) : (
                              manualSeatSearchResults.map((seat) => (
                                <button
                                  key={seat.trackerSeatId}
                                  type="button"
                                  className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-muted"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => selectManualSeatSuggestion(seat, "seatId")}
                                >
                                  <div>
                                    <div className="font-medium">{seat.seatId}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {seat.inSeat || "Unassigned"} · {seat.spendPlanId || "No spend plan"}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    {manualSelectedSeatIds.includes(seat.trackerSeatId) ? (
                                      <Check className="size-3.5 text-foreground" />
                                    ) : null}
                                    {formatFteAsPercent(seat.allocation)}
                                  </div>
                                </button>
                              ))
                            )}
                          </div>
                        ) : null}
                      </div>
                      <div className="relative">
                        <Input
                          id="manual-seat-name"
                          value={manualNameQuery}
                          onFocus={() => setActiveManualSearchField("name")}
                          onBlur={() =>
                            window.setTimeout(() => {
                              setActiveManualSearchField((current) =>
                                current === "name" ? null : current
                              )
                            }, 120)
                          }
                          onChange={(event) => setManualNameQuery(event.target.value)}
                          placeholder="Name"
                        />
                        {activeManualSearchField === "name" && manualSearchDropdownOpen ? (
                          <div className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
                            {manualSeatSearchLoading ? (
                              <div className="px-3 py-2 text-sm text-muted-foreground">
                                Searching seats...
                              </div>
                            ) : (
                              manualSeatSearchResults.map((seat) => (
                                <button
                                  key={seat.trackerSeatId}
                                  type="button"
                                  className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-muted"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => selectManualSeatSuggestion(seat, "name")}
                                >
                                  <div>
                                    <div className="font-medium">
                                      {seat.inSeat || "Unassigned"}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {seat.spendPlanId || "No spend plan"} · {seat.seatId}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    {manualSelectedSeatIds.includes(seat.trackerSeatId) ? (
                                      <Check className="size-3.5 text-foreground" />
                                    ) : null}
                                    {formatFteAsPercent(seat.allocation)}
                                  </div>
                                </button>
                              ))
                            )}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex items-center text-xs text-muted-foreground">
                        Select from any field
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Type in any field to search seats. Selecting a suggestion adds that seat to
                      the invoice split.
                    </p>
                  </div>
                  {manualSelectedSeats.length > 0 ? (
                    <div className="space-y-3 md:col-span-2">
                      <div className="rounded-lg border border-border/70 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-medium">Chosen Seats</div>
                            <div className="text-xs text-muted-foreground">
                              Selected seats will receive allocation-weighted shares of the entered
                              amount.
                            </div>
                          </div>
                          <Badge variant="secondary">{manualSelectedSeats.length} selected</Badge>
                        </div>
                        <div className="mt-3 space-y-2">
                          {manualSelectedSeats.map((seat, index) => (
                            <div
                              key={seat.trackerSeatId}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
                            >
                              <div>
                                <div className="font-medium">
                                  {seat.seatId} · {seat.inSeat || "Unassigned"}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {seat.team || "No team"} · {seat.spendPlanId || "No spend plan"} · Alloc {formatFteAsPercent(seat.allocation)}
                                  {manualAmount.trim() ? (
                                    <>
                                      {" "}
                                      · Share {formatNumber(manualSeatAllocationShares[index] ?? 0)}{" "}
                                      {manualCurrency}
                                    </>
                                  ) : null}
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleManualSelectedSeat(seat, false)}
                              >
                                Remove
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <Label htmlFor="manual-amount">Amount</Label>
                    <Input
                      id="manual-amount"
                      type="number"
                      inputMode="decimal"
                      value={manualAmount}
                      onChange={(event) => setManualAmount(event.target.value)}
                      placeholder="128480"
                    />
                    {manualCurrency !== "DKK" && manualDkkPreview ? (
                      <div className="text-xs text-muted-foreground">
                        {formatCurrency(manualDkkPreview.totalDkk)} DKK at {formatNumber(manualDkkPreview.rateToDkk)}
                      </div>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="manual-currency">Currency</Label>
                    <select
                      id="manual-currency"
                      value={manualCurrency}
                      onChange={(event) =>
                        setManualCurrency(event.target.value as "DKK" | "EUR" | "USD")
                      }
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                    >
                      {SUPPORTED_CURRENCIES.map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="manual-supplier-name">Supplier Name</Label>
                    <Popover
                      open={manualSupplierTypeaheadOpen}
                      onOpenChange={setManualSupplierTypeaheadOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          id="manual-supplier-name"
                          variant="outline"
                          role="combobox"
                          aria-expanded={manualSupplierTypeaheadOpen}
                          className="w-full justify-between font-normal"
                        >
                          <span
                            className={cn(
                              "truncate text-left",
                              !manualSupplierName && "text-muted-foreground"
                            )}
                          >
                            {manualSupplierName || "Select supplier"}
                          </span>
                          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-(--radix-popover-trigger-width) p-0"
                        align="start"
                      >
                        <Command>
                          <CommandInput placeholder="Search supplier..." />
                          <CommandList>
                            <CommandEmpty>No supplier found.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value="__empty__"
                                onSelect={() => {
                                  setManualSupplierName("")
                                  setManualSupplierTypeaheadOpen(false)
                                }}
                              >
                                <span className="text-muted-foreground">Select supplier</span>
                                <Check
                                  className={cn(
                                    "ml-auto size-4",
                                    !manualSupplierName ? "opacity-100" : "opacity-0"
                                  )}
                                />
                              </CommandItem>
                              {vendorOptions.map((vendor) => (
                                <CommandItem
                                  key={vendor}
                                  value={vendor}
                                  onSelect={() => {
                                    setManualSupplierName(vendor)
                                    setManualSupplierTypeaheadOpen(false)
                                  }}
                                >
                                  <span className="truncate">{vendor}</span>
                                  <Check
                                    className={cn(
                                      "ml-auto size-4",
                                      manualSupplierName === vendor
                                        ? "opacity-100"
                                        : "opacity-0"
                                    )}
                                  />
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="manual-invoice-number">Invoice Number</Label>
                    <Input
                      id="manual-invoice-number"
                      value={manualInvoiceNumber}
                      onChange={(event) => setManualInvoiceNumber(event.target.value)}
                      placeholder="DENI226002586"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="manual-description">Description</Label>
                    <Textarea
                      id="manual-description"
                      value={manualDescription}
                      onChange={(event) => setManualDescription(event.target.value)}
                      placeholder="Optional note for the external actual"
                    />
                  </div>
                  <div className="md:col-span-2 flex justify-end">
                    <Button
                      type="button"
                      disabled={isSubmittingExternal}
                      onClick={handleManualExternalActualSubmit}
                    >
                      {isSubmittingExternal ? "Saving..." : "Save Manual External Actual"}
                    </Button>
                  </div>
                </div>
              ) : null}

              {externalEntryMode === "paste" ? (
                <div className="grid gap-4 rounded-xl border border-border/70 p-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="paste-external-year">Year</Label>
                    <select
                      id="paste-external-year"
                      value={selectedImportYear}
                      onChange={(event) => setSelectedImportYear(event.target.value)}
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
                    <Label htmlFor="paste-external-month-note">Month</Label>
                    <div
                      id="paste-external-month-note"
                      className="flex min-h-9 items-center rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground"
                    >
                      Choose the month in the review step.
                    </div>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="paste-external-content">Invoice Text</Label>
                    <Textarea
                      id="paste-external-content"
                      value={pastedInvoiceContent}
                      onChange={(event) => setPastedInvoiceContent(event.target.value)}
                      placeholder="Paste the invoice email or invoice text here"
                      className="min-h-52"
                    />
                  </div>
                  <div className="md:col-span-2 flex justify-end">
                    <Button
                      type="button"
                      disabled={isSubmittingExternal}
                      onClick={handlePastedExternalActualSubmit}
                    >
                      {isSubmittingExternal ? "Saving..." : "Parse And Save Invoice Actual"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
            </Card>

            <Card className="brand-card">
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

            <Card className="brand-card">
            <CardHeader>
              <CardTitle>Filters</CardTitle>
              <CardDescription>
                Filter imported external actual rows by user, file name, and import time.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form method="GET" className="grid gap-4 lg:grid-cols-[0.8fr_1fr_1fr_1fr_1fr_1fr_1fr_auto]">
                <input type="hidden" name="view" value="external" />
                <input type="hidden" name="domain" value={selectedDomain} />
                <input type="hidden" name="subDomain" value={selectedSubDomain} />
                <input
                  type="hidden"
                  name="projectCode"
                  value={showProjectCodeSelector ? selectedProjectCode : ""}
                />
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
                    <Link
                      href={`/actuals?${new URLSearchParams(
                        Object.fromEntries(
                          [
                            ["year", String(activeYear)],
                            ["view", "external"],
                            selectedDomain ? ["domain", selectedDomain] : null,
                            selectedSubDomain ? ["subDomain", selectedSubDomain] : null,
                            showProjectCodeSelector && selectedProjectCode
                              ? ["projectCode", selectedProjectCode]
                              : null,
                          ].filter(
                            (
                              entry
                            ): entry is [string, string] => Boolean(entry)
                          )
                        )
                      ).toString()}`}
                    >
                      Reset
                    </Link>
                  </Button>
                </div>
              </form>
            </CardContent>
            </Card>

            <Card className="brand-card">
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
                    <TableHead>Seat</TableHead>
                    <TableHead>Month</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{formatDateTime(entry.importedAt)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{entry.seatId}</div>
                        <div className="text-xs text-muted-foreground">
                          {entry.inSeat || "No in-seat"} · {entry.team || "No team"}
                        </div>
                      </TableCell>
                      <TableCell>{entry.monthLabel}</TableCell>
                      <TableCell>{formatCurrency(entry.amount)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{entry.supplierName || "No vendor"}</div>
                        <div className="text-xs text-muted-foreground">
                          {entry.invoiceNumber || "No invoice ID"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {entry.matchedTrackerSeatId ? "Matched" : "No tracker seat match"}
                      </TableCell>
                      <TableCell className="text-right">
                        {entry.importedByEmail?.toLowerCase() === userEmail.toLowerCase() ? (
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openEditExternalEntry(entry)}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setDeletingExternalEntry(entry)}
                            >
                              Delete
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Only creator can edit</span>
                        )}
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
          </TabsContent>
        </Tabs>
      </main>
  )
}
