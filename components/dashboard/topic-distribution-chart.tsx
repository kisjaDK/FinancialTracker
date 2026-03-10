"use client"

import { Cell, Pie, PieChart } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { useAnalyticsStore } from "@/store/analytics-store"
import { Skeleton } from "@/components/ui/skeleton"

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "oklch(0.62 0.04 200)",
  "oklch(0.55 0.04 290)",
]

export function TopicDistributionChart() {
  const { topicDistribution, isLoading } = useAnalyticsStore()

  if (isLoading || topicDistribution.length === 0) {
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

  const chartConfig = topicDistribution.reduce(
    (acc, item, i) => {
      acc[item.topic] = {
        label: item.topic,
        color: COLORS[i % COLORS.length],
      }
      return acc
    },
    {} as ChartConfig
  )

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Topic Distribution</CardTitle>
        <p className="text-xs text-muted-foreground">Conversation topics breakdown</p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col lg:flex-row items-center gap-8">
          <ChartContainer config={chartConfig} className="h-[200px] w-[200px] shrink-0">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent nameKey="topic" />} />
              <Pie
                data={topicDistribution}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={2}
                dataKey="count"
                nameKey="topic"
                strokeWidth={0}
              >
                {topicDistribution.map((_, index) => (
                  <Cell
                    key={index}
                    fill={COLORS[index % COLORS.length]}
                    fillOpacity={0.75}
                  />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="grid gap-2.5 text-sm w-full">
            {topicDistribution.map((item, i) => (
              <div key={item.topic} className="flex items-center gap-2.5">
                <div
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: COLORS[i % COLORS.length], opacity: 0.75 }}
                />
                <span className="text-muted-foreground text-xs">{item.topic}</span>
                <span className="ml-auto text-xs font-medium tabular-nums">{item.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
