import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import { rollbackBudgetMovementImport } from "@/lib/finance/queries"

type RouteContext = {
  params: Promise<{
    batchId: string
  }>
}

export async function POST(_request: Request, context: RouteContext) {
  const viewer = await requireApiAccess("MEMBER")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const { batchId } = await context.params
    const result = await rollbackBudgetMovementImport(
      { batchId },
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
