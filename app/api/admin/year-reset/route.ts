import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import {
  resetTrackingYearDataset,
  type ResettableTrackingYearDataset,
} from "@/lib/finance/queries"

function isResettableDataset(value: string): value is ResettableTrackingYearDataset {
  return [
    "people-roster",
    "forecasts",
    "actuals",
    "budget-movements",
    "internal-costs",
  ].includes(value)
}

export async function POST(request: Request) {
  const viewer = await requireApiAccess("ADMIN")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = await request.json()
    const dataset = String(body.dataset || "")

    if (!isResettableDataset(dataset)) {
      return NextResponse.json({ error: "Unsupported dataset" }, { status: 400 })
    }

    const result = await resetTrackingYearDataset(
      {
        year: Number(body.year),
        dataset,
      },
      {
        name: viewer.name,
        email: viewer.email,
      }
    )

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reset failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
