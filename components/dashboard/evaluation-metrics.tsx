"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useAnalyticsStore } from "@/store/analytics-store"
import { Skeleton } from "@/components/ui/skeleton"

interface MetricRowProps {
  label: string
  value: number
  maxValue?: number
  format?: "percent" | "ms"
}

function MetricRow({ label, value, maxValue = 1, format = "percent" }: MetricRowProps) {
  const percentage = (value / maxValue) * 100
  const displayValue =
    format === "percent" ? `${(value * 100).toFixed(1)}%` : `${value}ms`

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-medium tabular-nums">{displayValue}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted/60">
        <div
          className="h-full rounded-full bg-foreground/15 transition-all duration-500"
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  )
}

export function EvaluationMetrics() {
  const { evaluations, isLoading } = useAnalyticsStore()

  if (isLoading || !evaluations) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-36" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-1.5 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border/50 h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Evaluation Metrics</CardTitle>
        <p className="text-xs text-muted-foreground">Automated quality scores</p>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-between">
        <div className="space-y-2.5">
          <MetricRow label="Accuracy" value={evaluations.accuracy} />
          <MetricRow label="Relevance" value={evaluations.relevance} />
          <MetricRow label="Coherence" value={evaluations.coherence} />
          <MetricRow label="Helpfulness" value={evaluations.helpfulness} />
        </div>
        <div className="flex items-center gap-4 border-t border-border/50 pt-3">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] text-muted-foreground/70 uppercase tracking-wider">P50</span>
            <span className="text-sm font-semibold tabular-nums">{evaluations.latencyP50}<span className="text-[11px] font-normal text-muted-foreground ml-0.5">ms</span></span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] text-muted-foreground/70 uppercase tracking-wider">P95</span>
            <span className="text-sm font-semibold tabular-nums">{evaluations.latencyP95}<span className="text-[11px] font-normal text-muted-foreground ml-0.5">ms</span></span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
