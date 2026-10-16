import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { track } from "@/core/events/track"
import { localToday } from "@/core/time/local-day"
import { fromDisplay } from "@/modules/nutrition/weight/trend"

const body = z.object({
  date: z.iso.date(),
  /** In the profile's units (lb or kg). */
  weight: z.number().positive().max(1000),
})

/**
 * Logs the weigh-in for a local day, replacing one already there (PRD F4:
 * one per day, any day from Today or Progress). Stored in kg.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 })
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid weight" }, { status: 400 })

  const { data: profile } = await supabase.from("profiles").select("units, timezone").eq("id", userId).single()
  if (parsed.data.date > localToday(profile?.timezone ?? "UTC")) return NextResponse.json({ error: "Future day" }, { status: 400 })
  const kg = Math.round(fromDisplay(parsed.data.weight, profile?.units === "metric" ? "metric" : "imperial") * 100) / 100
  if (kg < 20 || kg > 400) return NextResponse.json({ error: "Check the weight" }, { status: 400 })

  const { error } = await supabase
    .from("weights")
    .upsert({ user_id: userId, date: parsed.data.date, weight_kg: kg, updated_at: new Date().toISOString() }, { onConflict: "user_id,date" })
  if (error) {
    console.error("[weights] save failed", { userId, code: error.code, message: error.message })
    return NextResponse.json({ error: "Not saved" }, { status: 500 })
  }
  await track("weight_logged")
  return NextResponse.json({ ok: true, weightKg: kg })
}
