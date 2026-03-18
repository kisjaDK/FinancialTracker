import { NextResponse } from "next/server"
import { importRosterCsv, importRosterJson } from "@/lib/finance/imports"
import { authorizeRosterImportRequest } from "@/lib/roster-api-auth"

export async function POST(request: Request) {
  const actor = await authorizeRosterImportRequest(request)
  if (actor instanceof NextResponse) {
    return actor
  }

  try {
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? ""

    if (contentType.includes("application/json")) {
      const body = (await request.json()) as {
        year?: unknown
        fileName?: unknown
        rows?: unknown
      }
      const year = Number(body.year)

      if (!Number.isInteger(year)) {
        return NextResponse.json({ error: "Year is required" }, { status: 400 })
      }

      const fileName =
        body.fileName && String(body.fileName).trim()
          ? String(body.fileName).trim()
          : `api-roster-${year}.json`
      const result = await importRosterJson(year, fileName, body.rows, {
        name: actor.name,
        email: actor.email,
      })

      return NextResponse.json(result)
    }

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
    const result = await importRosterCsv(year, file.name, content, {
      name: actor.name,
      email: actor.email,
    })

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
