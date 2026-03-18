import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import {
  createServiceUser,
  revokeServiceUserApiKeys,
  rotateServiceUserApiKey,
  setServiceUserActiveState,
} from "@/lib/service-users"

export async function POST(request: Request) {
  const viewer = await requireApiAccess("ADMIN")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = (await request.json()) as {
      label?: unknown
      role?: unknown
      keyName?: unknown
    }
    const result = await createServiceUser(
      {
        role: viewer.role,
        email: viewer.email,
        name: viewer.name,
      },
      {
        label: String(body.label || ""),
        role: body.role === "MEMBER" ? "MEMBER" : undefined,
        keyName: body.keyName ? String(body.keyName) : undefined,
      }
    )

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Create failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function PATCH(request: Request) {
  const viewer = await requireApiAccess("ADMIN")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = (await request.json()) as {
      action?: unknown
      id?: unknown
      isActive?: unknown
      keyName?: unknown
    }
    const id = String(body.id || "")
    const actor = {
      role: viewer.role,
      email: viewer.email,
      name: viewer.name,
    }

    if (!id) {
      return NextResponse.json({ error: "Service user id is required" }, { status: 400 })
    }

    if (body.action === "rotate") {
      const result = await rotateServiceUserApiKey(
        actor,
        id,
        body.keyName ? String(body.keyName) : undefined
      )
      return NextResponse.json(result)
    }

    if (body.action === "revoke-key") {
      const result = await revokeServiceUserApiKeys(actor, id)
      return NextResponse.json({ result })
    }

    if (body.action === "set-active") {
      const result = await setServiceUserActiveState(actor, id, Boolean(body.isActive))
      return NextResponse.json({ serviceUser: result })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
