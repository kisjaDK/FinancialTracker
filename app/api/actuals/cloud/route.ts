import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import { saveCloudActualForBudgetArea } from "@/lib/finance/queries"

export async function POST(request: Request) {
  const viewer = await requireApiAccess("MEMBER")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = await request.json()
    const result = await saveCloudActualForBudgetArea(
      {
        year: Number(body.year),
        domain: body.domain ? String(body.domain) : null,
        subDomain: body.subDomain ? String(body.subDomain) : null,
        projectCode: body.projectCode ? String(body.projectCode) : null,
        monthIndex: Number(body.monthIndex),
        actualAmount: Number(body.actualAmount),
      },
      {
        name: viewer.name,
        email: viewer.email,
      }
    )

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cloud actual save failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
