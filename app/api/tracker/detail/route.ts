import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import { getTrackerDetail } from "@/lib/finance/queries"

function logTrackerDetailTiming(input: {
  durationMs: number
  year: number
  budgetAreaId: string
  seatCount: number
}) {
  if (process.env.NODE_ENV === "production") {
    return
  }

  console.info(
    `[tracker.detail] ${input.durationMs.toFixed(1)}ms year=${input.year} area=${input.budgetAreaId} seats=${input.seatCount}`
  )
}

export async function GET(request: Request) {
  const viewer = await requireApiAccess("GUEST")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  const { searchParams } = new URL(request.url)
  const year = Number(searchParams.get("year"))
  const budgetAreaId = searchParams.get("budgetAreaId")

  if (!Number.isInteger(year) || !budgetAreaId) {
    return NextResponse.json(
      { error: "Year and budgetAreaId are required" },
      { status: 400 }
    )
  }

  const startedAt = performance.now()
  const seats = await getTrackerDetail(year, budgetAreaId, undefined, viewer)
  logTrackerDetailTiming({
    durationMs: performance.now() - startedAt,
    year,
    budgetAreaId,
    seatCount: seats.length,
  })
  return NextResponse.json({ seats })
}
