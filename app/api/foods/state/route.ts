import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { matchForState } from "@/modules/nutrition/foods/state"
import { withinRateLimit } from "@/core/rate-limit"

const params = z.object({ name: z.string().trim().min(2).max(300), state: z.enum(["raw", "cooked", "dry"]) })

/** The matching food entry when the user flips Raw / Cooked / Dry on a row (PRD F2). */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 })
  const url = new URL(request.url)
  const parsed = params.safeParse({ name: url.searchParams.get("name"), state: url.searchParams.get("state") })
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

  const admin = createAdminClient()
  // Shares the food search budget: each flip spends three USDA requests.
  if (!(await withinRateLimit(admin, `food-search:${userId}`, 120, 3600))) return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  return NextResponse.json({ result: await matchForState(admin, parsed.data.name, parsed.data.state) })
}
