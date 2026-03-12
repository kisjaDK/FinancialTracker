import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { rollbackExternalActualImport } from "@/lib/finance/queries"

type RouteContext = {
  params: Promise<{
    importId: string
  }>
}

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { importId } = await context.params
    const result = await rollbackExternalActualImport(
      { importId },
      {
        name: session.user.name,
        email: session.user.email,
      }
    )

    return NextResponse.json({ result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rollback failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
