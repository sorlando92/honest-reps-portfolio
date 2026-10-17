import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { foodItemResult } from "@/modules/nutrition/foods/search"

const body = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("confirmed") }),
  // Not this: first without a pick (the search opens), then with the food the user chose.
  z.object({ outcome: z.literal("not_this"), chosenFoodItemId: z.uuid().nullable() }),
  // A miss: the food the user saved from the label, entered or picked in search instead.
  z.object({ outcome: z.literal("replaced"), chosenFoodItemId: z.uuid() }),
])

/**
 * What the user did with a barcode result (docs/FOOD_LOOKUP_SPEC.md 3). The
 * food picked after "Not this" becomes the user's match for that GTIN.
 * Runs as the user: RLS limits it to their own scans.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/foods/barcode/scans/[id]">) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 })

  const id = z.uuid().safeParse((await ctx.params).id)
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!id.success || !parsed.success) return NextResponse.json({ error: "Invalid outcome" }, { status: 400 })

  const { data: scan } = await supabase.from("barcode_scans").select("id, gtin").eq("id", id.data).eq("user_id", userId).maybeSingle()
  if (!scan) return NextResponse.json({ error: "Unknown scan" }, { status: 404 })

  const chosen = parsed.data.outcome === "confirmed" ? null : parsed.data.chosenFoodItemId
  if (chosen && !(await foodItemResult(supabase, chosen))) return NextResponse.json({ error: "Unknown food" }, { status: 400 })

  const { error } = await supabase
    .from("barcode_scans")
    .update(
      parsed.data.outcome === "replaced"
        ? { chosen_food_item_id: chosen }
        : { outcome: parsed.data.outcome, ...(parsed.data.outcome === "not_this" ? { chosen_food_item_id: chosen } : {}) }
    )
    .eq("id", scan.id)
  if (error) return NextResponse.json({ error: "Save failed" }, { status: 500 })

  if (chosen && scan.gtin) {
    const saved = await supabase.from("barcode_matches").upsert({ user_id: userId, gtin: scan.gtin, food_item_id: chosen, created_at: new Date().toISOString() }, { onConflict: "user_id,gtin" })
    if (saved.error) return NextResponse.json({ error: "Save failed" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
