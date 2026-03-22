import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import { getFundingAvailabilityPreview } from "@/lib/finance/queries"

export async function POST(request: Request) {
  const viewer = await requireApiAccess("MEMBER")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = await request.json()
    const preview = await getFundingAvailabilityPreview(
      {
        year: Number(body.year),
        seatId: body.seatId ? String(body.seatId) : undefined,
        profile: {
          domain: body.profile?.domain ?? undefined,
          subDomain: body.profile?.subDomain ?? undefined,
          budgetAreaId: body.profile?.budgetAreaId ?? undefined,
          funding: body.profile?.funding ?? undefined,
          pillar: body.profile?.pillar ?? undefined,
          costCenter: body.profile?.costCenter ?? undefined,
          projectCode: body.profile?.projectCode ?? undefined,
          resourceType: body.profile?.resourceType ?? undefined,
          team: body.profile?.team ?? undefined,
          inSeat: body.profile?.inSeat ?? undefined,
          description: body.profile?.description ?? undefined,
          band: body.profile?.band ?? undefined,
          location: body.profile?.location ?? undefined,
          vendor: body.profile?.vendor ?? undefined,
          manager: body.profile?.manager ?? undefined,
          dailyRate:
            body.profile?.dailyRate === undefined ||
            body.profile?.dailyRate === null ||
            body.profile?.dailyRate === ""
              ? undefined
              : Number(body.profile.dailyRate),
          ritm: body.profile?.ritm ?? undefined,
          sow: body.profile?.sow ?? undefined,
          spendPlanId: body.profile?.spendPlanId ?? undefined,
          status: body.profile?.status ?? undefined,
          allocation:
            body.profile?.allocation === undefined ||
            body.profile?.allocation === null ||
            body.profile?.allocation === ""
              ? undefined
              : Number(body.profile.allocation),
          startDate: body.profile?.startDate
            ? new Date(body.profile.startDate)
            : body.profile?.startDate === null
              ? null
              : undefined,
          endDate: body.profile?.endDate
            ? new Date(body.profile.endDate)
            : body.profile?.endDate === null
              ? null
              : undefined,
          notes: body.profile?.notes ?? undefined,
        },
      },
      viewer
    )

    return NextResponse.json({ preview })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Preview failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
