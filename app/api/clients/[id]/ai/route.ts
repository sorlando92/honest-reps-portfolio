import { NextResponse } from "next/server"
import { z } from "zod"
import { requireCoach } from "@/core/auth/require-coach"
import { createAdminClient } from "@/lib/supabase/admin"

const body = z.object({ enabled: z.boolean() })

/**
 * Turns AI logging on or off for one client. Only the client's assigned
 * coach may; clients have no update grant on ai_enabled, so this writes with
 * the service role after the coach check and records who changed it and when.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/clients/[id]/ai">) {
  const coach = await requireCoach()
  if (!coach) return NextResponse.json({ error: "Coach only" }, { status: 403 })
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Not your client" }, { status: 403 })

  const admin = createAdminClient()
  const { data: client } = await admin.from("profiles").select("coach_id").eq("id", id).maybeSingle()
  if (!client || client.coach_id !== coach.id) return NextResponse.json({ error: "Not your client" }, { status: 403 })

  const { data: saved, error } = await admin
    .from("profiles")
    .update({ ai_enabled: parsed.data.enabled, ai_enabled_changed_by: coach.id, ai_enabled_changed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("coach_id", coach.id)
    .select("ai_enabled")
    .single()
  if (error || !saved) return NextResponse.json({ error: "Not saved" }, { status: 500 })
  return NextResponse.json({ enabled: saved.ai_enabled })
}
