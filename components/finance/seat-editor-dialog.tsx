"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
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
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatCurrency } from "@/lib/finance/format"
import type {
  DepartmentMappingView,
  FundingAvailabilityPreviewView,
  PeopleRosterView,
  SeatReferenceValueView,
} from "@/lib/finance/types"
import type { AppRole } from "@/lib/roles"
import { cn } from "@/lib/utils"

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

type SeatEditorDialogProps = {
  activeYear: number
  open: boolean
  onOpenChange: (open: boolean) => void
  seat: PeopleRosterView | null
  budgetAreas: BudgetAreaOption[]
  departmentMappings: DepartmentMappingView[]
  seatReferenceValues: SeatReferenceValueView[]
  statusOptions: string[]
  userRole: AppRole
}

type FormState = {
  domain: string
  subDomain: string
  budgetAreaId: string
  projectCode: string
  funding: string
  inSeat: string
  team: string
  resourceType: string
  description: string
  band: string
  vendor: string
  location: string
  manager: string
  dailyRate: string
  status: string
  allocation: string
  startDate: string
  endDate: string
  spendPlanId: string
  ritm: string
  sow: string
  notes: string
}

const EMPTY_FORM: FormState = {
  domain: "",
  subDomain: "",
  budgetAreaId: "",
  projectCode: "",
  funding: "",
  inSeat: "",
  team: "",
  resourceType: "",
  description: "",
  band: "",
  vendor: "",
  location: "",
  manager: "",
  dailyRate: "",
  status: "",
  allocation: "",
  startDate: "",
  endDate: "",
  spendPlanId: "",
  ritm: "",
  sow: "",
  notes: "",
}

type TypeaheadOption = {
  value: string
  label: string
}

type TeamOption = {
  value: string
  team: string
  detail: string
  projectCode: string
  budgetAreaId: string
}

async function fetchJson(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init)
  const body = await response.json()

  if (!response.ok) {
    throw new Error(body.error || "Request failed")
  }

  return body
}

function formatDateInput(value: Date | string | null | undefined) {
  if (!value) {
    return ""
  }

  return new Date(value).toISOString().slice(0, 10)
}

function buildFormState(seat: PeopleRosterView | null, budgetAreas: BudgetAreaOption[]) {
  if (!seat) {
    return EMPTY_FORM
  }

  const matchingArea =
    budgetAreas.find((area) => area.id === seat.overrideBudgetAreaId) ??
    budgetAreas.find(
      (area) =>
        area.projectCode === seat.projectCode &&
        area.domain === seat.domain &&
        area.subDomain === (seat.mappedSubDomain || seat.subDomain)
    ) ??
    null

  return {
    domain: seat.domain || "",
    subDomain: seat.mappedSubDomain || seat.subDomain || "",
    budgetAreaId: matchingArea?.id || "",
    projectCode: seat.projectCode || matchingArea?.projectCode || "",
    funding: seat.funding || matchingArea?.funding || "",
    inSeat: seat.name || "",
    team: seat.team || "",
    resourceType: seat.resourceType || "",
    description: seat.role || "",
    band: seat.band || "",
    vendor: seat.vendor || "",
    location: seat.location || "",
    manager: seat.manager || "",
    dailyRate: seat.dailyRate ? String(seat.dailyRate) : "",
    status: seat.effectiveStatus || seat.status || "",
    allocation: seat.fte !== null && seat.fte !== undefined ? String(seat.fte) : "",
    startDate: formatDateInput(seat.effectiveStartDate || seat.startDate),
    endDate: formatDateInput(seat.effectiveEndDate || seat.endDate),
    spendPlanId: seat.spendPlanId || "",
    ritm: seat.ritm || "",
    sow: seat.sow || "",
    notes: seat.notes || "",
  }
}

function SeatTypeaheadField({
  id,
  label,
  value,
  options,
  placeholder,
  searchPlaceholder,
  emptyText,
  onChange,
}: {
  id: string
  label: string
  value: string
  options: TypeaheadOption[]
  placeholder: string
  searchPlaceholder: string
  emptyText: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selectedOption = options.find((option) => option.value === value)

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span
              className={cn(
                "truncate text-left",
                !selectedOption && "text-muted-foreground"
              )}
            >
              {selectedOption?.label || placeholder}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="__empty__"
                  onSelect={() => {
                    onChange("")
                    setOpen(false)
                  }}
                >
                  <span className="truncate text-muted-foreground">{placeholder}</span>
                  <Check className={cn("ml-auto size-4", !value ? "opacity-100" : "opacity-0")} />
                </CommandItem>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => {
                      onChange(option.value)
                      setOpen(false)
                    }}
                  >
                    <span className="truncate">{option.label}</span>
                    <Check
                      className={cn(
                        "ml-auto size-4",
                        option.value === value ? "opacity-100" : "opacity-0"
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
  )
}

export function SeatEditorDialog({
  activeYear,
  open,
  onOpenChange,
  seat,
  budgetAreas,
  departmentMappings,
  seatReferenceValues,
  statusOptions,
  userRole,
}: SeatEditorDialogProps) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [fundingPreview, setFundingPreview] =
    useState<FundingAvailabilityPreviewView | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    setForm(buildFormState(seat, budgetAreas))
  }, [open, seat, budgetAreas])

  useEffect(() => {
    if (!open) {
      return
    }

    if (!form.funding) {
      setFundingPreview({
        funding: null,
        status: "unselected",
        message: "Select funding to see remaining allocation before saving the seat.",
        allocatedFunding: 0,
        currentProjectedFunding: 0,
        proposedProjectedFunding: null,
        remainingFundingBeforeSeat: 0,
        remainingFundingAfterSeat: null,
        exceededAmount: null,
      })
      return
    }

    let cancelled = false

    void fetchJson("/api/tracker/funding-follow-up/preview", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        year: activeYear,
        seatId: seat?.trackerSeatId ?? null,
        profile: {
          domain: form.domain || null,
          subDomain: form.subDomain || null,
          budgetAreaId: form.budgetAreaId || null,
          funding: form.funding || null,
          projectCode: form.projectCode || null,
          team: form.team || null,
          inSeat: form.inSeat || null,
          resourceType: form.resourceType || null,
          description: form.description || null,
          band: form.band || null,
          vendor: form.vendor || null,
          location: form.location || null,
          manager: form.manager || null,
          dailyRate: form.dailyRate || null,
          status: form.status || null,
          allocation: form.allocation || null,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
        },
      }),
    })
      .then((body: { preview: FundingAvailabilityPreviewView }) => {
        if (!cancelled) {
          setFundingPreview(body.preview)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFundingPreview({
            funding: form.funding,
            status: "insufficient_data",
            message: "Funding availability could not be estimated right now.",
            allocatedFunding: 0,
            currentProjectedFunding: 0,
            proposedProjectedFunding: null,
            remainingFundingBeforeSeat: 0,
            remainingFundingAfterSeat: null,
            exceededAmount: null,
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    activeYear,
    form.allocation,
    form.band,
    form.budgetAreaId,
    form.dailyRate,
    form.domain,
    form.endDate,
    form.funding,
    form.inSeat,
    form.location,
    form.manager,
    form.projectCode,
    form.resourceType,
    form.startDate,
    form.status,
    form.subDomain,
    form.team,
    form.vendor,
    form.description,
    open,
    seat?.trackerSeatId,
  ])

  const domainOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...departmentMappings.map((mapping) => mapping.domain),
            ...budgetAreas.map((area) => area.domain),
          ].filter((value): value is string => Boolean(value))
        )
      ).sort((left, right) => left.localeCompare(right)),
    [budgetAreas, departmentMappings]
  )
  const subDomainOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...departmentMappings
              .filter((mapping) => mapping.domain === form.domain)
              .map((mapping) => mapping.subDomain),
            ...budgetAreas
              .filter((area) => area.domain === form.domain)
              .map((area) => area.subDomain),
          ]
            .filter((value): value is string => Boolean(value))
        )
      ).sort((left, right) => left.localeCompare(right)),
    [budgetAreas, departmentMappings, form.domain]
  )
  const teamOptions = useMemo(
    () =>
      departmentMappings
        .filter(
          (mapping) => mapping.domain === form.domain && mapping.subDomain === form.subDomain
        )
        .flatMap((mapping) =>
          mapping.teams.map((team) => {
            const matchingBudgetArea =
              budgetAreas.find(
                (area) =>
                  area.domain === mapping.domain &&
                  area.subDomain === mapping.subDomain &&
                  area.projectCode === mapping.projectCode
              ) ?? null

            return {
              value: `${mapping.id}::${team}`,
              team,
              detail: [mapping.projectCode, mapping.sourceCode].filter(Boolean).join(" · "),
              projectCode: mapping.projectCode,
              budgetAreaId: matchingBudgetArea?.id || "",
            }
          })
        ),
    [budgetAreas, departmentMappings, form.domain, form.subDomain]
  )
  const effectiveTeamOptions =
    form.team &&
    !teamOptions.some(
      (option) => option.team === form.team && option.projectCode === form.projectCode
    )
      ? [
          {
            value: `current::${form.team}::${form.projectCode}`,
            team: form.team,
            detail: [form.projectCode, "Current seat"].filter(Boolean).join(" · "),
            projectCode: form.projectCode,
            budgetAreaId: form.budgetAreaId,
          },
          ...teamOptions,
        ]
      : teamOptions
  const selectedTeamOptionValue =
    effectiveTeamOptions.find(
      (option) =>
        option.team === form.team &&
        option.projectCode === form.projectCode &&
        option.budgetAreaId === form.budgetAreaId
    )?.value ??
    effectiveTeamOptions.find(
      (option) => option.team === form.team && option.projectCode === form.projectCode
    )?.value ??
    ""
  const vendorOptions = seatReferenceValues
    .filter((value) => value.type === "VENDOR")
    .map((value) => value.value)
  const fundingOptions = seatReferenceValues
    .filter((value) => value.type === "FUNDING")
    .map((value) => value.value)
  const locationOptions = seatReferenceValues
    .filter((value) => value.type === "LOCATION")
    .map((value) => value.value)
  const managerOptions = seatReferenceValues
    .filter((value) => value.type === "MANAGER")
    .map((value) => value.value)
  const roleOptions = seatReferenceValues
    .filter((value) => value.type === "ROLE")
    .map((value) => value.value)
  const bandOptions = seatReferenceValues
    .filter((value) => value.type === "BAND")
    .map((value) => value.value)
  const resourceTypeOptions = seatReferenceValues
    .filter((value) => value.type === "RESOURCE_TYPE")
    .map((value) => value.value)
  const fundingTypeaheadOptions = fundingOptions.map((value) => ({ value, label: value }))
  const vendorTypeaheadOptions = vendorOptions.map((value) => ({ value, label: value }))
  const locationTypeaheadOptions = locationOptions.map((value) => ({ value, label: value }))
  const managerTypeaheadOptions = managerOptions.map((value) => ({ value, label: value }))
  const canDeleteSeat =
    userRole === "SUPER_ADMIN" && seat?.trackerSeatId && seat.sourceType === "MANUAL"

  async function saveSeat() {
    setIsSaving(true)

    try {
      const payload = {
        year: activeYear,
        profile: {
          domain: form.domain || null,
          subDomain: form.subDomain || null,
          budgetAreaId: form.budgetAreaId || null,
          funding: form.funding || null,
          projectCode: form.projectCode || null,
          inSeat: form.inSeat || null,
          team: form.team || null,
          resourceType: form.resourceType || null,
          description: form.description || null,
          band: form.band || null,
          vendor: form.vendor || null,
          location: form.location || null,
          manager: form.manager || null,
          dailyRate: form.dailyRate || null,
          status: form.status || null,
          allocation: form.allocation || null,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
          spendPlanId: form.spendPlanId || null,
          ritm: form.ritm || null,
          sow: form.sow || null,
          notes: form.notes || null,
        },
      }

      if (seat?.trackerSeatId) {
        await fetchJson(`/api/tracker-seats/${seat.trackerSeatId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        })
        toast.success("Seat updated")
      } else {
        await fetchJson("/api/tracker-seats", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        })
        toast.success("Seat created")
      }

      onOpenChange(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed")
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteSeat() {
    if (!seat?.trackerSeatId || !canDeleteSeat) {
      return
    }

    setIsDeleting(true)

    try {
      await fetchJson(`/api/tracker-seats/${seat.trackerSeatId}`, {
        method: "DELETE",
      })
      toast.success("Seat deleted")
      setIsDeleteDialogOpen(false)
      onOpenChange(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{seat ? "Edit seat" : "Add seat"}</DialogTitle>
          <DialogDescription>
            {seat
              ? "Update seat planning metadata and maintained dropdown-backed values."
              : "Create a manual seat. Seat ID is assigned automatically as the next available integer."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Seat ID</Label>
            <Input value={seat?.seatId || "Assigned on save"} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="seat-name">Name</Label>
            <Input
              id="seat-name"
              value={form.inSeat}
              onChange={(event) => setForm((current) => ({ ...current, inSeat: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="seat-domain">Domain</Label>
            <NativeSelect
              id="seat-domain"
              value={form.domain}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  domain: event.target.value,
                  subDomain: "",
                  budgetAreaId: "",
                  projectCode: "",
                  team: "",
                }))
              }
            >
              <NativeSelectOption value="">Select domain</NativeSelectOption>
              {domainOptions.map((domain) => (
                <NativeSelectOption key={domain} value={domain}>
                  {domain}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="seat-subdomain">Sub-domain</Label>
            <NativeSelect
              id="seat-subdomain"
              value={form.subDomain}
              disabled={!form.domain}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  subDomain: event.target.value,
                  budgetAreaId: "",
                  projectCode: "",
                  team: "",
                }))
              }
            >
              <NativeSelectOption value="">
                {form.domain ? "Select sub-domain" : "Select domain first"}
              </NativeSelectOption>
              {subDomainOptions.map((subDomain) => (
                <NativeSelectOption key={subDomain} value={subDomain}>
                  {subDomain}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="seat-team">Team</Label>
            <Select
              value={selectedTeamOptionValue}
              disabled={!form.domain || !form.subDomain}
              onValueChange={(value) => {
                const selectedTeam = effectiveTeamOptions.find((option) => option.value === value)
                setForm((current) => ({
                  ...current,
                  budgetAreaId: selectedTeam?.budgetAreaId || "",
                  projectCode: selectedTeam?.projectCode || current.projectCode,
                  team: selectedTeam?.team || current.team,
                }))
              }}
            >
              <SelectTrigger id="seat-team" className="w-full">
                <SelectValue
                  placeholder={
                    form.domain && form.subDomain
                      ? "Select team"
                      : "Select domain and sub-domain first"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {effectiveTeamOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{option.team}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {option.detail}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <SeatTypeaheadField
            id="seat-funding"
            label="Funding"
            value={form.funding}
            options={fundingTypeaheadOptions}
            placeholder="Select funding"
            searchPlaceholder="Search funding..."
            emptyText="No funding found."
            onChange={(value) => setForm((current) => ({ ...current, funding: value }))}
          />
          <div className="space-y-2">
            <Label htmlFor="seat-resource-type">Resource type</Label>
            <NativeSelect
              id="seat-resource-type"
              value={form.resourceType}
              onChange={(event) =>
                setForm((current) => ({ ...current, resourceType: event.target.value }))
              }
            >
              <NativeSelectOption value="">Select resource type</NativeSelectOption>
              {resourceTypeOptions.map((option) => (
                <NativeSelectOption key={option} value={option}>
                  {option}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="seat-role">Role</Label>
            <NativeSelect
              id="seat-role"
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
            >
              <NativeSelectOption value="">Select role</NativeSelectOption>
              {roleOptions.map((option) => (
                <NativeSelectOption key={option} value={option}>
                  {option}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="seat-band">Band</Label>
            <NativeSelect
              id="seat-band"
              value={form.band}
              onChange={(event) => setForm((current) => ({ ...current, band: event.target.value }))}
            >
              <NativeSelectOption value="">Select band</NativeSelectOption>
              {bandOptions.map((option) => (
                <NativeSelectOption key={option} value={option}>
                  {option}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <SeatTypeaheadField
            id="seat-vendor"
            label="Vendor"
            value={form.vendor}
            options={vendorTypeaheadOptions}
            placeholder="Select vendor"
            searchPlaceholder="Search vendors..."
            emptyText="No vendor found."
            onChange={(value) => setForm((current) => ({ ...current, vendor: value }))}
          />
          <SeatTypeaheadField
            id="seat-location"
            label="Location"
            value={form.location}
            options={locationTypeaheadOptions}
            placeholder="Select location"
            searchPlaceholder="Search locations..."
            emptyText="No location found."
            onChange={(value) => setForm((current) => ({ ...current, location: value }))}
          />
          <SeatTypeaheadField
            id="seat-manager"
            label="Manager"
            value={form.manager}
            options={managerTypeaheadOptions}
            placeholder="Select manager"
            searchPlaceholder="Search managers..."
            emptyText="No manager found."
            onChange={(value) => setForm((current) => ({ ...current, manager: value }))}
          />
          <div className="space-y-2">
            <Label htmlFor="seat-daily-rate">Daily rate</Label>
            <Input
              id="seat-daily-rate"
              type="number"
              value={form.dailyRate}
              onChange={(event) =>
                setForm((current) => ({ ...current, dailyRate: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="seat-status">Status</Label>
            <NativeSelect
              id="seat-status"
              value={form.status}
              onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
            >
              <NativeSelectOption value="">Select status</NativeSelectOption>
              {statusOptions.map((option) => (
                <NativeSelectOption key={option} value={option}>
                  {option}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="seat-allocation">FTE allocation</Label>
            <Input
              id="seat-allocation"
              type="number"
              step="0.01"
              value={form.allocation}
              onChange={(event) =>
                setForm((current) => ({ ...current, allocation: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="seat-start-date">Start date</Label>
            <Input
              id="seat-start-date"
              type="date"
              value={form.startDate}
              onChange={(event) =>
                setForm((current) => ({ ...current, startDate: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="seat-end-date">End date</Label>
            <Input
              id="seat-end-date"
              type="date"
              value={form.endDate}
              onChange={(event) =>
                setForm((current) => ({ ...current, endDate: event.target.value }))
              }
            />
          </div>
          <div className="space-y-3 md:col-span-2">
            <Label>Funding follow-up</Label>
            <div
              className={cn(
                "rounded-lg border px-4 py-3 text-sm",
                fundingPreview?.status === "exceeded"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : fundingPreview?.status === "within"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-border bg-muted/30 text-muted-foreground"
              )}
            >
              <p className="font-medium">
                {fundingPreview?.message ||
                  "Select funding to see remaining allocation before saving the seat."}
              </p>
              {fundingPreview ? (
                <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <div className="text-muted-foreground">Allocated</div>
                    <div>{formatCurrency(fundingPreview.allocatedFunding)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Current projected</div>
                    <div>{formatCurrency(fundingPreview.currentProjectedFunding)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">This seat projected</div>
                    <div>
                      {fundingPreview.proposedProjectedFunding === null
                        ? "Not ready"
                        : formatCurrency(fundingPreview.proposedProjectedFunding)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Remaining after seat</div>
                    <div>
                      {fundingPreview.remainingFundingAfterSeat === null
                        ? "Not ready"
                        : formatCurrency(fundingPreview.remainingFundingAfterSeat)}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="seat-spend-plan">Spend plan ID</Label>
            <Input
              id="seat-spend-plan"
              value={form.spendPlanId}
              onChange={(event) =>
                setForm((current) => ({ ...current, spendPlanId: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="seat-ritm">RITM</Label>
            <Input
              id="seat-ritm"
              value={form.ritm}
              onChange={(event) => setForm((current) => ({ ...current, ritm: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="seat-sow">SOW</Label>
            <Input
              id="seat-sow"
              value={form.sow}
              onChange={(event) => setForm((current) => ({ ...current, sow: event.target.value }))}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="seat-notes">Notes</Label>
          <Textarea
            id="seat-notes"
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            rows={4}
          />
        </div>
        <div className="flex justify-between gap-2">
          <div>
            {canDeleteSeat ? (
              <Button variant="destructive" onClick={() => setIsDeleteDialogOpen(true)}>
                Delete Seat
              </Button>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                isSaving ||
                !form.domain ||
                !form.subDomain ||
                !form.projectCode
              }
              onClick={() => void saveSeat()}
            >
              {isSaving ? "Saving..." : seat ? "Save changes" : "Create seat"}
            </Button>
          </div>
        </div>
      </DialogContent>
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete seat?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes manual seat {seat?.seatId || ""} and its tracker data.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault()
                void deleteSeat()
              }}
            >
              {isDeleting ? "Deleting..." : "Delete seat"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
