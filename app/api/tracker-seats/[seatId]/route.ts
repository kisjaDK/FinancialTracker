import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import { updateTrackerSeat, updateTrackerSeatMonths } from "@/lib/finance/queries"

type Params = {
  params: Promise<{
    seatId: string
  }>
}

export async function POST(request: Request, context: Params) {
  const viewer = await requireApiAccess("MEMBER")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = await request.json()
    const { seatId } = await context.params
    const actor = {
      name: viewer.name,
      email: viewer.email,
    }
    const seat = Array.isArray(body.months)
      ? await updateTrackerSeatMonths(
          seatId,
          body.months.map((month: Record<string, unknown>) => ({
            monthIndex:
              month.monthIndex === undefined ? undefined : Number(month.monthIndex),
            actualAmount:
              month.actualAmount === undefined ? undefined : Number(month.actualAmount),
            actualCurrency:
              month.actualCurrency === undefined
                ? undefined
                : (String(month.actualCurrency) as "DKK" | "EUR" | "USD"),
            forecastOverrideAmount:
              month.forecastOverrideAmount === undefined
                ? undefined
                : month.forecastOverrideAmount === null ||
                    month.forecastOverrideAmount === ""
                  ? null
                  : Number(month.forecastOverrideAmount),
            forecastIncluded:
              month.forecastIncluded === undefined
                ? undefined
                : Boolean(month.forecastIncluded),
            notes: month.notes ? String(month.notes) : undefined,
          })),
          actor
        )
      : await updateTrackerSeat(
          seatId,
          {
            monthIndex:
              body.monthIndex === undefined ? undefined : Number(body.monthIndex),
            actualAmount:
              body.actualAmount === undefined ? undefined : Number(body.actualAmount),
            actualCurrency: body.actualCurrency ?? undefined,
            forecastOverrideAmount:
              body.forecastOverrideAmount === undefined
                ? undefined
                : body.forecastOverrideAmount === null ||
                    body.forecastOverrideAmount === ""
                  ? null
                  : Number(body.forecastOverrideAmount),
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
          },
          actor
        )

    return NextResponse.json({ seat })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const PATCH = POST
