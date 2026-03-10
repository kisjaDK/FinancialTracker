"use client"

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { useAnalyticsStore } from "@/store/analytics-store"
import { Skeleton } from "@/components/ui/skeleton"

const chartConfig = {
  totalConversations: {
    label: "Conversations",
    color: "var(--chart-1)",
  },
  uniqueUsers: {
    label: "Unique Users",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

export function ConversationVolumeChart() {
  const { dailyMetrics, isLoading } = useAnalyticsStore()

  if (isLoading || dailyMetrics.length === 0) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-36" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[280px] w-full" />
        </CardContent>
      </Card>
    )
  }

  const formatted = dailyMetrics.map((d) => ({
    ...d,
    date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }))

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Conversation Volume</CardTitle>
        <p className="text-xs text-muted-foreground">Last 30 days</p>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <AreaChart data={formatted} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="fillConversations" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-totalConversations)" stopOpacity={0.15} />
                <stop offset="100%" stopColor="var(--color-totalConversations)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="fillUsers" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-uniqueUsers)" stopOpacity={0.1} />
                <stop offset="100%" stopColor="var(--color-uniqueUsers)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.3} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              dataKey="totalConversations"
              type="monotone"
              fill="url(#fillConversations)"
              stroke="var(--color-totalConversations)"
              strokeWidth={1.5}
            />
            <Area
              dataKey="uniqueUsers"
              type="monotone"
              fill="url(#fillUsers)"
              stroke="var(--color-uniqueUsers)"
              strokeWidth={1.5}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
