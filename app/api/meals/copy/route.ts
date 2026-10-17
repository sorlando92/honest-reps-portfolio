import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { track } from "@/core/events/track"
import { dayBounds, localToday } from "@/core/time/local-day"
import { loggedAtFor } from "@/modules/nutrition/entries/logged-at"
import { MEALS, mealAnchors } from "@/modules/nutrition/entries/meals"

const body = z.object({
  fromDate: z.iso.date(),
  meal: z.enum(MEALS),
  /** The day to copy into; today when missing. A past day is stamped at the meal anchor (Q52). */
  toDate: z.iso.date().optional(),
})

/**
 * Copies one meal from a local day into today or another day (docs/TODAY_SPEC.md
 * 6, NAV_SPEC 2): "Copy yesterday's lunch", "Copy to today". No model call.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 })
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

  const [{ data: profile }, { data: anchors }] = await Promise.all([
    supabase.from("profiles").select("timezone").eq("id", userId).single(),
    supabase.from("app_config").select("value").eq("key", "meal_anchors").maybeSingle(),
  ])
  const timezone = profile?.timezone ?? "UTC"
  const toDate = parsed.data.toDate ?? localToday(timezone)
  if (toDate > localToday(timezone)) return NextResponse.json({ error: "Future day" }, { status: 400 })
  const { start, end } = dayBounds(parsed.data.fromDate, timezone)
  const { data: copied, error } = await supabase.rpc("copy_meal", {
    p_from: start.toISOString(),
    p_to: end.toISOString(),
    p_meal: parsed.data.meal,
    p_logged_at: loggedAtFor(toDate, parsed.data.meal, timezone, mealAnchors(anchors?.value)).toISOString(),
  })
  if (error) return NextResponse.json({ error: "Not copied" }, { status: 400 })
  if (copied > 0) await track("meal_copied", { meal: parsed.data.meal, from_date: parsed.data.fromDate, to_date: toDate, entries: copied })
  return NextResponse.json({ copied })
}
