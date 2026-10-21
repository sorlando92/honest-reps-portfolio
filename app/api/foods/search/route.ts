import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { searchIndex } from "@/modules/nutrition/foods/search"
import { withinRateLimit } from "@/core/rate-limit"

// Search as you type runs on the local index (docs/FOOD_LOOKUP_SPEC.md 2):
// one request per pause in typing, so the limit only stops runaway clients.
const SEARCHES_PER_HOUR = 1500

// Empty returns the user's most logged foods (the sheet opened from the search glyph).
const query = z.string().trim().max(100)

/** Food search for the log bar, Add item, Change food and Not this. */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 })

  const q = query.safeParse(new URL(request.url).searchParams.get("q") ?? "")
  if (!q.success) return NextResponse.json({ error: "Invalid search" }, { status: 400 })

  if (!(await withinRateLimit(createAdminClient(), `food-search:${userId}`, SEARCHES_PER_HOUR, 3600))) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

  try {
    return NextResponse.json({ sections: await searchIndex(supabase, q.data) })
  } catch {
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }
}
