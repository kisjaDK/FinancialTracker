import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { upsertDepartmentMapping } from "@/lib/finance/queries"

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
      name: session.user.name,
      email: session.user.email,
    })

    return NextResponse.json({ mapping })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Save failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const PATCH = POST
