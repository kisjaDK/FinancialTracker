import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import { upsertDepartmentMapping } from "@/lib/finance/queries"

export async function POST(request: Request) {
  const viewer = await requireApiAccess("ADMIN")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = await request.json()
    const mapping = await upsertDepartmentMapping({
      year: Number(body.year),
      sourceCode: String(body.sourceCode || "").trim(),
      domain: String(body.domain || "").trim(),
      subDomain: String(body.subDomain || "").trim(),
      notes: body.notes ? String(body.notes) : undefined,
    }, {
      name: viewer.name,
      email: viewer.email,
    })

    return NextResponse.json({ mapping })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Save failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const PATCH = POST
