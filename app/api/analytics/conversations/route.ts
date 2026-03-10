import { NextResponse } from "next/server"
import { getSeedConversations } from "@/lib/seed-data"

export async function GET() {
  const conversations = getSeedConversations()
  return NextResponse.json(conversations)
}
