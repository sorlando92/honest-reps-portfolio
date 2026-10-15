import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { portionForFood } from "@/modules/nutrition/foods/search"

/** The common portion a picked USDA food starts at (PM 2026-10-15). */
export async function GET(_request: Request, ctx: RouteContext<"/api/foods/[id]/portion">) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 })
  const id = z.uuid().safeParse((await ctx.params).id)
  if (!id.success) return NextResponse.json({ error: "Invalid food" }, { status: 400 })

  const admin = createAdminClient()
  // Shares the search budget: a lookup can spend one USDA request.
  const { data: allowed } = await admin.rpc("hit_rate_limit", { p_key: `food-search:${userId}`, p_limit: 120, p_window_seconds: 3600 })
  if (allowed === false) return NextResponse.json({ portion: null })
  return NextResponse.json({ portion: await portionForFood(admin, id.data) })
}
