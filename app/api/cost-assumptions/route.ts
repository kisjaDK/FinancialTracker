import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import { deleteCostAssumption, upsertCostAssumption } from "@/lib/finance/queries"

export async function POST(request: Request) {
  const viewer = await requireApiAccess("ADMIN")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = await request.json()
    const assumption = await upsertCostAssumption({
      year: Number(body.year),
      band: String(body.band || "").trim(),
      location: String(body.location || "").trim(),
      yearlyCost: Number(body.yearlyCost),
    }, {
      name: viewer.name,
      email: viewer.email,
    })

    return NextResponse.json({ assumption })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Save failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const PATCH = POST

export async function DELETE(request: Request) {
  const viewer = await requireApiAccess("ADMIN")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = await request.json()
    const assumption = await deleteCostAssumption({
      year: Number(body.year),
      band: String(body.band || "").trim(),
      location: String(body.location || "").trim(),
    }, {
      name: viewer.name,
      email: viewer.email,
    })

    return NextResponse.json({ assumption })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delete failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
