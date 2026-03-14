import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import { serializeCsv } from "@/lib/finance/csv"
import { importTrackerOverridesCsv } from "@/lib/finance/imports"
import {
  deleteTrackerOverridesForYear,
  getTrackerOverrideExportRows,
} from "@/lib/finance/queries"

const HEADERS = [
  "Tracker Seat ID",
  "Source Key",
  "Seat ID",
  "Name",
  "Domain",
  "Sub-domain",
  "Funding",
  "Pillar",
  "Budget Area ID",
  "Cost Center",
  "Project Code",
  "Resource Type",
  "RITM",
  "SOW",
  "Spend Plan ID",
  "Status",
  "Allocation",
  "Start Date",
  "End Date",
  "Notes",
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

  const rows = await getTrackerOverrideExportRows(year)
  const content = serializeCsv(rows, HEADERS)

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tracker-overrides-${year}.csv"`,
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

    const result = await importTrackerOverridesCsv(year, await file.text(), {
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
    const result = await deleteTrackerOverridesForYear(
      {
        year: Number(body.year),
      },
      {
        name: viewer.name,
        email: viewer.email,
      }
    )

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delete failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
