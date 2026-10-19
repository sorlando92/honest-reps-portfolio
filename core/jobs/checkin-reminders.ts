import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { checkinFollowupPush, checkinOpenPush } from "@/core/notifications/copy"
import { pushToUser } from "@/core/notifications/push"
import { coachName } from "@/core/people"

interface Due {
  user_id: string
  kind: "checkin_open" | "checkin_followup"
  week_of: string
  coach_id: string
}

export interface JobResult {
  outcome: "ok" | "error"
  due: number
  claimed: number
  sent: number
  ms: number
}

/**
 * Sends the check-in reminders that are due (due_checkin_reminders), each at
 * most once: the notifications_sent row is claimed before the push goes out,
 * so overlapping or repeated runs never send twice (Q76). When both are due
 * for someone (the job was down all day), only the follow-up is sent. Every
 * run is logged to events as job_run with no user id.
 */
export async function runCheckinReminders(admin: SupabaseClient, now?: Date): Promise<JobResult> {
  const started = Date.now()
  const result: JobResult = { outcome: "ok", due: 0, claimed: 0, sent: 0, ms: 0 }
  try {
    const { data, error } = await admin.rpc("due_checkin_reminders", now ? { p_now: now.toISOString() } : {})
    if (error) throw new Error(`due_checkin_reminders: ${error.code}`)
    const due = (data ?? []) as Due[]
    result.due = due.length
    const followups = new Set(due.filter((d) => d.kind === "checkin_followup").map((d) => d.user_id))
    const names = new Map<string, string>()

    for (const d of due) {
      const { data: claimed, error: claimError } = await admin
        .from("notifications_sent")
        .upsert({ user_id: d.user_id, kind: d.kind, ref: d.week_of }, { onConflict: "user_id,kind,ref", ignoreDuplicates: true })
        .select("user_id")
      if (claimError) throw new Error(`notifications_sent: ${claimError.code}`)
      if (!claimed?.length) continue
      result.claimed++
      if (d.kind === "checkin_open" && followups.has(d.user_id)) continue
      if (!names.has(d.coach_id)) names.set(d.coach_id, await coachName(admin, d.coach_id))
      const message = d.kind === "checkin_open" ? checkinOpenPush() : checkinFollowupPush(names.get(d.coach_id)!)
      if ((await pushToUser(admin, d.user_id, message)) > 0) result.sent++
    }
  } catch (error) {
    result.outcome = "error"
    console.error("[jobs] checkin reminders failed", { message: (error as Error).message })
  }
  result.ms = Date.now() - started
  const { error: logError } = await admin
    .from("events")
    .insert({ user_id: null, name: "job_run", props: { job: "checkin_reminders", ...result } })
  if (logError) console.error("[jobs] job_run not logged", { code: logError.code })
  return result
}
