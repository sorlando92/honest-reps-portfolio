import { NextResponse } from "next/server"
import { z } from "zod"
import { requireCoach } from "@/core/auth/require-coach"
import { issueInvite } from "@/core/invites/create"
import { createAdminClient } from "@/lib/supabase/admin"

const body = z.object({
  email: z.email().max(254),
  firstName: z.string().trim().max(40).nullable(),
  billingSource: z.enum(["comped", "external"]),
})

/** Creates and emails a client invite (PRD F12). The link comes back once for Copy link. */
export async function POST(request: Request) {
  const coach = await requireCoach()
  if (!coach) return NextResponse.json({ error: "Coach only" }, { status: 403 })
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid invite" }, { status: 400 })
  const issued = await issueInvite(createAdminClient(), coach, {
    email: parsed.data.email.toLowerCase(),
    firstName: parsed.data.firstName || null,
    billingSource: parsed.data.billingSource,
  })
  if (!issued) return NextResponse.json({ error: "Not saved" }, { status: 500 })
  return NextResponse.json(issued)
}
