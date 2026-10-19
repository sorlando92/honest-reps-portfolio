import { createHash, timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { runCheckinReminders } from "@/core/jobs/checkin-reminders"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Constant time comparison of the Bearer secret (Q76). Both sides are hashed
 * first so the comparison takes the same time whatever the given length.
 */
function authorized(request: Request): boolean {
  const secret = process.env.JOBS_SECRET
  if (!secret) return false
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? ""
  const digest = (s: string) => createHash("sha256").update(s).digest()
  return timingSafeEqual(digest(given), digest(secret))
}

/** Called by pg_cron every 15 minutes through pg_net (Q76, ARCHITECTURE "Check-in reminders"). */
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const result = await runCheckinReminders(createAdminClient())
  return NextResponse.json(result, { status: result.outcome === "ok" ? 200 : 500 })
}
