import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import { assignSpendPlanToTrackerSeats } from "@/lib/finance/queries"

export async function POST(request: Request) {
  const viewer = await requireApiAccess("MEMBER")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = await request.json()
    const result = await assignSpendPlanToTrackerSeats(
      {
        trackerSeatIds: Array.isArray(body.trackerSeatIds)
          ? body.trackerSeatIds.map((value: unknown) => String(value))
          : [],
        spendPlanId: String(body.spendPlanId || ""),
      },
      {
        name: viewer.name,
        email: viewer.email,
      }
    )

    return NextResponse.json({ result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Spend plan assignment failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
