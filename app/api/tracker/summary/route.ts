import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import { getBudgetAreaSummary } from "@/lib/finance/queries"

export async function GET(request: Request) {
  const viewer = await requireApiAccess("GUEST")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  const { searchParams } = new URL(request.url)
  const year = Number(searchParams.get("year"))

  if (!Number.isInteger(year)) {
    return NextResponse.json({ error: "Year is required" }, { status: 400 })
  }

  const summary = await getBudgetAreaSummary(year, undefined, undefined, viewer)
  return NextResponse.json({ summary })
}
