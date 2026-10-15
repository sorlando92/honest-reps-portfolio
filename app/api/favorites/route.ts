import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { starEntry } from "@/modules/nutrition/entries/quick-add"

const body = z.object({ entryId: z.uuid() })

/** Stars a logged entry as a favorite (PRD F2). */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 })
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  const id = await starEntry(supabase, userId, parsed.data.entryId)
  return id ? NextResponse.json({ id }, { status: 201 }) : NextResponse.json({ error: "Not found" }, { status: 404 })
}
