import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import { searchExternalSeatsByName } from "@/lib/finance/queries"

export async function POST(request: Request) {
  const viewer = await requireApiAccess("MEMBER")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = await request.json()
    const seats = await searchExternalSeatsByName(
      {
        year: Number(body.year),
        query: String(body.query || ""),
      },
      viewer
    )

    return NextResponse.json({ seats })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Seat search failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
