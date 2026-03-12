import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { upsertExchangeRate } from "@/lib/finance/queries"

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
      name: session.user.name,
      email: session.user.email,
    })

    return NextResponse.json({ exchangeRate })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Save failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const PATCH = POST
