"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatCurrency, formatNumber } from "@/lib/finance/format"
import type { AppRole } from "@/lib/roles"

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
  notes: string | null
}

type ExchangeRate = {
  currency: "DKK" | "EUR" | "USD"
  rateToDkk: number
  effectiveDate: Date
  notes: string | null
}

type CostAssumption = {
  id: string
  band: string
  location: string
  yearlyCost: number
  dailyCost: number
  notes: string | null
}

type AdminBrowserProps = {
  userName: string
  userEmail: string
  userRole: AppRole
  activeYear: number
  trackingYears: TrackingYearOption[]
  statuses: StatusDefinition[]
  departmentMappings: DepartmentMapping[]
  exchangeRates: ExchangeRate[]
  assumptions: CostAssumption[]
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
  userName,
  userEmail,
  userRole,
  activeYear,
  trackingYears,
  statuses,
  departmentMappings,
  exchangeRates,
  assumptions,
}: AdminBrowserProps) {
  const router = useRouter()
  const [mappingValues, setMappingValues] = useState({
    sourceCode: "",
    domain: "",
    subDomain: "",
    notes: "",
  })
  const [fxValues, setFxValues] = useState({
    currency: "EUR" as "DKK" | "EUR" | "USD",
    rateToDkk: "",
    effectiveDate: `${activeYear}-01-01`,
    notes: "",
  })
  const [assumptionValues, setAssumptionValues] = useState({
    band: "",
    location: "",
    yearlyCost: "",
    notes: "",
  })

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

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(187,108,37,0.16),_transparent_32%),linear-gradient(180deg,_rgba(255,250,243,1)_0%,_rgba(246,240,232,1)_100%)]">
      <FinanceHeader
        title="Admin"
        subtitle="Maintain tracker configuration, hierarchy mappings, exchange rates, and manual cost assumptions."
        userName={userName}
        userEmail={userEmail}
        userRole={userRole}
        activeYear={activeYear}
        currentPath="/admin"
      />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <Card className="border-amber-200/70 bg-white/90">
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

        <section className="grid gap-6 xl:grid-cols-2">
          <Card className="border-amber-200/70 bg-white/90">
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

          <Card className="border-amber-200/70 bg-white/90">
            <CardHeader>
              <CardTitle>Hierarchy Mapping</CardTitle>
              <CardDescription>
                Map department codes into domain and sub-domain. Team stays on the seat.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3">
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
                  placeholder="Optional notes"
                  value={mappingValues.notes}
                  onChange={(event) =>
                    setMappingValues((current) => ({
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
                          sourceCode: mappingValues.sourceCode,
                          domain: mappingValues.domain,
                          subDomain: mappingValues.subDomain,
                          notes: mappingValues.notes,
                        },
                        "/api/department-mappings",
                        "Hierarchy mapping saved"
                      )
                    }}
                  >
                    Save Mapping
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setMappingValues({
                        sourceCode: "",
                        domain: "",
                        subDomain: "",
                        notes: "",
                      })
                    }
                  >
                    Clear
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
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {departmentMappings.map((mapping) => (
                      <TableRow key={mapping.id}>
                        <TableCell>{mapping.sourceCode}</TableCell>
                        <TableCell>{mapping.domain}</TableCell>
                        <TableCell>{mapping.subDomain}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setMappingValues({
                                sourceCode: mapping.sourceCode,
                                domain: mapping.domain,
                                subDomain: mapping.subDomain,
                                notes: mapping.notes || "",
                              })
                            }
                          >
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {departmentMappings.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                          No hierarchy mappings saved yet.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="border-amber-200/70 bg-white/90">
            <CardHeader>
              <CardTitle>Exchange Rates</CardTitle>
              <CardDescription>
                Maintain latest FX rates to convert EUR and USD actuals into DKK.
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

              <div className="space-y-2 text-sm">
                {exchangeRates.map((rate) => (
                  <div
                    key={rate.currency}
                    className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2"
                  >
                    <span>{rate.currency}</span>
                    <span>1 {rate.currency} = {formatNumber(rate.rateToDkk)} DKK</span>
                    <span className="text-muted-foreground">{formatDate(rate.effectiveDate)}</span>
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
                  </div>
                ))}
                {!exchangeRates.some((rate) => rate.currency === "DKK") ? (
                  <div className="text-muted-foreground">DKK is treated as 1.00 automatically.</div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="border-amber-200/70 bg-white/90">
            <CardHeader>
              <CardTitle>Manual Cost Assumptions</CardTitle>
              <CardDescription>Internal yearly cost by band and location.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Input
                  placeholder="Band 5"
                  value={assumptionValues.band}
                  onChange={(event) =>
                    setAssumptionValues((current) => ({
                      ...current,
                      band: event.target.value,
                    }))
                  }
                />
                <Input
                  placeholder="Denmark"
                  value={assumptionValues.location}
                  onChange={(event) =>
                    setAssumptionValues((current) => ({
                      ...current,
                      location: event.target.value,
                    }))
                  }
                />
                <Input
                  placeholder="950000"
                  value={assumptionValues.yearlyCost}
                  onChange={(event) =>
                    setAssumptionValues((current) => ({
                      ...current,
                      yearlyCost: event.target.value,
                    }))
                  }
                />
                <Input
                  placeholder="Optional notes"
                  value={assumptionValues.notes}
                  onChange={(event) =>
                    setAssumptionValues((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      void handleJsonSubmit(
                        {
                          year: activeYear,
                          band: assumptionValues.band,
                          location: assumptionValues.location,
                          yearlyCost: Number(assumptionValues.yearlyCost),
                          notes: assumptionValues.notes,
                        },
                        "/api/cost-assumptions",
                        "Cost assumption saved"
                      )
                    }}
                  >
                    Save Assumption
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setAssumptionValues({
                        band: "",
                        location: "",
                        yearlyCost: "",
                        notes: "",
                      })
                    }
                  >
                    Clear
                  </Button>
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Band</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Yearly Cost</TableHead>
                      <TableHead>Daily Cost</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assumptions.map((assumption) => (
                      <TableRow key={assumption.id}>
                        <TableCell>{assumption.band}</TableCell>
                        <TableCell>{assumption.location}</TableCell>
                        <TableCell>{formatCurrency(assumption.yearlyCost)}</TableCell>
                        <TableCell>{formatCurrency(assumption.dailyCost)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setAssumptionValues({
                                band: assumption.band,
                                location: assumption.location,
                                yearlyCost: String(assumption.yearlyCost),
                                notes: assumption.notes || "",
                              })
                            }
                          >
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {assumptions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                          No cost assumptions saved yet.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  )
}
