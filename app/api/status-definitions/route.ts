import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import { upsertStatusDefinition } from "@/lib/finance/queries"

export async function POST(request: Request) {
  const viewer = await requireApiAccess("ADMIN")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = await request.json()
    const status = await upsertStatusDefinition({
      year: Number(body.year),
      label: String(body.label || ""),
      isActiveStatus: Boolean(body.isActiveStatus),
    }, {
      name: viewer.name,
      email: viewer.email,
    })

    return NextResponse.json({ status })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Save failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const PATCH = POST
