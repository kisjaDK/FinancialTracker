import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import {
  deleteDepartmentMapping,
  upsertDepartmentMapping,
} from "@/lib/finance/queries"

export async function POST(request: Request) {
  const viewer = await requireApiAccess("ADMIN")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = await request.json()
    const mapping = await upsertDepartmentMapping({
      id: body.id ? String(body.id).trim() : undefined,
      year: Number(body.year),
      sourceCode: String(body.sourceCode || "").trim(),
      domain: String(body.domain || "").trim(),
      subDomain: String(body.subDomain || "").trim(),
      projectCode: String(body.projectCode || "").trim(),
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

export async function DELETE(request: Request) {
  const viewer = await requireApiAccess("ADMIN")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = await request.json()
    const id = String(body.id || "")
    const year = Number(body.year)

    if (!id) {
      return NextResponse.json({ error: "Mapping id is required" }, { status: 400 })
    }

    const mapping = await deleteDepartmentMapping(
      {
        year,
        id,
      },
      {
        name: viewer.name,
        email: viewer.email,
      }
    )

    return NextResponse.json({ mapping })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delete failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
