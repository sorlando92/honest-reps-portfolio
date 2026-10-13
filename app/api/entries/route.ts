import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { track } from "@/core/events/track"
import { foodLoggedProps, saveEntry, saveEntryBody } from "@/modules/nutrition/entries/save"

/** Saves a confirmed card (or an offline entry being synced). */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 })

  const json = await request.json().catch(() => null)
  const parsed = saveEntryBody.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: "Invalid entry" }, { status: 400 })
  const offline = Boolean((json as { offline?: unknown } | null)?.offline)

  const result = await saveEntry(supabase, userId, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  if (!result.duplicate) await track("food_logged", foodLoggedProps(parsed.data, offline))
  return NextResponse.json({ entryId: result.entryId }, { status: result.duplicate ? 200 : 201 })
}
