import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import { createPastedExternalActual } from "@/lib/finance/queries"

export async function POST(request: Request) {
  const viewer = await requireApiAccess("MEMBER")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = await request.json()
    const batch = await createPastedExternalActual(
      {
        year: Number(body.year),
        monthIndex: Number(body.monthIndex),
        content: String(body.content || ""),
      },
      {
        name: viewer.name,
        email: viewer.email,
      },
      viewer
    )

    return NextResponse.json({ batch })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pasted external actual failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
