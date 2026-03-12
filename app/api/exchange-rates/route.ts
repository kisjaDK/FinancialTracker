import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import { upsertExchangeRate } from "@/lib/finance/queries"

export async function POST(request: Request) {
  const viewer = await requireApiAccess("ADMIN")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = await request.json()
    const exchangeRate = await upsertExchangeRate({
      year: Number(body.year),
      currency: body.currency,
      rateToDkk: Number(body.rateToDkk),
      effectiveDate: new Date(body.effectiveDate),
      notes: body.notes ? String(body.notes) : undefined,
    }, {
      name: viewer.name,
      email: viewer.email,
    })

    return NextResponse.json({ exchangeRate })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Save failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const PATCH = POST
