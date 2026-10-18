import { NextResponse } from "next/server"
import { z } from "zod"
import { requireCoach } from "@/core/auth/require-coach"
import { track } from "@/core/events/track"
import { coachReplyPush } from "@/core/notifications/copy"
import { pushToUser } from "@/core/notifications/push"
import { coachName } from "@/core/people"
import { createAdminClient } from "@/lib/supabase/admin"

const body = z.object({ body: z.string().trim().min(1).max(4000) })

/** The coach's reply to a submitted check-in (PRD F5): saved as a message, pushed to the client. */
export async function POST(request: Request, { params }: RouteContext<"/api/checkins/[id]/reply">) {
  const coach = await requireCoach()
  if (!coach) return NextResponse.json({ error: "Coach only" }, { status: 403 })
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Empty reply" }, { status: 400 })
  const { id } = await params
  const admin = createAdminClient()

  const { data: checkin } = await admin.from("checkins").select("id, user_id, submitted_at").eq("id", id).maybeSingle()
  if (!checkin?.submitted_at) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const { data: client } = await admin.from("profiles").select("coach_id").eq("id", checkin.user_id).single()
  if (client?.coach_id !== coach.id) return NextResponse.json({ error: "Not your client" }, { status: 403 })

  const { error } = await admin
    .from("messages")
    .insert({ thread_user_id: checkin.user_id, sender_id: coach.id, checkin_id: id, body: parsed.data.body })
  if (error) return NextResponse.json({ error: "Not saved" }, { status: 500 })

  await track("message_sent", { role: "coach", checkin: true })
  await pushToUser(admin, checkin.user_id as string, coachReplyPush(await coachName(admin, coach.id), parsed.data.body))
  return NextResponse.json({ ok: true })
}
