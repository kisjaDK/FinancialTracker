import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import { importBudgetMovementsCsv } from "@/lib/finance/imports"

export async function POST(request: Request) {
  const viewer = await requireApiAccess("MEMBER")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const formData = await request.formData()
    const file = formData.get("file")
    const year = Number(formData.get("year"))

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 })
    }

    if (!Number.isInteger(year)) {
      return NextResponse.json({ error: "Year is required" }, { status: 400 })
    }

    const content = await file.text()
    const batch = await importBudgetMovementsCsv(year, file.name, content, {
      name: viewer.name,
      email: viewer.email,
    })

    return NextResponse.json({ batch })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
