import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import { previewPastedExternalActual } from "@/lib/finance/queries"

export async function POST(request: Request) {
  const viewer = await requireApiAccess("MEMBER")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = await request.json()
    const preview = await previewPastedExternalActual(
      {
        year: Number(body.year),
        monthIndex:
          body.monthIndex === undefined || body.monthIndex === null
            ? undefined
            : Number(body.monthIndex),
        content: String(body.content || ""),
      },
      viewer
    )

    return NextResponse.json({ preview })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Preview failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
