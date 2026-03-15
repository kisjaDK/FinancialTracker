import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import { toggleFeatureRequestVote } from "@/lib/feature-requests"

type RouteContext = {
  params: Promise<{
    id: string
  }>
}

export async function POST(_request: Request, context: RouteContext) {
  const viewer = await requireApiAccess("GUEST")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const { id } = await context.params
    const featureRequest = await toggleFeatureRequestVote(
      {
        id: viewer.id,
        name: viewer.name,
        email: viewer.email,
        role: viewer.role,
      },
      id
    )

    return NextResponse.json({ featureRequest })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vote failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
