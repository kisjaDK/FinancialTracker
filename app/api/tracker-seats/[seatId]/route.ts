import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { updateTrackerSeat } from "@/lib/finance/queries"

type Params = {
  params: Promise<{
    seatId: string
  }>
}

export async function POST(request: Request, context: Params) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { seatId } = await context.params
    const seat = await updateTrackerSeat(seatId, {
      monthIndex:
        body.monthIndex === undefined ? undefined : Number(body.monthIndex),
      actualAmount:
        body.actualAmount === undefined ? undefined : Number(body.actualAmount),
      actualCurrency: body.actualCurrency ?? undefined,
      forecastIncluded:
        body.forecastIncluded === undefined
          ? undefined
          : Boolean(body.forecastIncluded),
      notes: body.notes ? String(body.notes) : undefined,
      override: body.override
        ? {
            domain: body.override.domain ?? undefined,
            subDomain: body.override.subDomain ?? undefined,
            budgetAreaId: body.override.budgetAreaId ?? undefined,
            funding: body.override.funding ?? undefined,
            pillar: body.override.pillar ?? undefined,
            costCenter: body.override.costCenter ?? undefined,
            projectCode: body.override.projectCode ?? undefined,
            resourceType: body.override.resourceType ?? undefined,
            ritm: body.override.ritm ?? undefined,
            sow: body.override.sow ?? undefined,
            spendPlanId: body.override.spendPlanId ?? undefined,
            status: body.override.status ?? undefined,
            allocation:
              body.override.allocation === undefined
                ? undefined
                : Number(body.override.allocation),
            startDate: body.override.startDate
              ? new Date(body.override.startDate)
              : undefined,
            endDate: body.override.endDate
              ? new Date(body.override.endDate)
              : undefined,
            notes: body.override.notes ?? undefined,
          }
        : undefined,
    }, {
      name: session.user.name,
      email: session.user.email,
    })

    return NextResponse.json({ seat })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const PATCH = POST
