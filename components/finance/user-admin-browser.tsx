"use client"

import { useMemo, useState } from "react"
import { Trash2 } from "lucide-react"
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
import { roleLabel, type AccessScope, type AppRole } from "@/lib/roles"

type UserRecord = {
  id: string
  email: string
  name: string | null
  role: AppRole
  scopes: AccessScope[]
}

type UserAdminBrowserProps = {
  users: UserRecord[]
  scopeOptions: AccessScope[]
  allowedRoles: AppRole[]
}

type EditableUser = {
  email: string
  name: string
  role: AppRole
  scopes: AccessScope[]
}

const EMPTY_SCOPE = {
  domain: "",
  subDomain: "",
}

function emptyForm(allowedRoles: AppRole[]): EditableUser {
  return {
    email: "",
    name: "",
    role: allowedRoles[0] ?? "GUEST",
    scopes: [{ ...EMPTY_SCOPE }],
  }
}

async function fetchJson(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init)
  const body = await response.json()

  if (!response.ok) {
    throw new Error(body.error || "Request failed")
  }

  return body
}

export function UserAdminBrowser({
  users,
  scopeOptions,
  allowedRoles,
}: UserAdminBrowserProps) {
  const router = useRouter()
  const [editingEmail, setEditingEmail] = useState<string | null>(null)
  const [form, setForm] = useState<EditableUser>(() => emptyForm(allowedRoles))

  const domainOptions = useMemo(
    () =>
      Array.from(
        new Set(scopeOptions.map((scope) => scope.domain).filter(Boolean))
      ).sort((left, right) => left.localeCompare(right)),
    [scopeOptions]
  )
  const subDomainOptionsByDomain = useMemo(() => {
    const options = new Map<string, string[]>()

    for (const scope of scopeOptions) {
      const domain = scope.domain.trim()
      const subDomain = scope.subDomain?.trim()

      if (!domain || !subDomain) {
        continue
      }

      const current = options.get(domain) ?? []
      if (!current.includes(subDomain)) {
        current.push(subDomain)
      }
      options.set(domain, current)
    }

    for (const values of options.values()) {
      values.sort((left, right) => left.localeCompare(right))
    }

    return options
  }, [scopeOptions])

  function startCreate() {
    setEditingEmail(null)
    setForm(emptyForm(allowedRoles))
  }

  function startEdit(user: UserRecord) {
    setEditingEmail(user.email)
    setForm({
      email: user.email,
      name: user.name ?? "",
      role: user.role,
      scopes:
        user.scopes.length > 0
          ? user.scopes.map((scope) => ({
              domain: scope.domain,
              subDomain: scope.subDomain ?? "",
            }))
          : [{ ...EMPTY_SCOPE }],
    })
  }

  async function saveUser() {
    try {
      await fetchJson("/api/user-admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: form.email,
          name: form.name,
          role: form.role,
          scopes: form.scopes
            .filter((scope) => scope.domain.trim())
            .map((scope) => ({
              domain: scope.domain,
              subDomain: scope.subDomain?.trim() || null,
            })),
        }),
      })
      toast.success(editingEmail ? "User access updated" : "User access created")
      router.refresh()
      startCreate()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed")
    }
  }

  async function removeUser(email: string) {
    if (!window.confirm(`Remove access for ${email}?`)) {
      return
    }

    try {
      await fetchJson("/api/user-admin", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      })
      toast.success("User removed")
      router.refresh()
      if (editingEmail === email) {
        startCreate()
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed")
    }
  }

  function updateScope(
    index: number,
    updater: (scope: EditableUser["scopes"][number]) => EditableUser["scopes"][number]
  ) {
    setForm((current) => ({
      ...current,
      scopes: current.scopes.map((entry, entryIndex) =>
        entryIndex === index ? updater(entry) : entry
      ),
    }))
  }

  return (
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 py-2">
        <FinancePageIntro
          title="User Admin"
          subtitle="Assign members, guests, and delegated admins to the finance tracker."
        />
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <Card className="w-full brand-card lg:w-[30rem] lg:flex-none">
            <CardHeader>
              <CardTitle>{editingEmail ? "Edit User" : "Add User"}</CardTitle>
              <CardDescription>
                Admins can manage guests and members. Super-admins can also promote members to admins. Super-admin accounts cannot be edited here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="user-email" className="text-sm font-medium">
                  Email
                </label>
                <Input
                  id="user-email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, email: event.target.value }))
                  }
                  placeholder="name@pandora.net"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="user-name" className="text-sm font-medium">
                  Name
                </label>
                <Input
                  id="user-name"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Optional display name"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="user-role" className="text-sm font-medium">
                  Role
                </label>
                <select
                  id="user-role"
                  value={form.role}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      role: event.target.value as AppRole,
                    }))
                  }
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                >
                  {allowedRoles.map((role) => (
                    <option key={role} value={role}>
                      {roleLabel(role)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Assigned Scopes</p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        scopes: [
                          ...current.scopes,
                          {
                            ...EMPTY_SCOPE,
                            domain: current.scopes.at(-1)?.domain ?? "",
                          },
                        ],
                      }))
                    }
                  >
                    Add Scope
                  </Button>
                </div>

                {form.scopes.map((scope, index) => (
                  <div key={`${index}-${scope.domain}-${scope.subDomain}`} className="grid gap-3 rounded-xl border border-border/70 p-3 md:grid-cols-[1fr_1fr_auto]">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Domain</label>
                      <select
                        value={scope.domain}
                        onChange={(event) =>
                          updateScope(index, (entry) => ({
                            ...entry,
                            domain: event.target.value,
                            subDomain: "",
                          }))
                        }
                        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                      >
                        <option value="">Select domain</option>
                        {domainOptions.map((domain) => (
                          <option key={domain} value={domain}>
                            {domain}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Sub-domain</label>
                      <select
                        value={scope.subDomain ?? ""}
                        onChange={(event) =>
                          updateScope(index, (entry) => ({
                            ...entry,
                            subDomain: event.target.value,
                          }))
                        }
                        disabled={!scope.domain}
                        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <option value="">
                          {scope.domain ? "All sub-domains" : "Select domain first"}
                        </option>
                        {(subDomainOptionsByDomain.get(scope.domain) ?? []).map((subDomain) => (
                          <option key={`${scope.domain}-${subDomain}`} value={subDomain}>
                            {subDomain}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            scopes:
                              current.scopes.length === 1
                                ? [{ ...EMPTY_SCOPE }]
                                : current.scopes.filter((_, entryIndex) => entryIndex !== index),
                          }))
                        }
                        aria-label={`Remove scope ${index + 1}`}
                        title="Remove scope"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <Button type="button" onClick={saveUser}>
                  {editingEmail ? "Save Changes" : "Create User"}
                </Button>
                <Button type="button" variant="outline" onClick={startCreate}>
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="min-w-0 flex-1 brand-card">
            <CardHeader>
              <CardTitle>Assigned Users</CardTitle>
              <CardDescription>
                Roles are keyed by login email. Scopes restrict what each user can see when assigned.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="w-[34%]">Scopes</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="font-medium">{user.name || "Unnamed user"}</div>
                        <div className="text-xs text-muted-foreground">{user.email}</div>
                      </TableCell>
                      <TableCell className="capitalize">{roleLabel(user.role)}</TableCell>
                      <TableCell className="max-w-0 whitespace-normal break-words text-sm text-muted-foreground">
                        {user.scopes.length > 0
                          ? user.scopes
                              .map((scope) =>
                                scope.subDomain
                                  ? `${scope.domain} / ${scope.subDomain}`
                                  : scope.domain
                              )
                              .join(", ")
                          : "All assigned data"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => startEdit(user)}
                            disabled={user.role === "SUPER_ADMIN"}
                            title={
                              user.role === "SUPER_ADMIN"
                                ? "Super-admin accounts cannot be edited"
                                : undefined
                            }
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => removeUser(user.email)}
                            disabled={user.role === "SUPER_ADMIN"}
                            aria-label={`Remove ${user.email}`}
                            title={
                              user.role === "SUPER_ADMIN"
                                ? "Super-admin accounts cannot be removed"
                                : "Remove user"
                            }
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </main>
  )
}
