import { NextResponse } from "next/server"
import type { BudgetMovementBucket } from "@prisma/client"
import { requireApiAccess } from "@/lib/authz"
import {
  deleteBudgetMovementCategoryMapping,
  upsertBudgetMovementCategoryMapping,
} from "@/lib/finance/queries"

function isBudgetMovementBucket(value: string): value is BudgetMovementBucket {
  return (
    value === "PERM" ||
    value === "EXT" ||
    value === "CLOUD" ||
    value === "AMS" ||
    value === "LICENSES"
  )
}

export async function POST(request: Request) {
  const viewer = await requireApiAccess("ADMIN")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = await request.json()
    const bucket = String(body.bucket || "").trim().toUpperCase()

    if (!isBudgetMovementBucket(bucket)) {
      return NextResponse.json({ error: "A valid bucket is required" }, { status: 400 })
    }

    const mapping = await upsertBudgetMovementCategoryMapping(
      {
        id: body.id ? String(body.id).trim() : undefined,
        year: Number(body.year),
        category: String(body.category || "").trim(),
        bucket,
        notes: body.notes ? String(body.notes) : undefined,
      },
      {
        name: viewer.name,
        email: viewer.email,
      }
    )

    return NextResponse.json({ mapping })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Save failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const PATCH = POST

export async function DELETE(request: Request) {
  const viewer = await requireApiAccess("ADMIN")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = await request.json()
    const id = String(body.id || "").trim()
    const year = Number(body.year)

    if (!id) {
      return NextResponse.json({ error: "Mapping id is required" }, { status: 400 })
    }

    const mapping = await deleteBudgetMovementCategoryMapping(
      {
        year,
        id,
      },
      {
        name: viewer.name,
        email: viewer.email,
      }
    )

    return NextResponse.json({ mapping })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delete failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
