import { NextResponse } from "next/server"
import { auth } from "@/auth"
import {
  applyForecastCopyToActualsForSubDomain,
  previewForecastCopyToActualsForSubDomain,
} from "@/lib/finance/queries"

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
        ? await previewForecastCopyToActualsForSubDomain(input)
        : await applyForecastCopyToActualsForSubDomain({
            ...input,
            overrides: Array.isArray(body.overrides)
              ? body.overrides.map((override: { trackerSeatId?: unknown; amount?: unknown }) => ({
                  trackerSeatId: String(override.trackerSeatId || ""),
                  amount: Number(override.amount),
                }))
              : undefined,
          }, {
            name: session.user.name,
            email: session.user.email,
          })

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bulk update failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
