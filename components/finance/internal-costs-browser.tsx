"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { FinanceHeader } from "@/components/finance/header"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCurrency } from "@/lib/finance/format"

type TrackingYearOption = {
  id: string
  year: number
  isActive: boolean
}

type CostAssumption = {
  id: string
  band: string
  location: string
  yearlyCost: number
  dailyCost: number
  notes: string | null
}

type InternalCostsBrowserProps = {
  userName: string
  userEmail: string
  activeYear: number
  trackingYears: TrackingYearOption[]
  assumptions: CostAssumption[]
}

async function fetchJson(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init)
  const body = await response.json()

  if (!response.ok) {
    throw new Error(body.error || "Request failed")
  }

  return body
}

export function InternalCostsBrowser({
  userName,
  userEmail,
  activeYear,
  trackingYears,
  assumptions,
}: InternalCostsBrowserProps) {
  const router = useRouter()
  const [values, setValues] = useState({
    band: "",
    location: "",
    yearlyCost: "",
    notes: "",
  })
  const [pendingDelete, setPendingDelete] = useState<{
    band: string
    location: string
  } | null>(null)

  async function saveAssumption() {
    try {
      await fetchJson("/api/cost-assumptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          year: activeYear,
          band: values.band,
          location: values.location,
          yearlyCost: Number(values.yearlyCost),
          notes: values.notes,
        }),
      })
      toast.success("Internal cost saved")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed")
    }
  }

  async function deleteAssumption(band: string, location: string) {
    try {
      await fetchJson("/api/cost-assumptions", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          year: activeYear,
          band,
          location,
        }),
      })
      toast.success("Internal cost deleted")
      setPendingDelete(null)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed")
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(187,108,37,0.16),_transparent_32%),linear-gradient(180deg,_rgba(255,250,243,1)_0%,_rgba(246,240,232,1)_100%)]">
      <FinanceHeader
        title="Internal Costs"
        subtitle="Maintain yearly internal cost assumptions by location and band."
        userName={userName}
        userEmail={userEmail}
        activeYear={activeYear}
        currentPath="/internal-costs"
      />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <AlertDialog
          open={Boolean(pendingDelete)}
          onOpenChange={(open) => {
            if (!open) {
              setPendingDelete(null)
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete internal cost?</AlertDialogTitle>
              <AlertDialogDescription>
                {pendingDelete
                  ? `This will remove the internal cost for ${pendingDelete.location}, band ${pendingDelete.band}. This action cannot be undone.`
                  : "This action cannot be undone."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  if (pendingDelete) {
                    void deleteAssumption(
                      pendingDelete.band,
                      pendingDelete.location
                    )
                  }
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Card className="border-amber-200/70 bg-white/90">
          <CardHeader>
            <CardTitle>Maintain Costs</CardTitle>
            <CardDescription>
              Edit an existing row or add a new internal cost assumption for the selected year.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="internal-cost-year">Year</Label>
              <select
                id="internal-cost-year"
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                value={String(activeYear)}
                onChange={(event) => {
                  router.push(`/internal-costs?year=${event.target.value}`)
                }}
              >
                {trackingYears.map((year) => (
                  <option key={year.id} value={year.year}>
                    {year.year}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="internal-band">Band</Label>
                <Input
                  id="internal-band"
                  value={values.band}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, band: event.target.value }))
                  }
                  placeholder="5"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="internal-location">Location</Label>
                <Input
                  id="internal-location"
                  value={values.location}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      location: event.target.value,
                    }))
                  }
                  placeholder="Denmark"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="internal-yearly-cost">Yearly Cost (DKK)</Label>
                <Input
                  id="internal-yearly-cost"
                  value={values.yearlyCost}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      yearlyCost: event.target.value,
                    }))
                  }
                  placeholder="1628000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="internal-notes">Notes</Label>
                <Input
                  id="internal-notes"
                  value={values.notes}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, notes: event.target.value }))
                  }
                  placeholder="Optional notes"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={saveAssumption}>Save</Button>
              <Button
                variant="ghost"
                onClick={() =>
                  setValues({
                    band: "",
                    location: "",
                    yearlyCost: "",
                    notes: "",
                  })
                }
              >
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-200/70 bg-white/90">
          <CardHeader>
            <CardTitle>Yearly Internal Costs</CardTitle>
            <CardDescription>
              Table view of all internal cost assumptions for {activeYear}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Location</TableHead>
                  <TableHead>Band</TableHead>
                  <TableHead>Yearly Cost</TableHead>
                  <TableHead>Daily Cost</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {assumptions.map((assumption) => (
                  <TableRow key={assumption.id}>
                    <TableCell>{assumption.location}</TableCell>
                    <TableCell>{assumption.band}</TableCell>
                    <TableCell>{formatCurrency(assumption.yearlyCost)}</TableCell>
                    <TableCell>{formatCurrency(assumption.dailyCost)}</TableCell>
                    <TableCell>{assumption.notes || "No notes"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setValues({
                              band: assumption.band,
                              location: assumption.location,
                              yearlyCost: String(assumption.yearlyCost),
                              notes: assumption.notes || "",
                            })
                          }
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setPendingDelete({
                              band: assumption.band,
                              location: assumption.location,
                            })
                          }
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {assumptions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No internal cost assumptions saved yet.
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
