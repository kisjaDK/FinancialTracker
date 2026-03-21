import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import { runBudgetOutlook } from "@/lib/ai/tasks/run-budget-outlook"

export async function POST(request: Request) {
  const viewer = await requireApiAccess("SUPER_ADMIN")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = await request.json()
    const year = Number(body.year)
    const summaryKey = typeof body.summaryKey === "string" ? body.summaryKey.trim() : ""

    if (!Number.isInteger(year)) {
      throw new Error("Year is required.")
    }

    if (!summaryKey) {
      throw new Error("Summary key is required.")
    }

    const result = await runBudgetOutlook({
      year,
      summaryKey,
      viewer,
    })

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
