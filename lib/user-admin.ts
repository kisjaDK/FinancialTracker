import { prisma } from "@/lib/prisma"
import { APP_ROLES, type AccessScope, type AppRole } from "@/lib/roles"
import {
  canManageRole,
  filterByScopes,
  normalizeEmail,
} from "@/lib/authz"
import { listServiceUsers } from "@/lib/service-users"

type UserMutationInput = {
  email: string
  name?: string
  role: AppRole
  scopes: AccessScope[]
}

function normalizeValue(value: string | null | undefined) {
  return value?.trim() ?? ""
}

function normalizeScope(scope: AccessScope) {
  const domain = normalizeValue(scope.domain)
  const subDomain = normalizeValue(scope.subDomain) || null

  if (!domain) {
    throw new Error("Domain is required for every assigned scope.")
  }

  return {
    domain,
    subDomain,
  }
}

export async function getUserAdminPageData(viewer: {
  role: AppRole
  scopes: AccessScope[]
}) {
  const [users, budgetAreas, trackerSeats, mappings, trackingYears, serviceUsers] = await Promise.all([
    prisma.appUser.findMany({
      include: {
        scopes: {
          orderBy: [{ domain: "asc" }, { subDomain: "asc" }],
        },
      },
      orderBy: [{ role: "desc" }, { email: "asc" }],
    }),
    prisma.budgetArea.findMany({
      select: {
        domain: true,
        subDomain: true,
      },
      distinct: ["domain", "subDomain"],
      orderBy: [{ domain: "asc" }, { subDomain: "asc" }],
    }),
    prisma.trackerSeat.findMany({
      select: {
        domain: true,
        subDomain: true,
      },
      distinct: ["domain", "subDomain"],
      orderBy: [{ domain: "asc" }, { subDomain: "asc" }],
    }),
    prisma.departmentMapping.findMany({
      select: {
        domain: true,
        subDomain: true,
      },
      distinct: ["domain", "subDomain"],
      orderBy: [{ domain: "asc" }, { subDomain: "asc" }],
    }),
    prisma.trackingYear.findMany({
      orderBy: [{ year: "asc" }],
      select: {
        year: true,
        isActive: true,
      },
    }),
    listServiceUsers(),
  ])

  const scopeOptions = filterByScopes(
    [...budgetAreas, ...trackerSeats, ...mappings]
      .filter((entry) => entry.domain)
      .map((entry) => ({
        domain: normalizeValue(entry.domain),
        subDomain: normalizeValue(entry.subDomain) || null,
      })),
    viewer,
    (entry) => entry
  )
    .reduce<Map<string, AccessScope>>((map, scope) => {
      const key = `${scope.domain}::${scope.subDomain ?? ""}`
      if (!map.has(key)) {
        map.set(key, scope)
      }
      return map
    }, new Map())

  const allowedRoles =
    viewer.role === "SUPER_ADMIN"
      ? APP_ROLES.filter((role) => role !== "SUPER_ADMIN")
      : (["GUEST", "MEMBER"] as AppRole[])

  return {
    activeYear:
      trackingYears.find((entry) => entry.isActive)?.year ??
      trackingYears.at(-1)?.year ??
      new Date().getFullYear(),
    users: users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      scopes: user.scopes.map((scope) => ({
        domain: scope.domain,
        subDomain: scope.subDomain,
      })),
    })),
    scopeOptions: Array.from(scopeOptions.values()).sort((left, right) => {
      if (left.domain !== right.domain) {
        return left.domain.localeCompare(right.domain)
      }

      return (left.subDomain ?? "").localeCompare(right.subDomain ?? "")
    }),
    allowedRoles,
    serviceUsers,
  }
}

export async function saveUserAccess(
  actor: {
    role: AppRole
    email: string
  },
  input: UserMutationInput
) {
  const email = normalizeEmail(input.email)
  if (!email) {
    throw new Error("Email is required.")
  }

  if (!APP_ROLES.includes(input.role)) {
    throw new Error("Invalid role.")
  }

  const currentUser = await prisma.appUser.findUnique({
    where: { email },
    include: {
      scopes: true,
    },
  })

  if (!canManageRole(actor.role, currentUser?.role ?? null, input.role)) {
    throw new Error("You are not allowed to assign that role.")
  }

  const scopes = input.scopes.map(normalizeScope)
  if (input.role === "GUEST" && scopes.every((scope) => !scope.subDomain)) {
    throw new Error("Guests must be assigned at least one sub-domain scope.")
  }

  const user = await prisma.appUser.upsert({
    where: { email },
    update: {
      name: normalizeValue(input.name) || null,
      role: input.role,
      scopes: {
        deleteMany: {},
        create: scopes,
      },
    },
    create: {
      email,
      name: normalizeValue(input.name) || null,
      role: input.role,
      scopes: {
        create: scopes,
      },
    },
    include: {
      scopes: {
        orderBy: [{ domain: "asc" }, { subDomain: "asc" }],
      },
    },
  })

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    scopes: user.scopes.map((scope) => ({
      domain: scope.domain,
      subDomain: scope.subDomain,
    })),
    updatedBy: actor.email,
  }
}

export async function deleteUserAccess(
  actor: {
    role: AppRole
  },
  emailInput: string
) {
  const email = normalizeEmail(emailInput)
  if (!email) {
    throw new Error("Email is required.")
  }

  const user = await prisma.appUser.findUnique({
    where: { email },
  })

  if (!user) {
    return { email }
  }

  if (!canManageRole(actor.role, user.role, null)) {
    throw new Error("You are not allowed to remove that user.")
  }

  await prisma.appUser.delete({
    where: { email },
  })

  return {
    email,
  }
}
