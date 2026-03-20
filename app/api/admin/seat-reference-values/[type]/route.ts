import { NextResponse } from "next/server"
import type { SeatReferenceValueType } from "@prisma/client"
import { requireApiAccess } from "@/lib/authz"
import { serializeCsv } from "@/lib/finance/csv"
import { importSeatReferenceValuesCsv } from "@/lib/finance/imports"
import { getSeatReferenceValueExportRows } from "@/lib/finance/queries"

type Params = {
  params: Promise<{
    type: string
  }>
}

function parseType(value: string): SeatReferenceValueType {
  const normalized = value.trim().toUpperCase()
  if (
    normalized === "VENDOR" ||
    normalized === "LOCATION" ||
    normalized === "MANAGER" ||
    normalized === "ROLE" ||
    normalized === "BAND" ||
    normalized === "RESOURCE_TYPE"
  ) {
    return normalized
  }

  throw new Error("Unknown reference value type.")
}

export async function GET(request: Request, context: Params) {
  const viewer = await requireApiAccess("ADMIN")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const { searchParams } = new URL(request.url)
    const year = Number(searchParams.get("year"))
    const { type: rawType } = await context.params
    const type = parseType(rawType)
    const rows = await getSeatReferenceValueExportRows(year, type)

    return new NextResponse(serializeCsv(rows, ["Type", "Value"]), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function POST(request: Request, context: Params) {
  const viewer = await requireApiAccess("ADMIN")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const formData = await request.formData()
    const year = Number(formData.get("year"))
    const file = formData.get("file")
    const { type: rawType } = await context.params
    const type = parseType(rawType)

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "CSV file is required" }, { status: 400 })
    }

    const result = await importSeatReferenceValuesCsv(
      year,
      type,
      await file.text(),
      {
        name: viewer.name,
        email: viewer.email,
      }
    )

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
