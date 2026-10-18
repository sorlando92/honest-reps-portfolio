import { NextResponse } from "next/server"
import { track } from "@/core/events/track"
import { checkinState, isDue } from "@/core/checkins/state"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

/** Starts this week's check-in (PRD F5) and returns its id; safe to repeat. */
export async function POST() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 })

  const state = await checkinState(supabase, userId)
  if (!isDue(state)) return NextResponse.json({ error: state?.submittedAt ? "Already submitted" : "Not open" }, { status: 409 })
  if (state.checkinId) return NextResponse.json({ id: state.checkinId })

  const { data: profile } = await supabase.from("profiles").select("coach_id").eq("id", userId).single()
  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from("checkins")
    .upsert({ user_id: userId, coach_id: profile?.coach_id ?? null, week_of: state.weekOf }, { onConflict: "user_id,week_of", ignoreDuplicates: true })
    .select("id")
    .maybeSingle()
  const id = row?.id ?? (await admin.from("checkins").select("id").eq("user_id", userId).eq("week_of", state.weekOf).single()).data?.id
  if (error || !id) return NextResponse.json({ error: "Not saved" }, { status: 500 })
  if (row) await track("checkin_started", { week_of: state.weekOf })
  return NextResponse.json({ id })
}
