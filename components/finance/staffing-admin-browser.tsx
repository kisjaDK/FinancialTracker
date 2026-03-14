"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { FinancePageIntro } from "@/components/finance/page-intro"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatNumber } from "@/lib/finance/format"
import type { StaffingTargetScopeLevel } from "@/lib/generated/prisma/client"
import type { StaffingTargetView } from "@/lib/finance/types"

type TrackingYearOption = {
  id: string
  year: number
  isActive: boolean
}

type HierarchyOptions = {
  domains: string[]
  subDomainsByDomain: {
    domain: string
    subDomains: string[]
  }[]
  projectCodesByScope: {
    domain: string
    subDomain: string
    projectCodes: string[]
  }[]
}

type StaffingAdminBrowserProps = {
  activeYear: number
  trackingYears: TrackingYearOption[]
  targets: StaffingTargetView[]
  hierarchyOptions: HierarchyOptions
}

type FormState = {
  id: string | null
  scopeLevel: StaffingTargetScopeLevel
  domain: string
  subDomain: string
  projectCode: string
  permTarget: string
}

const EMPTY_FORM: FormState = {
  id: null,
  scopeLevel: "DOMAIN",
  domain: "",
  subDomain: "",
  projectCode: "",
  permTarget: "",
}

async function fetchJson(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init)
  const body = await response.json()

  if (!response.ok) {
    throw new Error(body.error || "Request failed")
  }

  return body
}

export function StaffingAdminBrowser({
  activeYear,
  trackingYears,
  targets,
  hierarchyOptions,
}: StaffingAdminBrowserProps) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const subDomainOptions = useMemo(
    () =>
      hierarchyOptions.subDomainsByDomain.find((entry) => entry.domain === form.domain)?.subDomains ??
      [],
    [form.domain, hierarchyOptions.subDomainsByDomain]
  )
  const projectCodeOptions = useMemo(
    () =>
      hierarchyOptions.projectCodesByScope.find(
        (entry) => entry.domain === form.domain && entry.subDomain === form.subDomain
      )?.projectCodes ?? [],
    [form.domain, form.subDomain, hierarchyOptions.projectCodesByScope]
  )

  function resetForm() {
    setForm(EMPTY_FORM)
  }

  function startEdit(target: StaffingTargetView) {
    setForm({
      id: target.id,
      scopeLevel: target.scopeLevel,
      domain: target.domain,
      subDomain: target.subDomain || "",
      projectCode: target.projectCode || "",
      permTarget: String(target.permTarget),
    })
  }

  async function saveTarget() {
    setIsSaving(true)

    try {
      await fetchJson("/api/staffing-targets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: form.id,
          year: activeYear,
          scopeLevel: form.scopeLevel,
          domain: form.domain,
          subDomain: form.subDomain,
          projectCode: form.projectCode,
          permTarget: Number(form.permTarget),
        }),
      })
      toast.success(form.id ? "Staffing target updated" : "Staffing target created")
      resetForm()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed")
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteTarget(id: string) {
    setDeletingId(id)

    try {
      await fetchJson("/api/staffing-targets", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          year: activeYear,
        }),
      })
      toast.success("Staffing target deleted")
      if (form.id === id) {
        resetForm()
      }
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed")
    } finally {
      setDeletingId(null)
    }
  }

  return (
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 py-2">
        <FinancePageIntro
          title="Staffing Admin"
          subtitle="Manage year-scoped PERM targets for domains, sub-domains, and project codes."
        />
        <Card className="brand-card">
          <CardHeader>
            <CardTitle>Year</CardTitle>
            <CardDescription>Switch the planning year before maintaining staffing targets.</CardDescription>
          </CardHeader>
          <CardContent className="max-w-xs">
            <select
              value={String(activeYear)}
              onChange={(event) => router.push(`/staffing-admin?year=${event.target.value}`)}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              {trackingYears.map((year) => (
                <option key={year.id} value={year.year}>
                  {year.year}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>

        <Card className="brand-card">
          <CardHeader>
            <CardTitle>{form.id ? "Edit target" : "Create target"}</CardTitle>
            <CardDescription>
              Domain targets need only the domain. Sub-domain targets also require a sub-domain. Project targets require all three hierarchy levels.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-5">
            <div className="space-y-2">
              <label htmlFor="staffing-scope" className="text-sm font-medium">
                Scope
              </label>
              <select
                id="staffing-scope"
                value={form.scopeLevel}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    scopeLevel: event.target.value as StaffingTargetScopeLevel,
                    subDomain:
                      event.target.value === "DOMAIN" ? "" : current.subDomain,
                    projectCode:
                      event.target.value === "PROJECT" ? current.projectCode : "",
                  }))
                }
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="DOMAIN">Domain</option>
                <option value="SUB_DOMAIN">Sub-domain</option>
                <option value="PROJECT">Project</option>
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="staffing-domain-admin" className="text-sm font-medium">
                Domain
              </label>
              <select
                id="staffing-domain-admin"
                value={form.domain}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    domain: event.target.value,
                    subDomain: "",
                    projectCode: "",
                  }))
                }
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="">Select domain</option>
                {hierarchyOptions.domains.map((domain) => (
                  <option key={domain} value={domain}>
                    {domain}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="staffing-subdomain-admin" className="text-sm font-medium">
                Sub-domain
              </label>
              <select
                id="staffing-subdomain-admin"
                value={form.subDomain}
                disabled={!form.domain || form.scopeLevel === "DOMAIN"}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    subDomain: event.target.value,
                    projectCode: "",
                  }))
                }
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">
                  {form.scopeLevel === "DOMAIN" ? "Not required" : "Select sub-domain"}
                </option>
                {subDomainOptions.map((subDomain) => (
                  <option key={subDomain} value={subDomain}>
                    {subDomain}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="staffing-project-admin" className="text-sm font-medium">
                Project code
              </label>
              <select
                id="staffing-project-admin"
                value={form.projectCode}
                disabled={form.scopeLevel !== "PROJECT"}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    projectCode: event.target.value,
                  }))
                }
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">
                  {form.scopeLevel === "PROJECT" ? "Select project code" : "Not required"}
                </option>
                {projectCodeOptions.map((projectCode) => (
                  <option key={projectCode} value={projectCode}>
                    {projectCode}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="staffing-target-value" className="text-sm font-medium">
                Target PERM
              </label>
              <Input
                id="staffing-target-value"
                type="number"
                min="0"
                step="0.01"
                value={form.permTarget}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    permTarget: event.target.value,
                  }))
                }
              />
            </div>
            <div className="flex gap-3 md:col-span-5">
              <Button type="button" disabled={isSaving} onClick={() => void saveTarget()}>
                {isSaving ? "Saving..." : form.id ? "Update target" : "Create target"}
              </Button>
              <Button type="button" variant="outline" onClick={resetForm}>
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="brand-card">
          <CardHeader>
            <CardTitle>Saved targets</CardTitle>
            <CardDescription>All staffing targets configured for {activeYear}.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scope</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Sub-domain</TableHead>
                  <TableHead>Project code</TableHead>
                  <TableHead>Target PERM</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {targets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No staffing targets have been configured for this year.
                    </TableCell>
                  </TableRow>
                ) : null}
                {targets.map((target) => (
                  <TableRow key={target.id}>
                    <TableCell>{target.scopeLevel.replaceAll("_", " ")}</TableCell>
                    <TableCell>{target.domain}</TableCell>
                    <TableCell>{target.subDomain || "-"}</TableCell>
                    <TableCell>{target.projectCode || "-"}</TableCell>
                    <TableCell>{formatNumber(target.permTarget)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => startEdit(target)}>
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={deletingId === target.id}
                          onClick={() => void deleteTarget(target.id)}
                        >
                          {deletingId === target.id ? "Deleting..." : "Delete"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
  )
}
