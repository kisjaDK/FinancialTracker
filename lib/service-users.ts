import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { prisma } from "@/lib/prisma"
import type { AppRole } from "@/lib/roles"

export const SERVICE_API_KEY_PREFIX = "pnd_srv"
const SERVICE_API_KEY_ID_BYTES = 6
const SERVICE_API_KEY_SECRET_BYTES = 24
const SERVICE_API_KEY_PATTERN =
  /^pnd_srv_([a-f0-9]{12})_([A-Za-z0-9_-]{16,})$/

type ServiceUserActor = {
  role: AppRole
  email: string
  name?: string | null
}

function normalizeValue(value: string | null | undefined) {
  return value?.trim() ?? ""
}

export function hashServiceApiKey(apiKey: string) {
  return createHash("sha256").update(apiKey).digest("hex")
}

export function verifyServiceApiKeyHash(apiKey: string, keyHash: string) {
  const expected = Buffer.from(keyHash, "hex")
  const received = Buffer.from(hashServiceApiKey(apiKey), "hex")

  if (expected.length !== received.length) {
    return false
  }

  return timingSafeEqual(expected, received)
}

export function generateServiceApiKey() {
  const keyId = randomBytes(SERVICE_API_KEY_ID_BYTES).toString("hex")
  const secret = randomBytes(SERVICE_API_KEY_SECRET_BYTES).toString("base64url")
  const apiKey = `${SERVICE_API_KEY_PREFIX}_${keyId}_${secret}`

  return {
    apiKey,
    keyId,
    keyHash: hashServiceApiKey(apiKey),
  }
}

function parseApiKey(apiKey: string) {
  const trimmed = apiKey.trim()
  const match = SERVICE_API_KEY_PATTERN.exec(trimmed)

  if (!match) {
    return null
  }

  return {
    apiKey: trimmed,
    keyId: match[1],
  }
}

function assertServiceUserManagementRole(role: AppRole) {
  if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
    throw new Error("You are not allowed to manage service users.")
  }
}

export type ServiceUserListItem = {
  id: string
  label: string
  role: AppRole
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  createdByName: string | null
  createdByEmail: string | null
  deactivatedAt: Date | null
  currentKey: {
    id: string
    keyId: string
    name: string | null
    createdAt: Date
    lastUsedAt: Date | null
  } | null
}

export type AuthenticatedServiceUser = {
  id: string
  label: string
  role: AppRole
  keyId: string
}

export function isServiceApiKey(value: string | null | undefined) {
  return Boolean(value && SERVICE_API_KEY_PATTERN.test(value.trim()))
}

export async function listServiceUsers() {
  const serviceUsers = await prisma.serviceUser.findMany({
    include: {
      apiKeys: {
        where: {
          revokedAt: null,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
    },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  })

  return serviceUsers.map((serviceUser) => ({
    id: serviceUser.id,
    label: serviceUser.label,
    role: serviceUser.role,
    isActive: serviceUser.isActive,
    createdAt: serviceUser.createdAt,
    updatedAt: serviceUser.updatedAt,
    createdByName: serviceUser.createdByName,
    createdByEmail: serviceUser.createdByEmail,
    deactivatedAt: serviceUser.deactivatedAt,
    currentKey: serviceUser.apiKeys[0]
      ? {
          id: serviceUser.apiKeys[0].id,
          keyId: serviceUser.apiKeys[0].keyId,
          name: serviceUser.apiKeys[0].name,
          createdAt: serviceUser.apiKeys[0].createdAt,
          lastUsedAt: serviceUser.apiKeys[0].lastUsedAt,
        }
      : null,
  })) satisfies ServiceUserListItem[]
}

export async function createServiceUser(
  actor: ServiceUserActor,
  input: {
    label: string
    role?: AppRole
    keyName?: string
  }
) {
  assertServiceUserManagementRole(actor.role)

  const label = normalizeValue(input.label)
  if (!label) {
    throw new Error("Service user label is required.")
  }

  const role = input.role ?? "MEMBER"
  if (role !== "MEMBER") {
    throw new Error("Service users currently support MEMBER access only.")
  }

  const keyName = normalizeValue(input.keyName) || "Primary key"
  const keyMaterial = generateServiceApiKey()

  const created = await prisma.$transaction(async (transaction) => {
    const serviceUser = await transaction.serviceUser.create({
      data: {
        label,
        role,
        createdByName: normalizeValue(actor.name) || null,
        createdByEmail: actor.email,
      },
    })

    const apiKey = await transaction.serviceApiKey.create({
      data: {
        serviceUserId: serviceUser.id,
        keyId: keyMaterial.keyId,
        keyHash: keyMaterial.keyHash,
        name: keyName,
        createdByName: normalizeValue(actor.name) || null,
        createdByEmail: actor.email,
      },
    })

    return {
      serviceUser,
      apiKey,
    }
  })

  return {
    serviceUser: {
      id: created.serviceUser.id,
      label: created.serviceUser.label,
      role: created.serviceUser.role,
      isActive: created.serviceUser.isActive,
      createdAt: created.serviceUser.createdAt,
    },
    apiKey: keyMaterial.apiKey,
    keyId: created.apiKey.keyId,
  }
}

export async function rotateServiceUserApiKey(
  actor: ServiceUserActor,
  serviceUserId: string,
  keyName?: string
) {
  assertServiceUserManagementRole(actor.role)

  const normalizedId = normalizeValue(serviceUserId)
  if (!normalizedId) {
    throw new Error("Service user id is required.")
  }

  const keyMaterial = generateServiceApiKey()
  const normalizedKeyName = normalizeValue(keyName) || "Primary key"

  const rotated = await prisma.$transaction(async (transaction) => {
    const serviceUser = await transaction.serviceUser.findUnique({
      where: { id: normalizedId },
      select: {
        id: true,
        label: true,
        role: true,
        isActive: true,
      },
    })

    if (!serviceUser) {
      throw new Error("Service user not found.")
    }

    if (!serviceUser.isActive) {
      throw new Error("Inactive service users cannot receive new API keys.")
    }

    await transaction.serviceApiKey.updateMany({
      where: {
        serviceUserId: normalizedId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokedByName: normalizeValue(actor.name) || null,
        revokedByEmail: actor.email,
      },
    })

    const apiKey = await transaction.serviceApiKey.create({
      data: {
        serviceUserId: normalizedId,
        keyId: keyMaterial.keyId,
        keyHash: keyMaterial.keyHash,
        name: normalizedKeyName,
        createdByName: normalizeValue(actor.name) || null,
        createdByEmail: actor.email,
      },
    })

    return {
      serviceUser,
      apiKey,
    }
  })

  return {
    serviceUser: rotated.serviceUser,
    apiKey: keyMaterial.apiKey,
    keyId: rotated.apiKey.keyId,
  }
}

export async function revokeServiceUserApiKeys(
  actor: ServiceUserActor,
  serviceUserId: string
) {
  assertServiceUserManagementRole(actor.role)

  const normalizedId = normalizeValue(serviceUserId)
  if (!normalizedId) {
    throw new Error("Service user id is required.")
  }

  const existing = await prisma.serviceUser.findUnique({
    where: { id: normalizedId },
    select: {
      id: true,
    },
  })

  if (!existing) {
    throw new Error("Service user not found.")
  }

  await prisma.serviceApiKey.updateMany({
    where: {
      serviceUserId: normalizedId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
      revokedByName: normalizeValue(actor.name) || null,
      revokedByEmail: actor.email,
    },
  })

  return {
    serviceUserId: normalizedId,
  }
}

export async function setServiceUserActiveState(
  actor: ServiceUserActor,
  serviceUserId: string,
  isActive: boolean
) {
  assertServiceUserManagementRole(actor.role)

  const normalizedId = normalizeValue(serviceUserId)
  if (!normalizedId) {
    throw new Error("Service user id is required.")
  }

  const serviceUser = await prisma.serviceUser.update({
    where: { id: normalizedId },
    data: isActive
      ? {
          isActive: true,
          deactivatedAt: null,
          deactivatedByName: null,
          deactivatedByEmail: null,
        }
      : {
          isActive: false,
          deactivatedAt: new Date(),
          deactivatedByName: normalizeValue(actor.name) || null,
          deactivatedByEmail: actor.email,
        },
    select: {
      id: true,
      isActive: true,
      label: true,
      role: true,
      deactivatedAt: true,
    },
  })

  return serviceUser
}

export async function authenticateServiceApiKey(
  apiKey: string
): Promise<
  | { ok: true; serviceUser: AuthenticatedServiceUser }
  | { ok: false; status: 401 | 403; error: string }
> {
  const parsed = parseApiKey(apiKey)
  if (!parsed) {
    return {
      ok: false,
      status: 401,
      error: "Invalid API key.",
    }
  }

  const keyRecord = await prisma.serviceApiKey.findUnique({
    where: {
      keyId: parsed.keyId,
    },
    include: {
      serviceUser: {
        select: {
          id: true,
          label: true,
          role: true,
          isActive: true,
        },
      },
    },
  })

  if (!keyRecord || !verifyServiceApiKeyHash(parsed.apiKey, keyRecord.keyHash)) {
    return {
      ok: false,
      status: 401,
      error: "Invalid API key.",
    }
  }

  if (keyRecord.revokedAt) {
    return {
      ok: false,
      status: 403,
      error: "API key has been revoked.",
    }
  }

  if (!keyRecord.serviceUser.isActive) {
    return {
      ok: false,
      status: 403,
      error: "Service user is inactive.",
    }
  }

  await prisma.serviceApiKey.update({
    where: {
      id: keyRecord.id,
    },
    data: {
      lastUsedAt: new Date(),
    },
  })

  return {
    ok: true,
    serviceUser: {
      id: keyRecord.serviceUser.id,
      label: keyRecord.serviceUser.label,
      role: keyRecord.serviceUser.role,
      keyId: keyRecord.keyId,
    },
  }
}
