import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import { upsertServiceMessage } from "@/lib/finance/queries"
import type { ServiceMessageKey } from "@/lib/generated/prisma/client"

export async function POST(request: Request) {
  const viewer = await requireApiAccess("ADMIN")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = await request.json()
    const message = await upsertServiceMessage({
      year: Number(body.year),
      key: String(body.key || "INTERNAL_ACTUALS") as ServiceMessageKey,
      content: body.content ? String(body.content) : "",
    }, {
      name: viewer.name,
      email: viewer.email,
    })

    return NextResponse.json({ message })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Save failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const PATCH = POST
