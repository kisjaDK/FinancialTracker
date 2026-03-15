import type { AppRole } from "@/lib/roles"
import { buildAuditChanges, writeAuditLog } from "@/lib/finance/audit"
import { prisma } from "@/lib/prisma"

type FeatureRequestActor = {
  id: string | null
  name: string
  email: string
  role: AppRole
}

type FeatureRequestRecord = Awaited<
  ReturnType<typeof prisma.featureRequest.findFirstOrThrow>
>

export type FeatureRequestItem = {
  id: string
  title: string
  userStory: string
  problemContext: string
  createdByName: string
  createdByEmail: string
  createdAt: string
  updatedAt: string
  votesCount: number
  hasVoted: boolean
  isHidden: boolean
  deletionRequestedAt: string | null
  canEdit: boolean
  canRequestDeletion: boolean
  canHide: boolean
  canDelete: boolean
}

function requireActorId(actor: FeatureRequestActor) {
  if (!actor.id) {
    throw new Error("A stored user account is required for this action.")
  }

  return actor.id
}

function normalizeText(value: string | null | undefined) {
  return value?.trim() ?? ""
}

function validateFeatureRequestInput(input: {
  title: string
  userStory: string
  problemContext: string
}) {
  const title = normalizeText(input.title)
  const userStory = normalizeText(input.userStory)
  const problemContext = normalizeText(input.problemContext)

  if (!title) {
    throw new Error("Title is required.")
  }

  if (!userStory) {
    throw new Error("User story is required.")
  }

  if (!problemContext) {
    throw new Error("Problem / Context is required.")
  }

  return {
    title,
    userStory,
    problemContext,
  }
}

function canModerateFeatureRequests(role: AppRole) {
  return role === "SUPER_ADMIN"
}

function canViewHiddenFeatureRequests(role: AppRole) {
  return role === "SUPER_ADMIN"
}

function canEditFeatureRequest(actor: FeatureRequestActor, request: FeatureRequestRecord) {
  return canModerateFeatureRequests(actor.role) || request.createdByUserId === actor.id
}

function canRequestFeatureRequestDeletion(
  actor: FeatureRequestActor,
  request: FeatureRequestRecord
) {
  return request.createdByUserId === actor.id && !canModerateFeatureRequests(actor.role)
}

function mapFeatureRequestItem(args: {
  actor: FeatureRequestActor
  request: FeatureRequestRecord & {
    votes: Array<{ userId: string }>
  }
}): FeatureRequestItem {
  const { actor, request } = args

  return {
    id: request.id,
    title: request.title,
    userStory: request.userStory,
    problemContext: request.problemContext,
    createdByName: request.createdByName,
    createdByEmail: request.createdByEmail,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    votesCount: request.votesCount,
    hasVoted: request.votes.some((vote) => vote.userId === actor.id),
    isHidden: request.isHidden,
    deletionRequestedAt: request.deletionRequestedAt?.toISOString() ?? null,
    canEdit: canEditFeatureRequest(actor, request),
    canRequestDeletion: canRequestFeatureRequestDeletion(actor, request),
    canHide: canModerateFeatureRequests(actor.role),
    canDelete: canModerateFeatureRequests(actor.role),
  }
}

async function resolveActiveYear() {
  const trackingYears = await prisma.trackingYear.findMany({
    orderBy: [{ year: "asc" }],
    select: {
      year: true,
      isActive: true,
    },
  })

  return (
    trackingYears.find((entry) => entry.isActive)?.year ??
    trackingYears.at(-1)?.year ??
    new Date().getFullYear()
  )
}

async function getFeatureRequestOrThrow(id: string) {
  const featureRequest = await prisma.featureRequest.findUnique({
    where: { id },
    include: {
      votes: {
        select: {
          userId: true,
        },
      },
    },
  })

  if (!featureRequest) {
    throw new Error("Feature request not found.")
  }

  return featureRequest
}

export async function listFeatureRequests(actor: FeatureRequestActor) {
  const requests = await prisma.featureRequest.findMany({
    where: canViewHiddenFeatureRequests(actor.role) ? undefined : { isHidden: false },
    orderBy: [{ votesCount: "desc" }, { createdAt: "desc" }],
    include: {
      votes: {
        select: {
          userId: true,
        },
      },
    },
  })

  return requests.map((request) => mapFeatureRequestItem({ actor, request }))
}

export async function getFeatureRequestsPageData(actor: FeatureRequestActor) {
  const [activeYear, featureRequests] = await Promise.all([
    resolveActiveYear(),
    listFeatureRequests(actor),
  ])

  return {
    activeYear,
    featureRequests,
  }
}

export async function createFeatureRequest(
  actor: FeatureRequestActor,
  input: {
    title: string
    userStory: string
    problemContext: string
  }
) {
  const actorId = requireActorId(actor)
  const values = validateFeatureRequestInput(input)

  const featureRequest = await prisma.featureRequest.create({
    data: {
      ...values,
      createdByUserId: actorId,
      createdByName: actor.name,
      createdByEmail: actor.email,
    },
    include: {
      votes: {
        select: {
          userId: true,
        },
      },
    },
  })

  await writeAuditLog({
    entityType: "FeatureRequest",
    entityId: featureRequest.id,
    action: "CREATE",
    actor,
    changes: buildAuditChanges(null, featureRequest, [
      "title",
      "userStory",
      "problemContext",
      "createdByEmail",
      "votesCount",
      "isHidden",
    ]),
  })

  return mapFeatureRequestItem({ actor, request: featureRequest })
}

export async function updateFeatureRequest(
  actor: FeatureRequestActor,
  id: string,
  input:
    | {
        action: "edit"
        title: string
        userStory: string
        problemContext: string
      }
    | {
        action: "visibility"
        isHidden: boolean
      }
    | {
        action: "requestDeletion"
      }
) {
  const featureRequest = await getFeatureRequestOrThrow(id)

  if (input.action === "edit") {
    if (!canEditFeatureRequest(actor, featureRequest)) {
      throw new Error("You are not allowed to edit this feature request.")
    }

    const values = validateFeatureRequestInput(input)
    const updated = await prisma.featureRequest.update({
      where: { id },
      data: values,
      include: {
        votes: {
          select: {
            userId: true,
          },
        },
      },
    })

    await writeAuditLog({
      entityType: "FeatureRequest",
      entityId: updated.id,
      action: "UPDATE",
      actor,
      changes: buildAuditChanges(featureRequest, updated, [
        "title",
        "userStory",
        "problemContext",
      ]),
    })

    return mapFeatureRequestItem({ actor, request: updated })
  }

  if (input.action === "visibility") {
    if (!canModerateFeatureRequests(actor.role)) {
      throw new Error("You are not allowed to hide this feature request.")
    }

    const updated = await prisma.featureRequest.update({
      where: { id },
      data: {
        isHidden: input.isHidden,
      },
      include: {
        votes: {
          select: {
            userId: true,
          },
        },
      },
    })

    await writeAuditLog({
      entityType: "FeatureRequest",
      entityId: updated.id,
      action: input.isHidden ? "HIDE" : "UNHIDE",
      actor,
      changes: buildAuditChanges(featureRequest, updated, ["isHidden"]),
    })

    return mapFeatureRequestItem({ actor, request: updated })
  }

  if (!canRequestFeatureRequestDeletion(actor, featureRequest)) {
    throw new Error("You are not allowed to request deletion for this feature request.")
  }

  if (featureRequest.deletionRequestedAt) {
    throw new Error("Deletion has already been requested for this feature request.")
  }

  const updated = await prisma.featureRequest.update({
    where: { id },
    data: {
      deletionRequestedAt: new Date(),
      deletionRequestedByUserId: requireActorId(actor),
    },
    include: {
      votes: {
        select: {
          userId: true,
        },
      },
    },
  })

  await writeAuditLog({
    entityType: "FeatureRequest",
    entityId: updated.id,
    action: "REQUEST_DELETION",
    actor,
    changes: buildAuditChanges(featureRequest, updated, [
      "deletionRequestedAt",
      "deletionRequestedByUserId",
    ]),
  })

  return mapFeatureRequestItem({ actor, request: updated })
}

export async function deleteFeatureRequest(actor: FeatureRequestActor, id: string) {
  if (!canModerateFeatureRequests(actor.role)) {
    throw new Error("You are not allowed to delete this feature request.")
  }

  const featureRequest = await getFeatureRequestOrThrow(id)

  await prisma.featureRequest.delete({
    where: { id },
  })

  await writeAuditLog({
    entityType: "FeatureRequest",
    entityId: featureRequest.id,
    action: "DELETE",
    actor,
    changes: buildAuditChanges(featureRequest, null, [
      "title",
      "userStory",
      "problemContext",
      "createdByEmail",
      "votesCount",
      "isHidden",
      "deletionRequestedAt",
    ]),
  })

  return {
    id: featureRequest.id,
  }
}

export async function toggleFeatureRequestVote(actor: FeatureRequestActor, id: string) {
  const actorId = requireActorId(actor)
  const result = await prisma.$transaction(async (tx) => {
    const featureRequest = await tx.featureRequest.findUnique({
      where: { id },
      include: {
        votes: {
          where: {
            userId: actorId,
          },
          select: {
            id: true,
            userId: true,
          },
        },
      },
    })

    if (!featureRequest) {
      throw new Error("Feature request not found.")
    }

    if (featureRequest.isHidden && !canModerateFeatureRequests(actor.role)) {
      throw new Error("You are not allowed to vote on this feature request.")
    }

    const existingVote = featureRequest.votes[0]
    const delta = existingVote ? -1 : 1

    if (existingVote) {
      await tx.featureRequestVote.delete({
        where: {
          featureRequestId_userId: {
            featureRequestId: id,
            userId: actorId,
          },
        },
      })
    } else {
      await tx.featureRequestVote.create({
        data: {
          featureRequestId: id,
          userId: actorId,
        },
      })
    }

    const updated = await tx.featureRequest.update({
      where: { id },
      data: {
        votesCount: {
          increment: delta,
        },
      },
      include: {
        votes: {
          select: {
            userId: true,
          },
        },
      },
    })

    return {
      before: featureRequest,
      updated,
      addedVote: !existingVote,
    }
  })

  await writeAuditLog({
    entityType: "FeatureRequest",
    entityId: result.updated.id,
    action: result.addedVote ? "ADD_VOTE" : "REMOVE_VOTE",
    actor,
    changes: [
      {
        field: "votesCount",
        oldValue: result.before.votesCount,
        newValue: result.updated.votesCount,
      },
    ],
  })

  return mapFeatureRequestItem({ actor, request: result.updated })
}
