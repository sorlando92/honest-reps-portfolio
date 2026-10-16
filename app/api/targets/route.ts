import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { userCalorieFloor } from "@/modules/nutrition/targets/current"

const body = z.object({
  calories: z.number().int().min(500).max(10000),
  proteinG: z.number().int().min(0).max(1000),
  carbsG: z.number().int().min(0).max(2000),
  fatG: z.number().int().min(0).max(1000),
  /** The user confirmed going below their estimated BMR. */
  belowFloorConfirmed: z.boolean().default(false),
})

/**
 * A free user sets their own targets from Me (PRD F1). Paid clients' targets
 * are set by the coach; RLS refuses their rows too. Below the BMR floor
 * needs an explicit confirmation.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 })
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid targets" }, { status: 400 })

  const { data: profile } = await supabase.from("profiles").select("tier").eq("id", userId).single()
  if (profile?.tier !== "free") return NextResponse.json({ error: "Your coach sets your targets" }, { status: 403 })

  const t = parsed.data
  const floor = await userCalorieFloor(supabase, userId)
  if (floor !== null && t.calories < floor && !t.belowFloorConfirmed) {
    return NextResponse.json({ error: "below_floor", floor }, { status: 409 })
  }
  const { error } = await supabase
    .from("targets")
    .insert({ user_id: userId, calories: t.calories, protein_g: t.proteinG, carbs_g: t.carbsG, fat_g: t.fatG, set_by: "user" })
  if (error) {
    console.error("[targets] save failed", { userId, code: error.code, message: error.message })
    return NextResponse.json({ error: "Not saved" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
