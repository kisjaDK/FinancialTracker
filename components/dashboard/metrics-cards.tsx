"use client"

import {
  ArrowDownRight,
  ArrowUpRight,
  MessageSquare,
  Clock,
  ThumbsUp,
  CheckCircle,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { useAnalyticsStore } from "@/store/analytics-store"
import { Skeleton } from "@/components/ui/skeleton"

function formatNumber(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return value.toLocaleString()
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms}ms`
}

function ChangeIndicator({ value }: { value: number }) {
  const isPositive = value > 0
  const Icon = isPositive ? ArrowUpRight : ArrowDownRight

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs tabular-nums ${
        isPositive
          ? "text-emerald-600/70 dark:text-emerald-400/70"
          : "text-red-500/70 dark:text-red-400/70"
      }`}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(value).toFixed(1)}%
    </span>
  )
}

export function MetricsCards() {
  const { metrics, isLoading } = useAnalyticsStore()

  if (isLoading || !metrics) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="border-border/50">
            <CardContent className="px-3 py-2.5">
              <Skeleton className="h-3 w-16 mb-1.5" />
              <Skeleton className="h-4 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const cards = [
    {
      title: "Conversations",
      value: formatNumber(metrics.totalConversations),
      change: metrics.changeFromPrevious.conversations,
      icon: MessageSquare,
    },
    {
      title: "Satisfaction",
      value: `${metrics.avgSatisfaction.toFixed(1)}/5`,
      change: metrics.changeFromPrevious.satisfaction,
      icon: ThumbsUp,
    },
    {
      title: "Resolution Rate",
      value: `${metrics.resolutionRate.toFixed(1)}%`,
      change: metrics.changeFromPrevious.resolutionRate,
      icon: CheckCircle,
    },
    {
      title: "Avg. Response",
      value: formatMs(metrics.avgResponseTimeMs),
      change: metrics.changeFromPrevious.responseTime,
      icon: Clock,
    },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title} className="border-border/50">
          <CardContent className="flex items-center justify-between px-4 py-3.5">
            <div>
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                {card.title}
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-base font-semibold tracking-tight">{card.value}</span>
                <ChangeIndicator value={card.change} />
              </div>
            </div>
            <card.icon className="h-4 w-4 text-muted-foreground/30" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
