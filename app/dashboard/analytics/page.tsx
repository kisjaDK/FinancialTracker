"use client"

import { useEffect, useMemo } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { useAnalyticsStore } from "@/store/analytics-store"

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

const satisfactionConfig = {
  avgSatisfaction: { label: "Satisfaction", color: "var(--chart-1)" },
} satisfies ChartConfig

const resolutionConfig = {
  resolutionRate: { label: "Resolution Rate", color: "var(--chart-2)" },
} satisfies ChartConfig

const messagesConfig = {
  totalMessages: { label: "Messages", color: "var(--chart-3)" },
} satisfies ChartConfig

const composedConfig = {
  totalConversations: { label: "Conversations", color: "var(--chart-4)" },
  uniqueUsers: { label: "Unique Users", color: "var(--chart-1)" },
} satisfies ChartConfig

const channelPieConfig = {
  count: { label: "Conversations" },
} satisfies ChartConfig

const channelRadialConfig = {
  resolutionRate: { label: "Resolution %", color: "var(--chart-2)" },
} satisfies ChartConfig

const scatterConfig = {
  satisfaction: { label: "Satisfaction", color: "var(--chart-1)" },
} satisfies ChartConfig

const responseTimeConfig = {
  avgResponseTimeMs: { label: "Avg Response (ms)", color: "var(--chart-1)" },
} satisfies ChartConfig

export default function AnalyticsPage() {
  const { dailyMetrics, conversations, evaluations, isLoading, fetchAll } =
    useAnalyticsStore()

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const formatted = useMemo(
    () =>
      dailyMetrics.map((d) => ({
        ...d,
        date: new Date(d.date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
      })),
    [dailyMetrics]
  )

  // Channel stats derived from conversations
  const channelStats = useMemo(() => {
    const map = new Map<
      string,
      { count: number; totalMessages: number; totalSatisfaction: number; ratedCount: number; resolvedCount: number }
    >()
    for (const c of conversations) {
      const existing = map.get(c.channel) || {
        count: 0,
        totalMessages: 0,
        totalSatisfaction: 0,
        ratedCount: 0,
        resolvedCount: 0,
      }
      existing.count++
      existing.totalMessages += c.messageCount
      if (c.satisfaction !== null) {
        existing.totalSatisfaction += c.satisfaction
        existing.ratedCount++
      }
      if (c.resolved) existing.resolvedCount++
      map.set(c.channel, existing)
    }
    return Array.from(map.entries()).map(([channel, stats]) => ({
      channel,
      count: stats.count,
      avgMessages: stats.count > 0 ? stats.totalMessages / stats.count : 0,
      avgSatisfaction: stats.ratedCount > 0 ? stats.totalSatisfaction / stats.ratedCount : 0,
      resolutionRate: stats.count > 0 ? (stats.resolvedCount / stats.count) * 100 : 0,
    }))
  }, [conversations])

  // Topic performance derived from conversations
  const topicPerformance = useMemo(() => {
    const map = new Map<
      string,
      { count: number; totalMessages: number; totalSatisfaction: number; ratedCount: number; resolvedCount: number }
    >()
    for (const c of conversations) {
      const topic = c.topic || "Unknown"
      const existing = map.get(topic) || {
        count: 0,
        totalMessages: 0,
        totalSatisfaction: 0,
        ratedCount: 0,
        resolvedCount: 0,
      }
      existing.count++
      existing.totalMessages += c.messageCount
      if (c.satisfaction !== null) {
        existing.totalSatisfaction += c.satisfaction
        existing.ratedCount++
      }
      if (c.resolved) existing.resolvedCount++
      map.set(topic, existing)
    }
    return Array.from(map.entries())
      .map(([topic, stats]) => ({
        topic,
        count: stats.count,
        avgMessages: stats.count > 0 ? stats.totalMessages / stats.count : 0,
        avgSatisfaction: stats.ratedCount > 0 ? stats.totalSatisfaction / stats.ratedCount : 0,
        resolutionRate: stats.count > 0 ? (stats.resolvedCount / stats.count) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count)
  }, [conversations])

  // Scatter data: messages vs satisfaction per conversation
  const scatterData = useMemo(
    () =>
      conversations
        .filter((c) => c.satisfaction !== null)
        .map((c) => ({
          messages: c.messageCount,
          satisfaction: c.satisfaction as number,
          channel: c.channel,
        })),
    [conversations]
  )

  // Radial bar data for channel resolution rates
  const radialData = useMemo(
    () =>
      channelStats.map((ch, i) => ({
        channel: ch.channel,
        resolutionRate: Math.round(ch.resolutionRate),
        fill: CHART_COLORS[i % CHART_COLORS.length],
      })),
    [channelStats]
  )

  if (isLoading) {
    return (
      <>
        <Header title="Analytics" />
        <div className="flex-1 space-y-3 p-4 lg:p-5">
          <Skeleton className="h-9 w-64" />
          <div className="grid gap-3 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="border-border/50">
                <CardContent className="p-4">
                  <Skeleton className="h-[200px] w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Header title="Analytics" />
      <div className="flex-1 space-y-3 p-4 lg:p-5">

        <Tabs defaultValue="trends">
          <TabsList className="h-9">
            <TabsTrigger value="trends" className="text-xs">Trends</TabsTrigger>
            <TabsTrigger value="channels" className="text-xs">Channels</TabsTrigger>
            <TabsTrigger value="performance" className="text-xs">Performance</TabsTrigger>
          </TabsList>

          {/* Trends Tab */}
          <TabsContent value="trends" className="space-y-3">
            {/* Satisfaction Trend */}
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Satisfaction Trend</CardTitle>
                <p className="text-xs text-muted-foreground">Average rating over time</p>
              </CardHeader>
              <CardContent>
                <ChartContainer config={satisfactionConfig} className="h-[200px] w-full">
                  <LineChart data={formatted} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.3} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} domain={[0, 5]} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line dataKey="avgSatisfaction" type="monotone" stroke="var(--color-avgSatisfaction)" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <div className="grid gap-3 lg:grid-cols-2">
              {/* Resolution Rate */}
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Resolution Rate</CardTitle>
                  <p className="text-xs text-muted-foreground">Percentage resolved per day</p>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={resolutionConfig} className="h-[200px] w-full">
                    <AreaChart data={formatted} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <defs>
                        <linearGradient id="fillResolution" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-resolutionRate)" stopOpacity={0.15} />
                          <stop offset="100%" stopColor="var(--color-resolutionRate)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.3} />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Area dataKey="resolutionRate" type="monotone" fill="url(#fillResolution)" stroke="var(--color-resolutionRate)" strokeWidth={1.5} />
                    </AreaChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              {/* Message Volume */}
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Message Volume</CardTitle>
                  <p className="text-xs text-muted-foreground">Daily message count</p>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={messagesConfig} className="h-[200px] w-full">
                    <BarChart data={formatted} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.3} />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="totalMessages" fill="var(--color-totalMessages)" radius={[3, 3, 0, 0]} fillOpacity={0.7} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>

            {/* Conversations vs Users — ComposedChart */}
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Conversations vs Users</CardTitle>
                <p className="text-xs text-muted-foreground">Volume (bars) overlaid with unique users (line)</p>
              </CardHeader>
              <CardContent>
                <ChartContainer config={composedConfig} className="h-[200px] w-full">
                  <ComposedChart data={formatted} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.3} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="totalConversations" fill="var(--color-totalConversations)" radius={[3, 3, 0, 0]} fillOpacity={0.35} barSize={14} />
                    <Line dataKey="uniqueUsers" type="monotone" stroke="var(--color-uniqueUsers)" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Channels Tab */}
          <TabsContent value="channels" className="space-y-3">
            <div className="grid gap-3 lg:grid-cols-2">
              {/* Channel Distribution Donut */}
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Channel Distribution</CardTitle>
                  <p className="text-xs text-muted-foreground">Conversations by channel</p>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={channelPieConfig} className="mx-auto h-[200px] w-full">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent nameKey="channel" />} />
                      <Pie
                        data={channelStats}
                        dataKey="count"
                        nameKey="channel"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        strokeWidth={2}
                      >
                        {channelStats.map((_, index) => (
                          <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} fillOpacity={0.7} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <div className="mt-2 flex flex-wrap justify-center gap-3">
                    {channelStats.map((ch, i) => (
                      <div key={ch.channel} className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-[11px] text-muted-foreground">{ch.channel} ({ch.count})</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Channel Resolution — RadialBarChart */}
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Resolution by Channel</CardTitle>
                  <p className="text-xs text-muted-foreground">Resolution rate per channel</p>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={channelRadialConfig} className="mx-auto h-[200px] w-full">
                    <RadialBarChart
                      data={radialData}
                      innerRadius="25%"
                      outerRadius="90%"
                      startAngle={180}
                      endAngle={0}
                      cx="50%"
                      cy="75%"
                    >
                      <PolarAngleAxis type="number" domain={[0, 100]} tick={false} angleAxisId={0} />
                      <RadialBar
                        dataKey="resolutionRate"
                        cornerRadius={4}
                        background={{ fill: "var(--muted)", opacity: 0.3 }}
                        angleAxisId={0}
                      />
                      <ChartTooltip content={<ChartTooltipContent nameKey="channel" />} />
                    </RadialBarChart>
                  </ChartContainer>
                  <div className="mt-2 flex flex-wrap justify-center gap-3">
                    {radialData.map((ch) => (
                      <div key={ch.channel} className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ch.fill }} />
                        <span className="text-[11px] text-muted-foreground">{ch.channel} ({ch.resolutionRate}%)</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Channel Metrics Table — full width */}
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Channel Metrics</CardTitle>
                <p className="text-xs text-muted-foreground">Performance comparison</p>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 h-9">Channel</TableHead>
                      <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 h-9">Count</TableHead>
                      <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 h-9">Avg Msgs</TableHead>
                      <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 h-9">Satisfaction</TableHead>
                      <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 h-9 text-right">Resolved</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {channelStats.map((ch) => (
                      <TableRow key={ch.channel} className="border-border/30">
                        <TableCell className="text-xs font-medium">{ch.channel}</TableCell>
                        <TableCell className="text-xs tabular-nums">{ch.count}</TableCell>
                        <TableCell className="text-xs tabular-nums">{ch.avgMessages.toFixed(1)}</TableCell>
                        <TableCell className="text-xs tabular-nums">{ch.avgSatisfaction.toFixed(1)}/5</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{ch.resolutionRate.toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Performance Tab */}
          <TabsContent value="performance" className="space-y-3">
            {/* Response Time Trend */}
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Response Time Trend</CardTitle>
                <p className="text-xs text-muted-foreground">Average response time over time</p>
              </CardHeader>
              <CardContent>
                <ChartContainer config={responseTimeConfig} className="h-[200px] w-full">
                  <LineChart data={formatted} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.3} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line dataKey="avgResponseTimeMs" type="monotone" stroke="var(--color-avgResponseTimeMs)" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <div className="grid gap-3 lg:grid-cols-2">
              {/* Messages vs Satisfaction — ScatterChart */}
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Messages vs Satisfaction</CardTitle>
                  <p className="text-xs text-muted-foreground">Correlation between length and rating</p>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={scatterConfig} className="h-[200px] w-full">
                    <ScatterChart margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                      <XAxis dataKey="messages" name="Messages" type="number" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                      <YAxis dataKey="satisfaction" name="Rating" type="number" domain={[0, 5]} tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                      <ZAxis range={[20, 60]} />
                      <ChartTooltip content={<ChartTooltipContent />} cursor={{ strokeDasharray: "3 3" }} />
                      <Scatter data={scatterData} fill="var(--color-satisfaction)" fillOpacity={0.5} />
                    </ScatterChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              {/* Topic Performance */}
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Topic Performance</CardTitle>
                  <p className="text-xs text-muted-foreground">Metrics by conversation topic</p>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/50 hover:bg-transparent">
                        <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 h-9">Topic</TableHead>
                        <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 h-9">Count</TableHead>
                        <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 h-9">Rating</TableHead>
                        <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 h-9 text-right">Resolved</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topicPerformance.slice(0, 8).map((t) => (
                        <TableRow key={t.topic} className="border-border/30">
                          <TableCell className="text-xs">{t.topic}</TableCell>
                          <TableCell className="text-xs tabular-nums">{t.count}</TableCell>
                          <TableCell className="text-xs tabular-nums">{t.avgSatisfaction.toFixed(1)}/5</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{t.resolutionRate.toFixed(1)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
