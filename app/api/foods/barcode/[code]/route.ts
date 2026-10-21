import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { logScan, lookupBarcode } from "@/modules/nutrition/foods/barcode"
import { candidates, type BarcodeFormat } from "@/modules/nutrition/foods/gtin"
import { withinRateLimit } from "@/core/rate-limit"

const LOOKUPS_PER_HOUR = 120

const params = z.object({
  format: z.enum(["upc_a", "upc_e", "ean_8", "ean_13", "itf", "unknown"]).catch("unknown"),
  // From the scanner: reads until two matched, and ms from camera start to that read.
  reads: z.coerce.number().int().min(0).max(1000).nullable().catch(null),
  ms: z.coerce.number().int().min(0).max(3_600_000).nullable().catch(null),
})

/**
 * A scanned or typed barcode to a product (docs/FOOD_LOOKUP_SPEC.md 3). A
 * code failing its check digit is refused; every lookup is written to the
 * scan log, and its id comes back so Log it and Not this can record the
 * outcome.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/foods/barcode/[code]">) {
  const started = Date.now()
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 })

  const raw = decodeURIComponent((await ctx.params).code).slice(0, 64)
  const search = new URL(request.url).searchParams
  const p = params.parse({ format: search.get("format") ?? "unknown", reads: search.get("reads"), ms: search.get("ms") })
  const gtins = candidates(raw, p.format as BarcodeFormat)
  if (!gtins.length) return NextResponse.json({ error: "Invalid barcode" }, { status: 400 })

  const admin = createAdminClient()
  if (!(await withinRateLimit(admin, `barcode:${userId}`, LOOKUPS_PER_HOUR, 3600))) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

  const lookup = await lookupBarcode(admin, userId, gtins)
  const msToResult = p.ms === null ? null : p.ms + (Date.now() - started)
  const scanId = await logScan(admin, { userId, rawRead: raw, lookup, gtin: gtins[0], readsToConfirm: p.reads, msToResult })
  return NextResponse.json({ scanId, result: lookup.result, source: lookup.source, gtin: lookup.gtin, msToResult })
}
