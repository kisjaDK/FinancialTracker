import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import {
  deleteFeatureRequest,
  updateFeatureRequest,
} from "@/lib/feature-requests"

type RouteContext = {
  params: Promise<{
    id: string
  }>
}

export async function PATCH(request: Request, context: RouteContext) {
  const viewer = await requireApiAccess("GUEST")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const { id } = await context.params
    const body = (await request.json()) as Record<string, unknown>
    const action = String(body.action || "")

    if (action === "edit") {
      const featureRequest = await updateFeatureRequest(
        {
          id: viewer.id,
          name: viewer.name,
          email: viewer.email,
          role: viewer.role,
        },
        id,
        {
          action,
          title: String(body.title || ""),
          userStory: String(body.userStory || ""),
          problemContext: String(body.problemContext || ""),
        }
      )

      return NextResponse.json({ featureRequest })
    }

    if (action === "visibility") {
      const featureRequest = await updateFeatureRequest(
        {
          id: viewer.id,
          name: viewer.name,
          email: viewer.email,
          role: viewer.role,
        },
        id,
        {
          action,
          isHidden: Boolean(body.isHidden),
        }
      )

      return NextResponse.json({ featureRequest })
    }

    if (action === "requestDeletion") {
      const featureRequest = await updateFeatureRequest(
        {
          id: viewer.id,
          name: viewer.name,
          email: viewer.email,
          role: viewer.role,
        },
        id,
        {
          action,
        }
      )

      return NextResponse.json({ featureRequest })
    }

    return NextResponse.json({ error: "Unsupported update action" }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const viewer = await requireApiAccess("GUEST")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const { id } = await context.params
    const result = await deleteFeatureRequest(
      {
        id: viewer.id,
        name: viewer.name,
        email: viewer.email,
        role: viewer.role,
      },
      id
    )

    return NextResponse.json({ result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delete failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
