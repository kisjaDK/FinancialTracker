import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { upsertStatusDefinition } from "@/lib/finance/queries"

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const status = await upsertStatusDefinition({
      year: Number(body.year),
      label: String(body.label || ""),
      isActiveStatus: Boolean(body.isActiveStatus),
    }, {
      name: session.user.name,
      email: session.user.email,
    })

    return NextResponse.json({ status })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Save failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const PATCH = POST
