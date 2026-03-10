"use client"

import { useEffect } from "react"
import {
  ShieldCheck,
  Activity,
  Clock,
  Gauge,
  Target,
  MessageSquareText,
  Sparkles,
  Brain,
  CircleCheckBig,
  TriangleAlert,
} from "lucide-react"
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
  Cell,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { useAnalyticsStore } from "@/store/analytics-store"

// --- Gauge ring component ---
function ScoreGauge({ value, label, color }: { value: number; label: string; color: string }) {
  const percentage = value * 100
  const circumference = 2 * Math.PI * 36
  const filled = (percentage / 100) * circumference
  const track = circumference - filled

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative h-[84px] w-[84px]">
        <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
          <circle
            cx="40" cy="40" r="36"
            fill="none"
            stroke="currentColor"
            className="text-muted/40"
            strokeWidth="6"
          />
          <circle
            cx="40" cy="40" r="36"
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${track}`}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold tabular-nums tracking-tight">
            {percentage.toFixed(0)}
          </span>
        </div>
      </div>
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
    </div>
  )
}

// --- Color-coded progress bar ---
function ColoredMetricRow({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
}) {
  const pct = value * 100
  const barColor =
    pct >= 85
      ? "bg-emerald-500/70 dark:bg-emerald-400/60"
      : pct >= 70
        ? "bg-sky-500/60 dark:bg-sky-400/50"
        : "bg-amber-500/60 dark:bg-amber-400/50"

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3 w-3 text-muted-foreground/50" />
          <span className="text-xs font-medium">{label}</span>
        </div>
        <span className="text-xs font-semibold tabular-nums">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted/50">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-700 ease-out`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  )
}

const radarConfig = {
  score: { label: "Score", color: "var(--chart-1)" },
} satisfies ChartConfig

const latencyBarConfig = {
  value: { label: "Latency", color: "var(--chart-1)" },
} satisfies ChartConfig

const toxicityGaugeConfig = {
  value: { label: "Rate", color: "var(--chart-5)" },
} satisfies ChartConfig

const groundednessGaugeConfig = {
  value: { label: "Score", color: "var(--chart-2)" },
} satisfies ChartConfig

export default function EvaluationsPage() {
  const { evaluations, isLoading, fetchAll } = useAnalyticsStore()

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  if (isLoading || !evaluations) {
    return (
      <>
        <Header title="Evaluations" />
        <div className="flex-1 space-y-3 p-4 lg:p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="border-border/50">
                <CardContent className="px-4 py-4">
                  <Skeleton className="mx-auto h-[84px] w-[84px] rounded-full" />
                  <Skeleton className="mx-auto mt-2 h-3 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-5">
            <Card className="border-border/50 lg:col-span-3">
              <CardContent className="p-4">
                <Skeleton className="h-[320px] w-full" />
              </CardContent>
            </Card>
            <Card className="border-border/50 lg:col-span-2">
              <CardContent className="p-4">
                <Skeleton className="h-[320px] w-full" />
              </CardContent>
            </Card>
          </div>
          <Card className="border-border/50">
            <CardContent className="p-4">
              <Skeleton className="h-[200px] w-full" />
            </CardContent>
          </Card>
        </div>
      </>
    )
  }

  const overallQuality =
    (evaluations.accuracy + evaluations.relevance + evaluations.coherence + evaluations.helpfulness) / 4

  const radarData = [
    { metric: "Accuracy", score: evaluations.accuracy * 100, fullMark: 100 },
    { metric: "Relevance", score: evaluations.relevance * 100, fullMark: 100 },
    { metric: "Coherence", score: evaluations.coherence * 100, fullMark: 100 },
    { metric: "Helpfulness", score: evaluations.helpfulness * 100, fullMark: 100 },
  ]

  const toxicityPct = evaluations.toxicity * 100
  const groundednessPct = evaluations.groundedness * 100
  const toxicitySafe = evaluations.toxicity < 0.05
  const groundednessGood = evaluations.groundedness > 0.8

  const toxicityGaugeData = [{ value: toxicityPct, fill: toxicitySafe ? "var(--chart-2)" : "var(--chart-5)" }]
  const groundednessGaugeData = [{ value: groundednessPct, fill: groundednessGood ? "var(--chart-2)" : "var(--chart-4)" }]

  const latencyBars = [
    { label: "P50", value: evaluations.latencyP50, fill: "var(--chart-1)" },
    { label: "P95", value: evaluations.latencyP95, fill: "var(--chart-3)" },
    { label: "Target", value: 500, fill: "var(--chart-2)" },
  ]

  const thresholds = [
    { metric: "P50 Latency", value: `${evaluations.latencyP50}ms`, target: "< 500ms", status: evaluations.latencyP50 < 500 },
    { metric: "P95 Latency", value: `${evaluations.latencyP95}ms`, target: "< 2000ms", status: evaluations.latencyP95 < 2000 },
    { metric: "Toxicity", value: `${toxicityPct.toFixed(1)}%`, target: "< 5%", status: toxicitySafe },
    { metric: "Groundedness", value: `${groundednessPct.toFixed(1)}%`, target: "> 80%", status: groundednessGood },
  ]

  return (
    <>
      <Header title="Evaluations" />
      <div className="flex-1 space-y-3 p-4 lg:p-5">

        {/* Top KPI — Score Gauges */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-border/50">
            <CardContent className="flex flex-col items-center px-4 py-4">
              <ScoreGauge value={overallQuality} label="Overall Quality" color="var(--chart-1)" />
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="flex flex-col items-center px-4 py-4">
              <ScoreGauge value={evaluations.accuracy} label="Accuracy" color="var(--chart-2)" />
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="flex flex-col items-center px-4 py-4">
              <ScoreGauge value={evaluations.relevance} label="Relevance" color="var(--chart-4)" />
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="flex flex-col items-center px-4 py-4">
              <ScoreGauge value={evaluations.coherence} label="Coherence" color="var(--chart-3)" />
            </CardContent>
          </Card>
        </div>

        {/* Main grid: Radar + Breakdowns | Safety gauges */}
        <div className="grid gap-3 lg:grid-cols-5">
          {/* Quality Scores — wider */}
          <Card className="border-border/50 lg:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Quality Scores</CardTitle>
              <p className="text-xs text-muted-foreground">Automated evaluation across 4 dimensions</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <ChartContainer config={radarConfig} className="mx-auto h-[240px] w-full">
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
                  <PolarGrid strokeOpacity={0.2} />
                  <PolarAngleAxis
                    dataKey="metric"
                    tick={{ fontSize: 12, fontWeight: 500 }}
                  />
                  <PolarRadiusAxis tick={{ fontSize: 10 }} domain={[0, 100]} tickCount={5} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Radar
                    dataKey="score"
                    stroke="var(--color-score)"
                    fill="var(--color-score)"
                    fillOpacity={0.2}
                    strokeWidth={2}
                  />
                </RadarChart>
              </ChartContainer>
              <div className="space-y-3 pt-1">
                <ColoredMetricRow label="Accuracy" value={evaluations.accuracy} icon={Target} />
                <ColoredMetricRow label="Relevance" value={evaluations.relevance} icon={MessageSquareText} />
                <ColoredMetricRow label="Coherence" value={evaluations.coherence} icon={Brain} />
                <ColoredMetricRow label="Helpfulness" value={evaluations.helpfulness} icon={Sparkles} />
              </div>
            </CardContent>
          </Card>

          {/* Safety & Grounding — narrower with gauges */}
          <Card className="border-border/50 lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Safety &amp; Grounding</CardTitle>
              <p className="text-xs text-muted-foreground">Toxicity and factual accuracy</p>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Toxicity Gauge */}
              <div className="rounded-lg border border-border/40 bg-muted/20 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground/60" />
                  <span className="text-xs font-medium">Toxicity Rate</span>
                </div>
                <ChartContainer config={toxicityGaugeConfig} className="mx-auto h-[100px] w-full">
                  <RadialBarChart
                    data={toxicityGaugeData}
                    startAngle={180}
                    endAngle={0}
                    innerRadius="70%"
                    outerRadius="100%"
                    cx="50%"
                    cy="80%"
                  >
                    <RadialBar
                      dataKey="value"
                      cornerRadius={6}
                      background={{ fill: "var(--muted)", opacity: 0.3 }}
                    />
                  </RadialBarChart>
                </ChartContainer>
                <div className="text-center -mt-2">
                  <span className="text-2xl font-bold tabular-nums tracking-tight">{toxicityPct.toFixed(1)}%</span>
                  <div className="mt-1 flex items-center justify-center gap-1">
                    {toxicitySafe ? (
                      <CircleCheckBig className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <TriangleAlert className="h-3 w-3 text-amber-500" />
                    )}
                    <span className={`text-[11px] font-medium ${toxicitySafe ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                      {toxicitySafe ? "Within safe threshold" : "Above threshold"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Groundedness Gauge */}
              <div className="rounded-lg border border-border/40 bg-muted/20 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Gauge className="h-3.5 w-3.5 text-muted-foreground/60" />
                  <span className="text-xs font-medium">Groundedness</span>
                </div>
                <ChartContainer config={groundednessGaugeConfig} className="mx-auto h-[100px] w-full">
                  <RadialBarChart
                    data={groundednessGaugeData}
                    startAngle={180}
                    endAngle={0}
                    innerRadius="70%"
                    outerRadius="100%"
                    cx="50%"
                    cy="80%"
                  >
                    <RadialBar
                      dataKey="value"
                      cornerRadius={6}
                      background={{ fill: "var(--muted)", opacity: 0.3 }}
                    />
                  </RadialBarChart>
                </ChartContainer>
                <div className="text-center -mt-2">
                  <span className="text-2xl font-bold tabular-nums tracking-tight">{groundednessPct.toFixed(1)}%</span>
                  <div className="mt-1 flex items-center justify-center gap-1">
                    {groundednessGood ? (
                      <CircleCheckBig className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <TriangleAlert className="h-3 w-3 text-amber-500" />
                    )}
                    <span className={`text-[11px] font-medium ${groundednessGood ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                      {groundednessGood ? "Meets target (> 80%)" : "Below target (> 80%)"}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Latency + Thresholds */}
        <div className="grid gap-3 lg:grid-cols-5">
          {/* Latency bar chart */}
          <Card className="border-border/50 lg:col-span-3">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-medium">Response Latency</CardTitle>
                  <p className="text-xs text-muted-foreground">P50 vs P95 vs target</p>
                </div>
                <div className="flex items-baseline gap-3">
                  <div className="flex items-baseline gap-1">
                    <Clock className="h-3 w-3 text-muted-foreground/50" />
                    <span className="text-[11px] text-muted-foreground/70 uppercase tracking-wider">P50</span>
                    <span className="text-sm font-bold tabular-nums">{evaluations.latencyP50}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">ms</span></span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <Activity className="h-3 w-3 text-muted-foreground/50" />
                    <span className="text-[11px] text-muted-foreground/70 uppercase tracking-wider">P95</span>
                    <span className="text-sm font-bold tabular-nums">{evaluations.latencyP95}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">ms</span></span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ChartContainer config={latencyBarConfig} className="h-[160px] w-full">
                <BarChart data={latencyBars} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.3} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} unit="ms" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} fillOpacity={0.7}>
                    {latencyBars.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Threshold status cards */}
          <Card className="border-border/50 lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Threshold Status</CardTitle>
              <p className="text-xs text-muted-foreground">Pass/fail against targets</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2.5">
                {thresholds.map((t) => (
                  <div
                    key={t.metric}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${
                      t.status
                        ? "border-emerald-200/50 bg-emerald-50/50 dark:border-emerald-900/30 dark:bg-emerald-950/20"
                        : "border-amber-200/50 bg-amber-50/50 dark:border-amber-900/30 dark:bg-amber-950/20"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {t.status ? (
                        <CircleCheckBig className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <TriangleAlert className="h-3.5 w-3.5 text-amber-500" />
                      )}
                      <div>
                        <span className="text-xs font-medium">{t.metric}</span>
                        <p className="text-[10px] text-muted-foreground">Target: {t.target}</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold tabular-nums">{t.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
