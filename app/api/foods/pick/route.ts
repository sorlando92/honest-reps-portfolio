import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { pickFdc } from "@/modules/nutrition/foods/search"

const PICKS_PER_HOUR = 600

const body = z.object({ fdcId: z.number().int().positive() })

/** A tapped FDC search result, copied into food_items so it can be logged. */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 })

  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid food" }, { status: 400 })

  const admin = createAdminClient()
  const { data: allowed } = await admin.rpc("hit_rate_limit", { p_key: `food-pick:${userId}`, p_limit: PICKS_PER_HOUR, p_window_seconds: 3600 })
  if (allowed === false) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

  const result = await pickFdc(admin, parsed.data.fdcId)
  if (!result) return NextResponse.json({ error: "Unknown food" }, { status: 404 })
  return NextResponse.json({ result })
}
