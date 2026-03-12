"use client"

import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { FinanceHeader } from "@/components/finance/header"
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
import type { AppRole } from "@/lib/roles"

type TrackingYearOption = {
  id: string
  year: number
  isActive: boolean
}

type StatusDefinition = {
  id: string
  label: string
  isActiveStatus: boolean
  sortOrder: number
}

type StatusesBrowserProps = {
  userName: string
  userEmail: string
  userRole: AppRole
  activeYear: number
  trackingYears: TrackingYearOption[]
  statuses: StatusDefinition[]
}

async function fetchJson(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init)
  const body = await response.json()

  if (!response.ok) {
    throw new Error(body.error || "Request failed")
  }

  return body
}

export function StatusesBrowser({
  userName,
  userEmail,
  userRole,
  activeYear,
  trackingYears,
  statuses,
}: StatusesBrowserProps) {
  const router = useRouter()

  async function updateStatus(label: string, isActiveStatus: boolean) {
    try {
      await fetchJson("/api/status-definitions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          year: activeYear,
          label,
          isActiveStatus,
        }),
      })
      toast.success("Status mapping saved")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed")
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(187,108,37,0.16),_transparent_32%),linear-gradient(180deg,_rgba(255,250,243,1)_0%,_rgba(246,240,232,1)_100%)]">
      <FinanceHeader
        title="Statuses"
        subtitle="Maintain the allowed seat statuses and which of them count as active."
        userName={userName}
        userEmail={userEmail}
        userRole={userRole}
        activeYear={activeYear}
        currentPath="/statuses"
      />

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
        <Card className="border-amber-200/70 bg-white/90">
          <CardHeader>
            <CardTitle>Status Definitions</CardTitle>
            <CardDescription>
              The allowed statuses are fixed. Use the toggle to control which statuses count as active in the tracker.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="status-year" className="text-sm font-medium">
                Year
              </label>
              <select
                id="status-year"
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                value={String(activeYear)}
                onChange={(event) => {
                  router.push(`/statuses?year=${event.target.value}`)
                }}
              >
                {trackingYears.map((year) => (
                  <option key={year.id} value={year.year}>
                    {year.year}
                  </option>
                ))}
              </select>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Counts As Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statuses.map((status) => (
                  <TableRow key={status.id}>
                    <TableCell>{status.label}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={status.isActiveStatus}
                          onChange={(event) =>
                            void updateStatus(status.label, event.target.checked)
                          }
                        />
                        <span className="text-sm text-muted-foreground">
                          {status.isActiveStatus ? "Active" : "Not active"}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
              Statuses available: {statuses.map((status) => status.label).join(", ")}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
