import { NextResponse } from "next/server"
import { hasFullDomainAccess, requireApiAccess } from "@/lib/authz"
import { serializeCsv } from "@/lib/finance/csv"
import {
  getTrackerDomainExportRows,
  TRACKER_DOMAIN_EXPORT_HEADERS,
} from "@/lib/finance/queries"

function sanitizeFileNamePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export async function GET(request: Request) {
  const viewer = await requireApiAccess("GUEST")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  const { searchParams } = new URL(request.url)
  const year = Number(searchParams.get("year"))
  const domain = searchParams.get("domain")?.trim() ?? ""

  if (!Number.isInteger(year) || !domain) {
    return NextResponse.json(
      { error: "Year and domain are required" },
      { status: 400 }
    )
  }

  if (!hasFullDomainAccess(viewer, domain)) {
    return NextResponse.json(
      { error: "You do not have access to all data for this domain." },
      { status: 403 }
    )
  }

  const rows = await getTrackerDomainExportRows(year, domain, viewer)
  const content = serializeCsv(rows, [...TRACKER_DOMAIN_EXPORT_HEADERS], {
    delimiter: ";",
  })

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tracker-domain-${sanitizeFileNamePart(domain) || "export"}-${year}.csv"`,
    },
  })
}
