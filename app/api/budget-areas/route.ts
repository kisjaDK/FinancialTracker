import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { deriveTrackerSeatsForYear, upsertBudgetArea } from "@/lib/finance/queries"

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const budgetArea = await upsertBudgetArea({
      year: Number(body.year),
      domain: body.domain ? String(body.domain) : undefined,
      subDomain: body.subDomain ? String(body.subDomain) : undefined,
      funding: body.funding ? String(body.funding) : undefined,
      pillar: body.pillar ? String(body.pillar) : undefined,
      costCenter: String(body.costCenter || "").trim(),
      projectCode: String(body.projectCode || "").trim(),
      displayName: body.displayName ? String(body.displayName) : undefined,
      notes: body.notes ? String(body.notes) : undefined,
    }, {
      name: session.user.name,
      email: session.user.email,
    })

    await deriveTrackerSeatsForYear(Number(body.year))

    return NextResponse.json({ budgetArea })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Save failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const PATCH = POST
