import { NextResponse } from "next/server"
import { trackRequestSchema } from "@/core/events/schema"
import { track } from "@/core/events/track"
import type { EventName } from "@/core/events/names"

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = trackRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 })
  }

  const result = await track(parsed.data.name as EventName, parsed.data.props)
  return NextResponse.json({ result }, { status: result === "recorded" ? 202 : 403 })
}
