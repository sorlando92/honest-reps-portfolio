import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { progressSummary } from "@/modules/nutrition/progress/summary"
import { WEIGHT_RANGES, type WeightRange } from "@/modules/nutrition/progress/types"

const query = z.object({
  /** Whose progress: the caller by default; the coach passes a client's id (step 5). RLS decides. */
  user: z.uuid().optional(),
  week: z.iso.date(),
  range: z.coerce.number().refine((n): n is WeightRange => (WEIGHT_RANGES as readonly number[]).includes(n)),
})

/** The Progress screen's data for another week or weight range (docs/PROGRESS_SPEC.md). */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 })
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const parsed = query.safeParse(params)
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  try {
    const summary = await progressSummary(supabase, parsed.data.user ?? userId, parsed.data.week, parsed.data.range as WeightRange)
    return NextResponse.json(summary, { headers: { "cache-control": "private, no-store" } })
  } catch (error) {
    console.error("[progress] summary failed", { userId, message: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: "Not loaded" }, { status: 500 })
  }
}
