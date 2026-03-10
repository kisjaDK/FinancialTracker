"use client"

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
import { useAnalyticsStore } from "@/store/analytics-store"
import { Skeleton } from "@/components/ui/skeleton"

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

export function RecentConversationsTable() {
  const { conversations, isLoading } = useAnalyticsStore()

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const recent = conversations.slice(0, 10)

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Recent Conversations</CardTitle>
        <p className="text-xs text-muted-foreground">Latest chatbot sessions</p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 h-9">Session</TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 h-9">Topic</TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 h-9">Channel</TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 h-9">Messages</TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 h-9">Rating</TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 h-9">Status</TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 h-9 text-right">Started</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recent.map((conv) => (
              <TableRow key={conv.id} className="border-border/30">
                <TableCell className="font-mono text-[11px] text-muted-foreground">{conv.sessionId.slice(0, 12)}</TableCell>
                <TableCell className="text-xs">{conv.topic || "-"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[11px] font-normal border-border/50 text-muted-foreground">{conv.channel}</Badge>
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
  )
}
