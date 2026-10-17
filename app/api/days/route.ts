import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { dailyTotals } from "@/modules/nutrition/days/daily"
import { daysBetween } from "@/modules/nutrition/days/week"

const query = z.object({
  /** Whose days: the caller by default; RLS decides (the coach reads assigned clients). */
  user: z.uuid().optional(),
  from: z.iso.date(),
  to: z.iso.date(),
})

/** Day totals for the week strip and month calendar (NAV_SPEC 4), at most 62 days. */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 })
  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  const { from, to } = parsed.data
  const span = daysBetween(from, to)
  if (span < 0 || span > 61) return NextResponse.json({ error: "Invalid range" }, { status: 400 })
  try {
    const days = await dailyTotals(supabase, parsed.data.user ?? userId, from, to)
    return NextResponse.json(days, { headers: { "cache-control": "private, no-store" } })
  } catch (error) {
    console.error("[days] failed", { userId, message: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: "Not loaded" }, { status: 500 })
  }
}
