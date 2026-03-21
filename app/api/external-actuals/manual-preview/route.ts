import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import { previewManualExternalActualConversion } from "@/lib/finance/queries"

export async function POST(request: Request) {
  const viewer = await requireApiAccess("MEMBER")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = await request.json()
    const preview = await previewManualExternalActualConversion({
      year: Number(body.year),
      monthIndex: Number(body.monthIndex),
      amount: Number(body.amount),
      currency: String(body.currency || "DKK").trim().toUpperCase() as
        | "DKK"
        | "EUR"
        | "USD",
    })

    return NextResponse.json({ preview })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Manual external actual preview failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
