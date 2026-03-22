import { NextResponse } from "next/server"
import type { SeatReferenceValueType } from "@prisma/client"
import { requireApiAccess } from "@/lib/authz"
import {
  deleteSeatReferenceValue,
  getSeatReferenceValues,
  upsertSeatReferenceValue,
} from "@/lib/finance/queries"

export async function GET(request: Request) {
  const viewer = await requireApiAccess("MEMBER")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const { searchParams } = new URL(request.url)
    const year = Number(searchParams.get("year"))
    const type = searchParams.get("type")?.trim().toUpperCase() as
      | SeatReferenceValueType
      | undefined

    if (!Number.isInteger(year)) {
      return NextResponse.json({ error: "Year is required" }, { status: 400 })
    }

    const values = await getSeatReferenceValues(year)

    return NextResponse.json({
      values: type ? values.filter((value) => value.type === type) : values,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Load failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function POST(request: Request) {
  const viewer = await requireApiAccess("ADMIN")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = await request.json()
    const value = await upsertSeatReferenceValue(
      {
        id: body.id ? String(body.id).trim() : undefined,
        year: Number(body.year),
        type: String(body.type) as SeatReferenceValueType,
        value: String(body.value || "").trim(),
      },
      {
        name: viewer.name,
        email: viewer.email,
      }
    )

    return NextResponse.json({ value })
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
    const deleted = await deleteSeatReferenceValue(
      {
        year: Number(body.year),
        id: String(body.id || "").trim(),
      },
      {
        name: viewer.name,
        email: viewer.email,
      }
    )

    return NextResponse.json({ value: deleted })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delete failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
