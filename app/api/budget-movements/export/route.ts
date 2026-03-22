import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import { serializeCsv } from "@/lib/finance/csv"
import { getBudgetMovementExportRows } from "@/lib/finance/queries"

const HEADERS = [
  "Date",
  "Source",
  "Batch File",
  "Category",
  "Funding",
  "Giving Funding",
  "Giving Pillar",
  "Receiving Cost Center",
  "Receiving Project Code",
  "Receiving Domain Code",
  "Area Domain",
  "Area Sub-domain",
  "Area Display Name",
  "Finance View Amount",
  "Amount Given",
  "CAPEX Target",
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

  const rows = await getBudgetMovementExportRows(
    {
      year,
      search: searchParams.get("search") ?? undefined,
      category: searchParams.get("category") ?? undefined,
      funding: searchParams.get("funding") ?? undefined,
      receivingFunding: searchParams.get("receivingFunding") ?? undefined,
      givingPillar: searchParams.get("givingPillar") ?? undefined,
    },
    viewer
  )
  const content = serializeCsv(rows, HEADERS)

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="budget-movements-${year}.csv"`,
    },
  })
}
