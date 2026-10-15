import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { searchFoods } from "@/modules/nutrition/foods/search"

// Each search spends three USDA requests from a key shared by every user
// (3,600 an hour) until the local FDC import lands (QUESTIONS.md Q40).
const SEARCHES_PER_HOUR = 120

const query = z.string().trim().min(2).max(100)

/** Food search for Add item, search logging and the parse fallback. */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 })

  const q = query.safeParse(new URL(request.url).searchParams.get("q"))
  if (!q.success) return NextResponse.json({ error: "Invalid search" }, { status: 400 })

  const admin = createAdminClient()
  const { data: allowed } = await admin.rpc("hit_rate_limit", {
    p_key: `food-search:${userId}`,
    p_limit: SEARCHES_PER_HOUR,
    p_window_seconds: 3600,
  })
  if (allowed === false) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

  return NextResponse.json({ results: await searchFoods(admin, q.data) })
}
