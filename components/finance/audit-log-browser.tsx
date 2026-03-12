import Link from "next/link"
import { FinanceHeader } from "@/components/finance/header"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type TrackingYearOption = {
  id: string
  year: number
  isActive: boolean
}

type AuditLog = {
  id: string
  entityType: string
  entityId: string | null
  action: string
  field: string
  oldValue: string | null
  newValue: string | null
  actorName: string | null
  actorEmail: string | null
  createdAt: Date
}

type AuditLogBrowserProps = {
  userName: string
  userEmail: string
  activeYear: number
  trackingYears: TrackingYearOption[]
  filters: {
    search: string
    user: string
    from: string
    to: string
  }
  logs: AuditLog[]
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export function AuditLogBrowser({
  userName,
  userEmail,
  activeYear,
  trackingYears,
  filters,
  logs,
}: AuditLogBrowserProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(187,108,37,0.16),_transparent_32%),linear-gradient(180deg,_rgba(255,250,243,1)_0%,_rgba(246,240,232,1)_100%)]">
      <FinanceHeader
        title="Audit Log"
        subtitle="Review data changes, who made them, and the before/after values."
        userName={userName}
        userEmail={userEmail}
        activeYear={activeYear}
        currentPath="/audit-log"
      />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <Card className="border-amber-200/70 bg-white/90">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>
              Search changes, filter by user, and restrict the date-time interval.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form method="GET" className="grid gap-4 lg:grid-cols-5">
              <div className="space-y-2">
                <label htmlFor="year" className="text-sm font-medium">
                  Year
                </label>
                <select
                  id="year"
                  name="year"
                  defaultValue={String(activeYear)}
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                >
                  {trackingYears.map((year) => (
                    <option key={year.id} value={year.year}>
                      {year.year}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="search" className="text-sm font-medium">
                  Change Search
                </label>
                <input
                  id="search"
                  name="search"
                  defaultValue={filters.search}
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                  placeholder="field, entity, value"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="user" className="text-sm font-medium">
                  User
                </label>
                <input
                  id="user"
                  name="user"
                  defaultValue={filters.user}
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                  placeholder="name or email"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="from" className="text-sm font-medium">
                  From
                </label>
                <input
                  id="from"
                  name="from"
                  type="datetime-local"
                  defaultValue={filters.from}
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="to" className="text-sm font-medium">
                  To
                </label>
                <input
                  id="to"
                  name="to"
                  type="datetime-local"
                  defaultValue={filters.to}
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                />
              </div>
              <div className="flex items-end gap-2 lg:col-span-5">
                <Button type="submit">Apply</Button>
                <Button asChild variant="outline">
                  <Link href={`/audit-log?year=${activeYear}`}>Reset</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-amber-200/70 bg-white/90">
          <CardHeader>
            <CardTitle>Changes</CardTitle>
            <CardDescription>
              Showing {logs.length} audit log rows for {activeYear}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>Original</TableHead>
                  <TableHead>New</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{formatDateTime(log.createdAt)}</TableCell>
                    <TableCell>
                      <div>{log.actorName || "Unknown user"}</div>
                      <div className="text-xs text-muted-foreground">
                        {log.actorEmail || "No email"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>{log.entityType}</div>
                      <div className="text-xs text-muted-foreground">
                        {log.entityId || "No entity id"}
                      </div>
                    </TableCell>
                    <TableCell>{log.action}</TableCell>
                    <TableCell>{log.field}</TableCell>
                    <TableCell className="max-w-xs break-words text-xs text-muted-foreground">
                      {log.oldValue || "—"}
                    </TableCell>
                    <TableCell className="max-w-xs break-words text-xs">
                      {log.newValue || "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      No audit log rows match the current filters.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
