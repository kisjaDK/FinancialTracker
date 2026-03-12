export const APP_ROLES = ["GUEST", "MEMBER", "ADMIN", "SUPER_ADMIN"] as const

export type AppRole = (typeof APP_ROLES)[number]

export type AccessScope = {
  domain: string
  subDomain: string | null
}

export const ROLE_RANK: Record<AppRole, number> = {
  GUEST: 0,
  MEMBER: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
}

export function roleLabel(role: AppRole | null) {
  if (!role) {
    return "No role"
  }

  return role.replaceAll("_", " ").toLowerCase()
}
