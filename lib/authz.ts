import { redirect } from "next/navigation"
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import {
  ROLE_RANK,
  type AccessScope,
  type AppRole,
} from "@/lib/roles"

export type AppViewer = {
  id: string | null
  name: string
  email: string
  role: AppRole | null
  scopes: AccessScope[]
}

function normalizeValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ""
}

export function normalizeEmail(email: string | null | undefined) {
  return normalizeValue(email)
}

function normalizeScope(scope: AccessScope) {
  return {
    domain: scope.domain.trim(),
    subDomain: scope.subDomain?.trim() || null,
  }
}

function getConfiguredSuperAdminEmail() {
  return normalizeEmail(process.env.SUPER_ADMIN_EMAIL)
}

async function ensureSuperAdmin(email: string, name?: string | null) {
  const superAdminEmail = getConfiguredSuperAdminEmail()
  if (!superAdminEmail || email !== superAdminEmail) {
    return null
  }

  return prisma.appUser.upsert({
    where: { email },
    update: {
      name: name?.trim() || undefined,
      role: "SUPER_ADMIN",
    },
    create: {
      email,
      name: name?.trim() || null,
      role: "SUPER_ADMIN",
    },
    include: {
      scopes: {
        orderBy: [{ domain: "asc" }, { subDomain: "asc" }],
      },
    },
  })
}

export async function getViewer() {
  const session = await auth()
  const email = normalizeEmail(session?.user?.email)

  if (!session?.user || !email) {
    return null
  }

  const name = session.user.name?.trim() || "Pandora user"
  const seededSuperAdmin = await ensureSuperAdmin(email, session.user.name)
  const appUser =
    seededSuperAdmin ??
    (await prisma.appUser.findUnique({
      where: { email },
      include: {
        scopes: {
          orderBy: [{ domain: "asc" }, { subDomain: "asc" }],
        },
      },
    }))

  if (!appUser && session.user.name) {
    return {
      id: null,
      name,
      email,
      role: null,
      scopes: [],
    } satisfies AppViewer
  }

  if (appUser && appUser.name !== session.user.name) {
    await prisma.appUser.update({
      where: { id: appUser.id },
      data: {
        name: session.user.name,
      },
    })
  }

  return {
    id: appUser?.id ?? null,
    name,
    email,
    role: appUser?.role ?? null,
    scopes: (appUser?.scopes ?? []).map((scope) => normalizeScope(scope)),
  } satisfies AppViewer
}

export function hasRequiredRole(
  role: AppRole | null,
  minimumRole: AppRole
) {
  if (!role) {
    return false
  }

  return ROLE_RANK[role] >= ROLE_RANK[minimumRole]
}

export function hasScopeRestrictions(viewer: Pick<AppViewer, "role" | "scopes">) {
  return viewer.role !== "SUPER_ADMIN" && viewer.scopes.length > 0
}

export function matchesAccessScope(
  scopes: AccessScope[],
  domain: string | null | undefined,
  subDomain: string | null | undefined
) {
  if (scopes.length === 0) {
    return true
  }

  const normalizedDomain = normalizeValue(domain)
  const normalizedSubDomain = normalizeValue(subDomain)

  return scopes.some((scope) => {
    const scopeDomain = normalizeValue(scope.domain)
    const scopeSubDomain = normalizeValue(scope.subDomain)

    if (scopeSubDomain) {
      return normalizedSubDomain === scopeSubDomain
    }

    return normalizedDomain === scopeDomain
  })
}

export function hasFullDomainAccess(
  viewer: Pick<AppViewer, "role" | "scopes">,
  domain: string | null | undefined
) {
  const normalizedDomain = normalizeValue(domain)
  if (!normalizedDomain) {
    return false
  }

  if (!hasScopeRestrictions(viewer)) {
    return true
  }

  return viewer.scopes.some((scope) => {
    const scopeDomain = normalizeValue(scope.domain)
    const scopeSubDomain = normalizeValue(scope.subDomain)

    return scopeDomain === normalizedDomain && scopeSubDomain.length === 0
  })
}

export function filterByScopes<T>(
  items: T[],
  viewer: Pick<AppViewer, "role" | "scopes">,
  getScope: (item: T) => { domain: string | null | undefined; subDomain: string | null | undefined }
) {
  if (!hasScopeRestrictions(viewer)) {
    return items
  }

  return items.filter((item) => {
    const scope = getScope(item)
    return matchesAccessScope(viewer.scopes, scope.domain, scope.subDomain)
  })
}

export async function getAdminContactEmails() {
  const users = await prisma.appUser.findMany({
    where: {
      role: {
        in: ["ADMIN", "SUPER_ADMIN"],
      },
    },
    orderBy: [{ role: "desc" }, { email: "asc" }],
    select: {
      email: true,
    },
  })

  const emails = new Set(users.map((user) => user.email))
  const superAdminEmail = getConfiguredSuperAdminEmail()
  if (superAdminEmail) {
    emails.add(superAdminEmail)
  }

  return Array.from(emails).sort((left, right) => left.localeCompare(right))
}

export async function requirePageAccess(
  minimumRole: AppRole
): Promise<AppViewer & { role: AppRole }> {
  const viewer = await getViewer()

  if (!viewer) {
    redirect("/login")
  }

  if (!viewer.role) {
    redirect("/access-request")
  }

  if (!hasRequiredRole(viewer.role, minimumRole)) {
    redirect("/unauthorized")
  }

  return viewer as AppViewer & { role: AppRole }
}

export async function requireSignedInViewer() {
  const viewer = await getViewer()

  if (!viewer) {
    redirect("/login")
  }

  return viewer
}

export async function requireApiAccess(
  minimumRole: AppRole
): Promise<NextResponse | (AppViewer & { role: AppRole })> {
  const viewer = await getViewer()

  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!viewer.role || !hasRequiredRole(viewer.role, minimumRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return viewer as AppViewer & { role: AppRole }
}

export function canManageRole(
  actorRole: AppRole,
  currentRole: AppRole | null,
  nextRole: AppRole | null
) {
  if (currentRole === "SUPER_ADMIN") {
    return false
  }

  if (actorRole === "SUPER_ADMIN") {
    if (nextRole === "SUPER_ADMIN") {
      return false
    }

    if (nextRole === "ADMIN") {
      return currentRole === "MEMBER" || currentRole === "ADMIN"
    }

    if (currentRole === "ADMIN") {
      return false
    }

    return nextRole === "MEMBER" || nextRole === "GUEST" || nextRole === null
  }

  if (actorRole !== "ADMIN") {
    return false
  }

  if (currentRole === "ADMIN") {
    return false
  }

  return nextRole === "MEMBER" || nextRole === "GUEST" || nextRole === null
}

export function isManageableBy(actorRole: AppRole, targetRole: AppRole | null) {
  return canManageRole(actorRole, targetRole, targetRole)
}
