"use client"

import { useEffect, useState, useMemo } from "react"
import { MessageSquare, CheckCircle, Activity, Hash, Search } from "lucide-react"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAnalyticsStore } from "@/store/analytics-store"

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/40",
    active: "bg-blue-50 text-blue-700 border-blue-200/60 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800/40",
    escalated: "bg-amber-50 text-amber-700 border-amber-200/60 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800/40",
  }
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${styles[status] || "bg-muted text-muted-foreground border-border"}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

export default function ConversationsPage() {
  const { conversations, isLoading, fetchAll } = useAnalyticsStore()

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [channelFilter, setChannelFilter] = useState("all")
  const [sort, setSort] = useState("newest")

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const channels = useMemo(
    () => [...new Set(conversations.map((c) => c.channel))],
    [conversations]
  )

  const statuses = useMemo(
    () => [...new Set(conversations.map((c) => c.status))],
    [conversations]
  )

  const filtered = useMemo(() => {
    let result = [...conversations]

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (c) =>
          c.sessionId.toLowerCase().includes(q) ||
          (c.userId && c.userId.toLowerCase().includes(q)) ||
          (c.topic && c.topic.toLowerCase().includes(q))
      )
    }

    if (statusFilter !== "all") {
      result = result.filter((c) => c.status === statusFilter)
    }

    if (channelFilter !== "all") {
      result = result.filter((c) => c.channel === channelFilter)
    }

    result.sort((a, b) => {
      switch (sort) {
        case "newest":
          return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
        case "oldest":
          return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
        case "messages":
          return b.messageCount - a.messageCount
        case "rating":
          return (b.satisfaction ?? 0) - (a.satisfaction ?? 0)
        default:
          return 0
      }
    })

    return result
  }, [conversations, search, statusFilter, channelFilter, sort])

  // KPI calculations
  const totalConversations = conversations.length
  const activeCount = conversations.filter((c) => c.status === "active").length
  const resolvedRate = totalConversations > 0
    ? (conversations.filter((c) => c.resolved).length / totalConversations) * 100
    : 0
  const avgMessages = totalConversations > 0
    ? conversations.reduce((sum, c) => sum + c.messageCount, 0) / totalConversations
    : 0

  if (isLoading) {
    return (
      <>
        <Header title="Conversations" />
        <div className="flex-1 space-y-3 p-4 lg:p-5">
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
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </>
    )
  }

  return (
    <>
      <Header title="Conversations" />
      <div className="flex-1 space-y-3 p-4 lg:p-5">

        {/* KPI Cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { title: "Total", value: totalConversations.toLocaleString(), icon: MessageSquare },
            { title: "Active", value: activeCount.toLocaleString(), icon: Activity },
            { title: "Resolved Rate", value: `${resolvedRate.toFixed(1)}%`, icon: CheckCircle },
            { title: "Avg Messages", value: avgMessages.toFixed(1), icon: Hash },
          ].map((card) => (
            <Card key={card.title} className="border-border/50">
              <CardContent className="flex items-center justify-between px-4 py-3.5">
                <div>
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    {card.title}
                  </span>
                  <div className="mt-1">
                    <span className="text-base font-semibold tracking-tight">{card.value}</span>
                  </div>
                </div>
                <card.icon className="h-4 w-4 text-muted-foreground/30" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filter Bar */}
        <Card className="border-border/50">
          <CardContent className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
                <Input
                  placeholder="Search sessions..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {statuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue placeholder="Channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Channels</SelectItem>
                  {channels.map((ch) => (
                    <SelectItem key={ch} value={ch}>
                      {ch.charAt(0).toUpperCase() + ch.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="oldest">Oldest</SelectItem>
                  <SelectItem value="messages">Most Messages</SelectItem>
                  <SelectItem value="rating">Highest Rating</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">All Conversations</CardTitle>
            <p className="text-xs text-muted-foreground">
              Showing {filtered.length} of {totalConversations} conversations
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 h-9">Session</TableHead>
                  <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 h-9">User</TableHead>
                  <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 h-9">Topic</TableHead>
                  <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 h-9">Channel</TableHead>
                  <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 h-9">Messages</TableHead>
                  <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 h-9">Rating</TableHead>
                  <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 h-9">Status</TableHead>
                  <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 h-9 text-right">Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((conv) => (
                  <TableRow key={conv.id} className="border-border/30">
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {conv.sessionId.slice(0, 12)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {conv.userId ? conv.userId.slice(0, 10) : "-"}
                    </TableCell>
                    <TableCell className="text-xs">{conv.topic || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[11px] font-normal border-border/50 text-muted-foreground">
                        {conv.channel}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums text-xs">{conv.messageCount}</TableCell>
                    <TableCell className="tabular-nums text-xs text-muted-foreground">
                      {conv.satisfaction !== null ? `${conv.satisfaction}/5` : "-"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={conv.status} />
                    </TableCell>
                    <TableCell className="text-right text-[11px] text-muted-foreground tabular-nums">
                      {new Date(conv.startedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
