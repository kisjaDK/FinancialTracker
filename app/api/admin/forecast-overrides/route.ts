import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import { serializeCsv } from "@/lib/finance/csv"
import { importForecastOverridesCsv } from "@/lib/finance/imports"
import {
  getForecastOverrideExportRows,
  resetTrackingYearDataset,
} from "@/lib/finance/queries"

const HEADERS = [
  "Tracker Seat ID",
  "Source Key",
  "Seat ID",
  "Name",
  "Month",
  "Month Number",
  "Forecast Override Amount",
  "Forecast Included",
]

export async function GET(request: Request) {
  const viewer = await requireApiAccess("ADMIN")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  const { searchParams } = new URL(request.url)
  const year = Number(searchParams.get("year"))

  if (!Number.isInteger(year)) {
    return NextResponse.json({ error: "Year is required" }, { status: 400 })
  }

  const rows = await getForecastOverrideExportRows(year)
  const content = serializeCsv(rows, HEADERS)

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="forecast-overrides-${year}.csv"`,
    },
  })
}

export async function POST(request: Request) {
  const viewer = await requireApiAccess("ADMIN")
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

    const result = await importForecastOverridesCsv(year, await file.text(), {
      name: viewer.name,
      email: viewer.email,
    })

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed"
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
    const result = await resetTrackingYearDataset(
      {
        year: Number(body.year),
        dataset: "forecasts",
      },
      {
        name: viewer.name,
        email: viewer.email,
      }
    )

    return NextResponse.json({ deletedCount: result.deletedCount })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delete failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
