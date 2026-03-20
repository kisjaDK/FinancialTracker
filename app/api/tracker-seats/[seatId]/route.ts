import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import {
  deleteManualTrackerSeat,
  updateTrackerSeat,
  updateTrackerSeatMonths,
  updateTrackerSeatProfile,
} from "@/lib/finance/queries"

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
    const seat = body.profile
      ? await updateTrackerSeatProfile(
          seatId,
          {
            domain: body.profile.domain ?? undefined,
            subDomain: body.profile.subDomain ?? undefined,
            budgetAreaId: body.profile.budgetAreaId ?? undefined,
            funding: body.profile.funding ?? undefined,
            pillar: body.profile.pillar ?? undefined,
            costCenter: body.profile.costCenter ?? undefined,
            projectCode: body.profile.projectCode ?? undefined,
            resourceType: body.profile.resourceType ?? undefined,
            team: body.profile.team ?? undefined,
            inSeat: body.profile.inSeat ?? undefined,
            description: body.profile.description ?? undefined,
            band: body.profile.band ?? undefined,
            location: body.profile.location ?? undefined,
            vendor: body.profile.vendor ?? undefined,
            manager: body.profile.manager ?? undefined,
            dailyRate:
              body.profile.dailyRate === undefined ||
              body.profile.dailyRate === null ||
              body.profile.dailyRate === ""
                ? undefined
                : Number(body.profile.dailyRate),
            ritm: body.profile.ritm ?? undefined,
            sow: body.profile.sow ?? undefined,
            spendPlanId: body.profile.spendPlanId ?? undefined,
            status: body.profile.status ?? undefined,
            allocation:
              body.profile.allocation === undefined ||
              body.profile.allocation === null ||
              body.profile.allocation === ""
                ? undefined
                : Number(body.profile.allocation),
            startDate: body.profile.startDate
              ? new Date(body.profile.startDate)
              : body.profile.startDate === null
                ? null
                : undefined,
            endDate: body.profile.endDate
              ? new Date(body.profile.endDate)
              : body.profile.endDate === null
                ? null
                : undefined,
            notes: body.profile.notes ?? undefined,
          },
          actor
        )
      : Array.isArray(body.months)
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
                  team: body.override.team ?? undefined,
                  inSeat: body.override.inSeat ?? undefined,
                  description: body.override.description ?? undefined,
                  band: body.override.band ?? undefined,
                  location: body.override.location ?? undefined,
                  vendor: body.override.vendor ?? undefined,
                  manager: body.override.manager ?? undefined,
                  dailyRate:
                    body.override.dailyRate === undefined
                      ? undefined
                      : body.override.dailyRate === null || body.override.dailyRate === ""
                        ? null
                        : Number(body.override.dailyRate),
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

export async function DELETE(_request: Request, context: Params) {
  const viewer = await requireApiAccess("SUPER_ADMIN")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const { seatId } = await context.params
    await deleteManualTrackerSeat(seatId, {
      name: viewer.name,
      email: viewer.email,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delete failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
