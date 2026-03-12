import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getTrackerDetail } from "@/lib/finance/queries"

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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

  const seats = await getTrackerDetail(year, budgetAreaId)
  return NextResponse.json({ seats })
}
