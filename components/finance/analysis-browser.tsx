"use client"

import type { FormEvent, ReactNode } from "react"
import { useEffect, useMemo, useState, useTransition } from "react"
import { AlertCircle, Brain, CheckCircle2, LoaderCircle, RefreshCw } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { FinancePageIntro } from "@/components/finance/page-intro"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Separator } from "@/components/ui/separator"
import type { BudgetOutlookRunResult, BudgetOutlookStatusCode } from "@/lib/ai/tasks/run-budget-outlook"
import type { DeterministicBudgetOutlookFacts } from "@/lib/finance/analysis"
import { formatCurrency, formatNumber, formatPercent } from "@/lib/finance/format"
import { cn } from "@/lib/utils"

type TrackingYearOption = {
  id: string
  year: number
  isActive: boolean
}

type SummaryOption = {
  id: string
  displayName: string
  domain: string | null
  subDomain: string | null
  projectCode: string | null
  budget: number
  spentToDate: number
  totalForecast: number
  forecastRemaining: number
}

type AnalysisBrowserProps = {
  activeYear: number
  trackingYears: TrackingYearOption[]
  summaryOptions: SummaryOption[]
  selectedSummaryKey: string | null
  initialFacts: DeterministicBudgetOutlookFacts | null
  aiConfig: {
    ollamaBaseUrl: string | null
    ollamaModel: string | null
    isConfigured: boolean
    missingEnvVars: string[]
  }
}

const STATUS_LABELS: Record<BudgetOutlookStatusCode, string> = {
  idle: "Idle",
  success: "Generated",
  "not-configured": "Not configured",
  "provider-error": "Provider error",
  timeout: "Timed out",
  "invalid-json": "Invalid JSON",
  "schema-error": "Schema error",
  "empty-response": "Empty response",
}

function getStatusVariant(code: BudgetOutlookStatusCode) {
  if (code === "success") {
    return "default"
  }

  if (code === "idle" || code === "not-configured") {
    return "secondary"
  }

  return "destructive"
}

async function fetchJson(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init)
  const body = await response.json()

  if (!response.ok) {
    throw new Error(body.error || "Request failed")
  }

  return body
}

function formatAnalysisCurrency(value: number) {
  const normalized = Number.isFinite(value) ? value : 0
  const absoluteFormatted = formatCurrency(Math.abs(normalized)).replace("DKK", "").trim()
  return normalized < 0 ? `(${absoluteFormatted})` : absoluteFormatted
}

function getAnalysisCurrencyClassName(value: number) {
  return value < 0 ? "text-rose-600" : undefined
}

function getDriverAmountClassName(input: {
  amount: number
  direction: DeterministicBudgetOutlookFacts["drivers"][number]["direction"]
}) {
  if (input.direction === "favorable") {
    return "text-emerald-600"
  }

  return getAnalysisCurrencyClassName(input.amount)
}

export function AnalysisBrowser({
  activeYear,
  trackingYears,
  summaryOptions,
  selectedSummaryKey,
  initialFacts,
  aiConfig,
}: AnalysisBrowserProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [selectedYear, setSelectedYear] = useState(String(activeYear))
  const [selectedSummary, setSelectedSummary] = useState(selectedSummaryKey ?? "")
  const [isGenerating, setIsGenerating] = useState(false)
  const [runResult, setRunResult] = useState<BudgetOutlookRunResult | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)

  useEffect(() => {
    setSelectedYear(String(activeYear))
    setSelectedSummary(selectedSummaryKey ?? "")
    setRunResult(null)
    setRequestError(null)
  }, [activeYear, selectedSummaryKey])

  const hasUnsavedSelection =
    selectedYear !== String(activeYear) || selectedSummary !== (selectedSummaryKey ?? "")

  const selectedSummaryOption = useMemo(
    () => summaryOptions.find((option) => option.id === (selectedSummaryKey ?? "")) ?? null,
    [selectedSummaryKey, summaryOptions]
  )

  const resultFacts = runResult?.facts ?? initialFacts
  const resultStatus = runResult?.status ?? null

  function applySelection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const params = new URLSearchParams(searchParams.toString())
    params.set("year", selectedYear)

    if (selectedSummary) {
      params.set("summaryKey", selectedSummary)
    } else {
      params.delete("summaryKey")
    }

    startTransition(() => {
      router.replace(`/analysis?${params.toString()}`, { scroll: false })
    })
  }

  async function handleGenerate() {
    if (!selectedSummaryKey) {
      return
    }

    setIsGenerating(true)
    setRequestError(null)

    try {
      const response = (await fetchJson("/api/analysis/budget-outlook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          year: activeYear,
          summaryKey: selectedSummaryKey,
        }),
      })) as BudgetOutlookRunResult

      setRunResult(response)
    } catch (error) {
      setRunResult(null)
      setRequestError(error instanceof Error ? error.message : "Analysis failed")
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 py-2">
      <FinancePageIntro
        title="Analysis"
        subtitle="Generate a structured AI outlook for a selected tracker summary row using existing budget, actuals, forecast, and seat data."
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
        <Card className="border-border/70">
          <CardHeader className="gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-foreground text-background shadow-sm">
                <Brain className="size-5" />
              </div>
              <div>
                <CardTitle>Budget Outlook Scope</CardTitle>
                <CardDescription>
                  Deterministic facts load from the tracker first. AI generation runs only when you explicitly request it.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <form className="grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)_auto]" onSubmit={applySelection}>
              <div className="space-y-2">
                <Label htmlFor="analysis-year">Year</Label>
                <NativeSelect
                  id="analysis-year"
                  value={selectedYear}
                  onChange={(event) => setSelectedYear(event.target.value)}
                  disabled={isPending}
                  className="w-full"
                >
                  {trackingYears.map((year) => (
                    <NativeSelectOption key={year.id} value={String(year.year)}>
                      {year.year}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>

              <div className="space-y-2">
                <Label htmlFor="analysis-summary">Summary row</Label>
                <NativeSelect
                  id="analysis-summary"
                  value={selectedSummary}
                  onChange={(event) => setSelectedSummary(event.target.value)}
                  disabled={isPending || summaryOptions.length === 0}
                  className="w-full"
                >
                  {summaryOptions.length === 0 ? (
                    <NativeSelectOption value="">No summary rows available</NativeSelectOption>
                  ) : null}
                  {summaryOptions.map((option) => (
                    <NativeSelectOption key={option.id} value={option.id}>
                      {option.displayName}
                      {option.projectCode ? ` · ${option.projectCode}` : ""}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>

              <div className="flex items-end">
                <Button type="submit" disabled={isPending || !selectedSummary}>
                  {isPending ? "Loading..." : "Load scope"}
                </Button>
              </div>
            </form>

            {selectedSummaryOption ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Budget"
                  value={formatAnalysisCurrency(selectedSummaryOption.budget)}
                  detail={
                    <>
                      Spent{" "}
                      <span className={cn(getAnalysisCurrencyClassName(selectedSummaryOption.spentToDate))}>
                        {formatAnalysisCurrency(selectedSummaryOption.spentToDate)}
                      </span>
                    </>
                  }
                />
                <MetricCard
                  label="Forecast"
                  value={formatAnalysisCurrency(selectedSummaryOption.totalForecast)}
                  valueClassName={getAnalysisCurrencyClassName(selectedSummaryOption.totalForecast)}
                  detail={
                    <>
                      Remaining{" "}
                      <span className={cn(getAnalysisCurrencyClassName(selectedSummaryOption.forecastRemaining))}>
                        {formatAnalysisCurrency(selectedSummaryOption.forecastRemaining)}
                      </span>
                    </>
                  }
                />
                <MetricCard
                  label="Domain"
                  value={selectedSummaryOption.domain || "Unmapped"}
                  detail={selectedSummaryOption.subDomain || "No sub-domain"}
                />
                <MetricCard
                  label="Project code"
                  value={selectedSummaryOption.projectCode || "Unassigned"}
                  detail={selectedSummaryOption.displayName}
                />
              </div>
            ) : (
              <Alert>
                <AlertCircle />
                <AlertTitle>No summary rows</AlertTitle>
                <AlertDescription>
                  This year does not currently have any summary rows available for analysis.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="gap-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>AI Provider</CardTitle>
                <CardDescription>
                  The outlook uses the configured server-side Ollama provider.
                </CardDescription>
              </div>
              <Badge variant={aiConfig.isConfigured ? "default" : "secondary"}>
                {aiConfig.isConfigured ? "Configured" : "Not configured"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <MetadataRow label="Base URL" value={aiConfig.ollamaBaseUrl || "Not configured"} />
            <MetadataRow label="Model" value={aiConfig.ollamaModel || "Not configured"} />
            {!aiConfig.isConfigured ? (
              <Alert>
                <AlertCircle />
                <AlertTitle>Missing configuration</AlertTitle>
                <AlertDescription>
                  Missing env vars: {aiConfig.missingEnvVars.join(", ")}
                </AlertDescription>
              </Alert>
            ) : null}
            <Button
              className="w-full"
              disabled={
                isGenerating ||
                hasUnsavedSelection ||
                !selectedSummaryKey ||
                !aiConfig.isConfigured
              }
              onClick={handleGenerate}
            >
              {isGenerating ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Generating outlook...
                </>
              ) : (
                <>
                  <RefreshCw className="size-4" />
                  Generate outlook
                </>
              )}
            </Button>
            {hasUnsavedSelection ? (
              <p className="text-xs text-muted-foreground">
                Load the selected scope before generating an outlook.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </section>

      {resultFacts ? <DeterministicFactsPanel facts={resultFacts} /> : null}

      <Card className="border-border/70">
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>AI Narrative</CardTitle>
            <CardDescription>
              Structured narrative generated from the selected summary row and its supporting seat detail.
            </CardDescription>
          </div>
          {resultStatus ? (
            <Badge variant={getStatusVariant(resultStatus.code)}>
              {STATUS_LABELS[resultStatus.code]}
            </Badge>
          ) : (
            <Badge variant="secondary">Idle</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          {requestError ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Request failed</AlertTitle>
              <AlertDescription>{requestError}</AlertDescription>
            </Alert>
          ) : null}

          {resultStatus ? (
            <Alert variant={resultStatus.code === "success" ? undefined : "destructive"}>
              {resultStatus.code === "success" ? <CheckCircle2 /> : <AlertCircle />}
              <AlertTitle>{STATUS_LABELS[resultStatus.code]}</AlertTitle>
              <AlertDescription>{resultStatus.message}</AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <AlertCircle />
              <AlertTitle>No outlook generated yet</AlertTitle>
              <AlertDescription>
                Load a summary row and use the Generate outlook action to request the AI narrative.
              </AlertDescription>
            </Alert>
          )}

          {runResult?.ai ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
              <Card className="border-border/60 bg-muted/20 shadow-none">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base">Summary</CardTitle>
                    <Badge variant="outline">{runResult.ai.outlook.replace("_", " ")}</Badge>
                  </div>
                  <CardDescription>{runResult.ai.summary}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <SectionList
                    title="Key drivers"
                    items={runResult.ai.keyDrivers.map((driver) => (
                      <div key={`${driver.title}-${driver.direction}`} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{driver.title}</span>
                          <Badge variant="outline">{driver.direction}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{driver.explanation}</p>
                      </div>
                    ))}
                  />
                </CardContent>
              </Card>

              <div className="grid gap-4">
                <SimpleStringList title="Watchouts" items={runResult.ai.watchouts} />
                <SimpleStringList title="Actions" items={runResult.ai.actions} />
                <SimpleStringList title="Coverage notes" items={runResult.ai.coverageNotes} />
                <MetricCard
                  label="Confidence"
                  value={runResult.ai.confidence}
                  detail={runResult.status.model || "Configured model"}
                />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  )
}

function DeterministicFactsPanel({
  facts,
}: {
  facts: DeterministicBudgetOutlookFacts
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
      <Card className="border-border/70">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Deterministic facts</CardTitle>
              <CardDescription>
                Scope: {facts.scope.displayName}
                {facts.scope.projectCode ? ` · ${facts.scope.projectCode}` : ""}
              </CardDescription>
            </div>
            <span className="text-xs text-muted-foreground">All financial values in DKK</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Budget"
              value={formatAnalysisCurrency(facts.summary.budget)}
              detail={
                <>
                  Finance view{" "}
                  <span className={cn(getAnalysisCurrencyClassName(facts.summary.financeViewBudget))}>
                    {formatAnalysisCurrency(facts.summary.financeViewBudget)}
                  </span>
                </>
              }
            />
            <MetricCard
              label="Spent to date"
              value={formatAnalysisCurrency(facts.summary.spentToDate)}
              valueClassName={getAnalysisCurrencyClassName(facts.summary.spentToDate)}
              detail={
                <>
                  Remaining budget{" "}
                  <span className={cn(getAnalysisCurrencyClassName(facts.summary.remainingBudget))}>
                    {formatAnalysisCurrency(facts.summary.remainingBudget)}
                  </span>
                </>
              }
            />
            <MetricCard
              label="Forecast Spend To End Of Year"
              value={formatAnalysisCurrency(facts.summary.totalForecast)}
              detail={
                <>
                  <span>End of year balance</span>
                  <span
                    className={cn(
                      "mt-1 block",
                      getAnalysisCurrencyClassName(facts.summary.forecastRemaining)
                    )}
                  >
                    {formatAnalysisCurrency(facts.summary.forecastRemaining)}
                  </span>
                </>
              }
            />
            <MetricCard
              label="Seats"
              value={formatNumber(facts.summary.seatCount)}
              detail={`${facts.summary.activeSeatCount} active · ${facts.summary.openSeatCount} open`}
            />
            <MetricCard
              label="External share"
              value={formatPercent(facts.staffing.externalForecastShare)}
              detail={`Perm ${formatPercent(facts.staffing.permForecastShare)}`}
            />
            <MetricCard
              label="Cloud share"
              value={formatPercent(facts.resourceMix.cloudForecastShare)}
              detail={
                <span className={cn(getAnalysisCurrencyClassName(facts.summary.cloudCostForecast))}>
                  {formatAnalysisCurrency(facts.summary.cloudCostForecast)}
                </span>
              }
            />
            <MetricCard
              label="Open-seat share"
              value={formatPercent(facts.staffing.openSeatShare)}
              detail={
                <span className={cn(getAnalysisCurrencyClassName(facts.staffing.openSeatForecast))}>
                  {formatAnalysisCurrency(facts.staffing.openSeatForecast)}
                </span>
              }
            />
            <MetricCard
              label="Coverage gaps"
              value={formatNumber(facts.coverage.forecastMonthsWithoutActuals)}
              detail={
                <span className={cn(getAnalysisCurrencyClassName(facts.coverage.uncoveredForecastAmount))}>
                  {formatAnalysisCurrency(facts.coverage.uncoveredForecastAmount)}
                </span>
              }
            />
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <BucketMetricCard
              label="Perm Forecast"
              value={facts.summary.permForecast}
              detail="Share of remaining forecast in permanent seats."
              dashed
            />
            <BucketMetricCard
              label="Ext Forecast"
              value={facts.summary.extForecast}
              detail="Share of remaining forecast in external seats."
              dashed
            />
            <BucketMetricCard
              label="AMS Forecast"
              value={facts.summary.amsForecast}
              detail="Share of remaining forecast in managed services."
              dashed
            />
            <BucketMetricCard
              label="Cloud Forecast"
              value={facts.summary.cloudCostForecast}
              detail="Share of remaining forecast in cloud spend."
              dashed
            />
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <BucketMetricCard
              label="Perm Budget - Spent"
              value={facts.summary.permBudget - facts.summary.permSpent}
            />
            <BucketMetricCard
              label="Ext Budget - Spent"
              value={facts.summary.extBudget - facts.summary.extSpent}
            />
            <BucketMetricCard
              label="AMS Budget - Spent"
              value={facts.summary.amsBudget - facts.summary.amsSpent}
            />
            <BucketMetricCard
              label="Cloud Budget - Spent"
              value={facts.summary.cloudCostTarget - facts.summary.cloudSpent}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Precomputed signals</CardTitle>
            <CardDescription>Signals supplied to the AI prompt before narrative generation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {facts.drivers.map((driver) => (
              <div key={driver.key} className="space-y-1 rounded-xl border border-border/60 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{driver.title}</span>
                  <Badge variant="outline">{driver.direction}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{driver.detail}</p>
                <p className="text-xs text-muted-foreground">
                  {driver.amount !== null ? (
                    <span
                      className={cn(
                        getDriverAmountClassName({
                          amount: driver.amount,
                          direction: driver.direction,
                        })
                      )}
                    >
                      {formatAnalysisCurrency(driver.amount)}
                    </span>
                  ) : (
                    "No direct amount"
                  )}
                  {driver.share !== null ? ` · ${formatPercent(driver.share)}` : ""}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Forecast concentration</CardTitle>
            <CardDescription>
              Top external and AMS seats by forecast amount. This highlights spend concentration, not uncovered months.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {facts.concentration.concentrationForecastTotal > 0 ? (
              <p className="text-xs text-muted-foreground">
                Top 3 seats account for{" "}
                <span
                  className={cn(
                    "font-medium text-foreground",
                    getAnalysisCurrencyClassName(facts.concentration.topThreeForecastAmount)
                  )}
                >
                  {formatAnalysisCurrency(facts.concentration.topThreeForecastAmount)}
                </span>{" "}
                of{" "}
                <span className="font-medium text-foreground">
                  {formatAnalysisCurrency(facts.concentration.concentrationForecastTotal)}
                </span>{" "}
                external and AMS forecast spend.
              </p>
            ) : null}
            {facts.concentration.topForecastSeats.map((seat) => (
              <div key={seat.seatId} className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{seat.label}</span>
                  <span className={cn("text-sm", getAnalysisCurrencyClassName(seat.totalForecast))}>
                    {formatAnalysisCurrency(seat.totalForecast)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Seat {seat.seatId} · {formatPercent(seat.share)}
                </p>
                <Separator />
              </div>
            ))}
            {facts.concentration.topForecastSeats.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No external or AMS forecast seats are driving concentration for this scope.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

function MetricCard({
  label,
  value,
  valueClassName,
  detail,
}: {
  label: string
  value: string
  valueClassName?: string
  detail: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
      <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-2 text-lg font-semibold text-foreground", valueClassName)}>{value}</p>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  )
}

function BucketMetricCard({
  label,
  value,
  detail,
  dashed = false,
}: {
  label: string
  value: number
  detail?: string
  dashed?: boolean
}) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-muted/35 px-4 py-4",
        dashed && "border border-dashed border-border bg-transparent"
      )}
    >
      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className={cn("mt-2 font-medium", getAnalysisCurrencyClassName(value))}>
        {formatAnalysisCurrency(value)}
      </div>
      {detail ? <div className="mt-2 text-xs text-muted-foreground">{detail}</div> : null}
    </div>
  )
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
      <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 break-all text-sm text-foreground">{value}</p>
    </div>
  )
}

function SectionList({
  title,
  items,
}: {
  title: string
  items: ReactNode[]
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {items}
    </section>
  )
}

function SimpleStringList({
  title,
  items,
}: {
  title: string
  items: string[]
}) {
  return (
    <Card className="border-border/60 bg-muted/20 shadow-none">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length > 0 ? (
          <ul className="space-y-2 text-sm text-muted-foreground">
            {items.map((item) => (
              <li key={item} className="rounded-lg border border-border/50 px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">None.</p>
        )}
      </CardContent>
    </Card>
  )
}
