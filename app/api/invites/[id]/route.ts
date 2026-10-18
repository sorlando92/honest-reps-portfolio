import { NextResponse } from "next/server"
import { z } from "zod"
import { requireCoach } from "@/core/auth/require-coach"
import { issueInvite } from "@/core/invites/create"
import { createAdminClient } from "@/lib/supabase/admin"

const body = z.object({ action: z.enum(["revoke", "resend"]) })

/**
 * Revoke or resend a pending invite (Q69). Resend revokes the old token and
 * issues a new one to the same person, so only the newest link works.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/invites/[id]">) {
  const coach = await requireCoach()
  if (!coach) return NextResponse.json({ error: "Coach only" }, { status: 403 })
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  const { id } = await params
  const admin = createAdminClient()

  const { data: invite } = await admin
    .from("invites")
    .select("id, email, first_name, billing_source, claimed_at, revoked_at")
    .eq("id", id)
    .eq("coach_id", coach.id)
    .maybeSingle()
  if (!invite) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (invite.claimed_at) return NextResponse.json({ error: "Already used" }, { status: 409 })

  if (!invite.revoked_at) {
    const { error } = await admin.from("invites").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("claimed_at", null)
    if (error) return NextResponse.json({ error: "Not saved" }, { status: 500 })
  }
  if (parsed.data.action === "revoke") return NextResponse.json({ ok: true })

  const issued = await issueInvite(admin, coach, {
    email: invite.email as string,
    firstName: (invite.first_name as string | null) ?? null,
    billingSource: invite.billing_source as "comped" | "external",
  })
  if (!issued) return NextResponse.json({ error: "Not saved" }, { status: 500 })
  return NextResponse.json(issued)
}
