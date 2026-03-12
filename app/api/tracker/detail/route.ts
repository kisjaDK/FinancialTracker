import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import { getTrackerDetail } from "@/lib/finance/queries"

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

  const seats = await getTrackerDetail(year, budgetAreaId, viewer)
  return NextResponse.json({ seats })
}
