import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import {
  createFeatureRequest,
  listFeatureRequests,
} from "@/lib/feature-requests"

export async function GET() {
  const viewer = await requireApiAccess("GUEST")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const featureRequests = await listFeatureRequests({
      id: viewer.id,
      name: viewer.name,
      email: viewer.email,
      role: viewer.role,
    })

    return NextResponse.json({ featureRequests })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load feature requests"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function POST(request: Request) {
  const viewer = await requireApiAccess("GUEST")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = (await request.json()) as Record<string, unknown>
    const featureRequest = await createFeatureRequest(
      {
        id: viewer.id,
        name: viewer.name,
        email: viewer.email,
        role: viewer.role,
      },
      {
        title: String(body.title || ""),
        userStory: String(body.userStory || ""),
        problemContext: String(body.problemContext || ""),
      }
    )

    return NextResponse.json({ featureRequest })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Save failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
