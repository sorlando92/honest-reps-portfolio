import { NextResponse } from "next/server"
import { track } from "@/core/events/track"
import { openOwnCheckin } from "@/core/checkins/owned"
import { toQuestion } from "@/core/checkins/questions"
import { validateSubmission } from "@/core/checkins/submission"
import { newCheckinPush } from "@/core/notifications/copy"
import { pushToUser } from "@/core/notifications/push"
import { firstName } from "@/core/people"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

/** Sends the check-in (PRD F5): on time until the overdue time, late after it until it closes. */
export async function POST(request: Request, { params }: RouteContext<"/api/checkins/[id]/submit">) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 })
  const state = await openOwnCheckin(supabase, userId, id)
  if (!state) return NextResponse.json({ error: "Not open" }, { status: 409 })

  const { data: profile } = await supabase.from("profiles").select("coach_id, display_name").eq("id", userId).single()
  const { data: rows } = await supabase
    .from("checkin_questions")
    .select("id, position, type, prompt, low_label, high_label, optional, report_tag")
    .eq("coach_id", profile?.coach_id ?? "")
    .eq("active", true)
    .order("position")
  const result = validateSubmission((rows ?? []).map(toQuestion), await request.json().catch(() => null))
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  const now = new Date()
  const onTime = now.getTime() < new Date(state.overdueAt).getTime()
  const admin = createAdminClient()
  const { data: saved, error } = await admin
    .from("checkins")
    .update({ submitted_at: now.toISOString(), on_time: onTime, weight_kg: result.weightKg, answers: result.answers })
    .eq("id", id)
    .is("submitted_at", null)
    .select("id")
  if (error) return NextResponse.json({ error: "Not saved" }, { status: 500 })
  if (!saved?.length) return NextResponse.json({ error: "Already submitted" }, { status: 409 })

  await track("checkin_submitted", { on_time: onTime, week_of: state.weekOf })
  if (profile?.coach_id) {
    await pushToUser(admin, profile.coach_id, newCheckinPush(firstName(profile.display_name as string | null) ?? "A client", id))
  }
  return NextResponse.json({ ok: true, onTime })
}
