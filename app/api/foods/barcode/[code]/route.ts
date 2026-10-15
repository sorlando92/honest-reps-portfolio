import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { lookupBarcode, normalizeBarcode } from "@/modules/nutrition/foods/barcode"

const LOOKUPS_PER_HOUR = 120

/** A scanned or typed barcode to a product (PRD F2, Open Food Facts). */
export async function GET(_request: Request, ctx: RouteContext<"/api/foods/barcode/[code]">) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 })
  const code = normalizeBarcode((await ctx.params).code)
  if (!code) return NextResponse.json({ error: "Invalid barcode" }, { status: 400 })

  const admin = createAdminClient()
  const { data: allowed } = await admin.rpc("hit_rate_limit", { p_key: `barcode:${userId}`, p_limit: LOOKUPS_PER_HOUR, p_window_seconds: 3600 })
  if (allowed === false) return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  return NextResponse.json({ result: await lookupBarcode(admin, code) })
}
