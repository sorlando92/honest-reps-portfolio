import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { track } from "@/core/events/track"
import { localToday } from "@/core/time/local-day"

const body = z.object({
  date: z.iso.date(),
  /** Empty clears the note. 1,000 characters at most (Q58). */
  body: z.string().max(1000),
})

/** Saves the day note for a local day (docs/SCREENS_V2.md "Day notes"). */
export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 })
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid note" }, { status: 400 })

  const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", userId).single()
  if (parsed.data.date > localToday(profile?.timezone ?? "UTC")) return NextResponse.json({ error: "Future day" }, { status: 400 })

  const text = parsed.data.body.trim()
  const { error } = text
    ? await supabase
        .from("day_notes")
        .upsert({ user_id: userId, local_date: parsed.data.date, body: text, updated_at: new Date().toISOString() }, { onConflict: "user_id,local_date" })
    : await supabase.from("day_notes").delete().eq("user_id", userId).eq("local_date", parsed.data.date)
  if (error) {
    console.error("[day-notes] save failed", { userId, code: error.code, message: error.message })
    return NextResponse.json({ error: "Not saved" }, { status: 500 })
  }
  await track("day_note_saved", { cleared: !text })
  return NextResponse.json({ ok: true })
}
