import { prisma } from "@/lib/prisma"

export type AuditActor = {
  name?: string | null
  email?: string | null
}

type AuditChange = {
  field: string
  oldValue?: unknown
  newValue?: unknown
}

function serializeAuditValue(value: unknown) {
  if (value === undefined || value === null) {
    return null
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (typeof value === "object") {
    return JSON.stringify(value)
  }

  return String(value)
}

export function buildAuditChanges(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  fields?: string[]
) {
  const keys = fields ?? Array.from(new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]))

  return keys
    .map((field) => ({
      field,
      oldValue: before?.[field],
      newValue: after?.[field],
    }))
    .filter(
      (change) =>
        serializeAuditValue(change.oldValue) !== serializeAuditValue(change.newValue)
    )
}

export async function writeAuditLog(input: {
  trackingYearId?: string | null
  entityType: string
  entityId?: string | null
  action: string
  actor?: AuditActor
  changes: AuditChange[]
}) {
  if (input.changes.length === 0) {
    return
  }

  await prisma.auditLog.createMany({
    data: input.changes.map((change) => ({
      trackingYearId: input.trackingYearId ?? null,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      action: input.action,
      field: change.field,
      oldValue: serializeAuditValue(change.oldValue),
      newValue: serializeAuditValue(change.newValue),
      actorName: input.actor?.name ?? null,
      actorEmail: input.actor?.email ?? null,
    })),
  })
}
