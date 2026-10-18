import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { checkinFollowupPush, checkinOpenPush } from "@/core/notifications/copy"
import { pushToUser } from "@/core/notifications/push"
import { coachName } from "@/core/people"
import { createAdminClient } from "@/lib/supabase/admin"

interface Due {
  user_id: string
  kind: "checkin_open" | "checkin_followup"
  week_of: string
  coach_id: string
}

function authorized(request: Request): boolean {
  const secret = process.env.JOBS_SECRET
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? ""
  if (!secret || given.length !== secret.length) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret))
}

/**
 * Called by pg_cron every 15 minutes (Q76). Sends the check-in reminders that
 * are due (due_checkin_reminders), each once: the row in notifications_sent
 * is claimed before the push goes out. When both are due for someone (the
 * job was down all day), only the follow-up is sent.
 */
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const admin = createAdminClient()
  const { data, error } = await admin.rpc("due_checkin_reminders")
  if (error) {
    console.error("[jobs] due_checkin_reminders failed", { code: error.code })
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
  const due = (data ?? []) as Due[]
  const followups = new Set(due.filter((d) => d.kind === "checkin_followup").map((d) => d.user_id))
  const names = new Map<string, string>()
  let sent = 0

  for (const d of due) {
    const { data: claimed } = await admin
      .from("notifications_sent")
      .upsert({ user_id: d.user_id, kind: d.kind, ref: d.week_of }, { onConflict: "user_id,kind,ref", ignoreDuplicates: true })
      .select("user_id")
    if (!claimed?.length) continue
    if (d.kind === "checkin_open" && followups.has(d.user_id)) continue
    if (!names.has(d.coach_id)) names.set(d.coach_id, await coachName(admin, d.coach_id))
    const message = d.kind === "checkin_open" ? checkinOpenPush() : checkinFollowupPush(names.get(d.coach_id)!)
    sent += (await pushToUser(admin, d.user_id, message)) > 0 ? 1 : 0
  }
  return NextResponse.json({ due: due.length, sent })
}
