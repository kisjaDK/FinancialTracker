import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import {
  applyForecastCopyToActualsForSubDomain,
  previewForecastCopyToActualsForSubDomain,
} from "@/lib/finance/queries"

export async function POST(request: Request) {
  const viewer = await requireApiAccess("MEMBER")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = await request.json()
    const input = {
      year: Number(body.year),
      budgetAreaId: String(body.budgetAreaId || ""),
      monthIndex: Number(body.monthIndex),
    }
    const result =
      body.mode === "preview"
        ? await previewForecastCopyToActualsForSubDomain(input, viewer)
        : await applyForecastCopyToActualsForSubDomain({
            ...input,
            overrides: Array.isArray(body.overrides)
              ? body.overrides.map((override: { trackerSeatId?: unknown; amount?: unknown }) => ({
                  trackerSeatId: String(override.trackerSeatId || ""),
                  amount: Number(override.amount),
                }))
              : undefined,
          }, {
            name: viewer.name,
            email: viewer.email,
          }, viewer)

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bulk update failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
