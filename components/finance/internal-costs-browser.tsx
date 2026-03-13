"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { GuidanceHover } from "@/components/finance/guidance-hover"
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
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCurrency } from "@/lib/finance/format"
import type { AppRole } from "@/lib/roles"

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
}

type InternalCostsBrowserProps = {
  userName: string
  userEmail: string
  userRole: AppRole
  activeYear: number
  trackingYears: TrackingYearOption[]
  assumptions: CostAssumption[]
  internalActualsMessage: string | null
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
  userRole,
  activeYear,
  trackingYears,
  assumptions,
  internalActualsMessage,
}: InternalCostsBrowserProps) {
  const router = useRouter()
  const messageRef = useRef<HTMLTextAreaElement | null>(null)
  const [values, setValues] = useState({
    band: "",
    location: "",
    yearlyCost: "",
  })
  const [serviceMessage, setServiceMessage] = useState(internalActualsMessage ?? "")
  const [pendingDelete, setPendingDelete] = useState<{
    band: string
    location: string
  } | null>(null)

  function insertMarkdown(
    prefix: string,
    suffix = prefix,
    placeholder = "text"
  ) {
    const element = messageRef.current

    if (!element) {
      return
    }

    const start = element.selectionStart ?? serviceMessage.length
    const end = element.selectionEnd ?? serviceMessage.length
    const selected = serviceMessage.slice(start, end)
    const replacement = `${prefix}${selected || placeholder}${suffix}`
    const nextValue =
      serviceMessage.slice(0, start) + replacement + serviceMessage.slice(end)

    setServiceMessage(nextValue)

    requestAnimationFrame(() => {
      element.focus()
      const cursorStart = start + prefix.length
      const cursorEnd = cursorStart + (selected || placeholder).length
      element.setSelectionRange(cursorStart, cursorEnd)
    })
  }

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
        }),
      })
      toast.success("Internal cost saved")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed")
    }
  }

  async function saveServiceMessage() {
    try {
      await fetchJson("/api/service-messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          year: activeYear,
          key: "INTERNAL_ACTUALS",
          content: serviceMessage,
        }),
      })
      toast.success(serviceMessage.trim() ? "Service message saved" : "Service message cleared")
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
        userRole={userRole}
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

        <section className="grid gap-6 xl:grid-cols-2">
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

              <div className="flex gap-2">
                <Button onClick={saveAssumption}>Save</Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    setValues({
                      band: "",
                      location: "",
                      yearlyCost: "",
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
              <CardTitle>Service Message</CardTitle>
              <CardDescription>
                Year-scoped guidance for the internal actuals workflow.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="internal-actuals-service-message">Internal Actuals Message</Label>
                <GuidanceHover
                  content={serviceMessage}
                  label="Service message preview"
                  className="size-4"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => insertMarkdown("**", "**")}
                >
                  Bold
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => insertMarkdown("*", "*")}
                >
                  Italic
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => insertMarkdown("- ", "", "List item")}
                >
                  Bullet
                </Button>
              </div>
              <Textarea
                ref={messageRef}
                id="internal-actuals-service-message"
                value={serviceMessage}
                onChange={(event) => setServiceMessage(event.target.value)}
                placeholder="Use markdown for a year-level internal actuals message. Example: **Confirm leave dates** or - Copy only approved months"
                className="min-h-40"
              />
              <p className="text-xs text-muted-foreground">
                This message is shown on the internal actuals page and in the bulk copy dialog.
              </p>
              <div className="flex gap-2">
                <Button onClick={saveServiceMessage}>Save Message</Button>
                <Button variant="ghost" onClick={() => setServiceMessage("")}>
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

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
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
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
