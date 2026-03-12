import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import { deleteUserAccess, saveUserAccess } from "@/lib/user-admin"

export async function POST(request: Request) {
  const viewer = await requireApiAccess("ADMIN")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = await request.json()
    const user = await saveUserAccess(
      {
        role: viewer.role,
        email: viewer.email,
      },
      {
        email: String(body.email || "").trim(),
        name: body.name ? String(body.name) : undefined,
        role: body.role,
        scopes: Array.isArray(body.scopes)
          ? body.scopes.map((scope: { domain?: unknown; subDomain?: unknown }) => ({
              domain: String(scope.domain || ""),
              subDomain: scope.subDomain ? String(scope.subDomain) : null,
            }))
          : [],
      }
    )

    return NextResponse.json({ user })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Save failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(request: Request) {
  const viewer = await requireApiAccess("ADMIN")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = await request.json()
    const result = await deleteUserAccess(
      {
        role: viewer.role,
      },
      String(body.email || "").trim()
    )

    return NextResponse.json({ result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delete failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
