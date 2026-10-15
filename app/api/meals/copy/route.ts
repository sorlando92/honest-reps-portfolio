import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { track } from "@/core/events/track"
import { dayBounds } from "@/core/time/local-day"
import { MEALS } from "@/modules/nutrition/entries/meals"

const body = z.object({
  fromDate: z.iso.date(),
  meal: z.enum(MEALS),
})

/**
 * Copies one meal from a local day to now (docs/TODAY_SPEC.md 6): "Copy
 * yesterday's lunch" on today, "Copy to today" on a past day. No model call.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 })
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

  const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", userId).single()
  const { start, end } = dayBounds(parsed.data.fromDate, profile?.timezone ?? "UTC")
  const { data: copied, error } = await supabase.rpc("copy_meal", {
    p_from: start.toISOString(),
    p_to: end.toISOString(),
    p_meal: parsed.data.meal,
    p_logged_at: new Date().toISOString(),
  })
  if (error) return NextResponse.json({ error: "Not copied" }, { status: 400 })
  if (copied > 0) await track("meal_copied", { meal: parsed.data.meal, from_date: parsed.data.fromDate, entries: copied })
  return NextResponse.json({ copied })
}
