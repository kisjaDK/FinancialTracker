import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import { rollbackRosterImport } from "@/lib/finance/queries"

type RouteContext = {
  params: Promise<{
    importId: string
  }>
}

export async function POST(_request: Request, context: RouteContext) {
  const viewer = await requireApiAccess("MEMBER")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const { importId } = await context.params
    const result = await rollbackRosterImport(
      { importId },
      {
        name: viewer.name,
        email: viewer.email,
      }
    )

    return NextResponse.json({ result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rollback failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
