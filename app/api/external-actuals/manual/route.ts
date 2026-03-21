import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import { createManualExternalActual } from "@/lib/finance/queries"

export async function POST(request: Request) {
  const viewer = await requireApiAccess("MEMBER")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = await request.json()
    const batch = await createManualExternalActual(
      {
        year: Number(body.year),
        monthIndex: Number(body.monthIndex),
        spendPlanId: body.spendPlanId ? String(body.spendPlanId).trim() : null,
        trackerSeatIds: Array.isArray(body.trackerSeatIds)
          ? body.trackerSeatIds.map((value: unknown) => String(value))
          : [],
        amount: Number(body.amount),
        currency: String(body.currency || "DKK").trim().toUpperCase() as "DKK" | "EUR" | "USD",
        invoiceNumber: body.invoiceNumber ? String(body.invoiceNumber) : null,
        supplierName: body.supplierName ? String(body.supplierName) : null,
        description: body.description ? String(body.description) : null,
      },
      {
        name: viewer.name,
        email: viewer.email,
      },
      viewer
    )

    return NextResponse.json({ batch })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Manual external actual failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
