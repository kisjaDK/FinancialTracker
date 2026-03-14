import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import {
  deleteStaffingTarget,
  getStaffingAdminPageData,
  upsertStaffingTarget,
} from "@/lib/finance/queries"

export async function GET(request: Request) {
  const viewer = await requireApiAccess("ADMIN")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  const { searchParams } = new URL(request.url)
  const year = searchParams.get("year")
    ? Number(searchParams.get("year"))
    : undefined
  const data = await getStaffingAdminPageData(year, viewer)

  return NextResponse.json({
    activeYear: data.activeYear,
    targets: data.targets,
    hierarchyOptions: data.hierarchyOptions,
  })
}

export async function POST(request: Request) {
  const viewer = await requireApiAccess("ADMIN")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = await request.json()
    const target = await upsertStaffingTarget(
      {
        id: body.id ? String(body.id).trim() : undefined,
        year: Number(body.year),
        scopeLevel: body.scopeLevel,
        domain: String(body.domain || ""),
        subDomain: body.subDomain ? String(body.subDomain) : undefined,
        projectCode: body.projectCode ? String(body.projectCode) : undefined,
        permTarget: Number(body.permTarget),
      },
      {
        name: viewer.name,
        email: viewer.email,
      }
    )

    return NextResponse.json({ target })
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
    const target = await deleteStaffingTarget(
      {
        id: String(body.id || ""),
        year: Number(body.year),
      },
      {
        name: viewer.name,
        email: viewer.email,
      }
    )

    return NextResponse.json({ target })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delete failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
