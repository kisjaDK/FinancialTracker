import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { deleteCostAssumption, upsertCostAssumption } from "@/lib/finance/queries"

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const assumption = await upsertCostAssumption({
      year: Number(body.year),
      band: String(body.band || "").trim(),
      location: String(body.location || "").trim(),
      yearlyCost: Number(body.yearlyCost),
      notes: body.notes ? String(body.notes) : undefined,
    }, {
      name: session.user.name,
      email: session.user.email,
    })

    return NextResponse.json({ assumption })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Save failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const PATCH = POST

export async function DELETE(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const assumption = await deleteCostAssumption({
      year: Number(body.year),
      band: String(body.band || "").trim(),
      location: String(body.location || "").trim(),
    }, {
      name: session.user.name,
      email: session.user.email,
    })

    return NextResponse.json({ assumption })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delete failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
