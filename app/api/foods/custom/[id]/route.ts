import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { customFoodColumns } from "@/modules/nutrition/foods/custom"
import { customFoodInput } from "@/modules/nutrition/foods/custom-input"
import { toFoodResult, type FoodItemRow } from "@/modules/nutrition/foods/hits"
import { FOOD_ITEM_COLUMNS } from "@/modules/nutrition/foods/search"

async function signedIn() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  return { supabase, userId: data?.claims?.sub ?? null }
}

/** Edit a custom food in More, My foods. RLS allows only the owner. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/foods/custom/[id]">) {
  const { supabase, userId } = await signedIn()
  if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 })
  const id = z.uuid().safeParse((await ctx.params).id)
  const parsed = customFoodInput.safeParse(await request.json().catch(() => null))
  if (!id.success || !parsed.success) return NextResponse.json({ error: "Invalid food" }, { status: 400 })
  const columns = customFoodColumns(parsed.data)
  if (!columns) return NextResponse.json({ error: "Invalid barcode" }, { status: 400 })

  const { data: row, error } = await supabase
    .from("food_items")
    .update(columns)
    .eq("id", id.data)
    .eq("owner_id", userId)
    .select(FOOD_ITEM_COLUMNS)
    .maybeSingle()
  if (error?.code === "23505") return NextResponse.json({ error: "You already have a food with this barcode" }, { status: 409 })
  if (error) return NextResponse.json({ error: "Save failed" }, { status: 500 })
  if (!row) return NextResponse.json({ error: "Unknown food" }, { status: 404 })
  return NextResponse.json({ result: toFoodResult(row as FoodItemRow) })
}

/** Delete a custom food. Logged entries keep their numbers (food_item_id is set to null). */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/foods/custom/[id]">) {
  const { supabase, userId } = await signedIn()
  if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 })
  const id = z.uuid().safeParse((await ctx.params).id)
  if (!id.success) return NextResponse.json({ error: "Invalid food" }, { status: 400 })

  const { data, error } = await supabase.from("food_items").delete().eq("id", id.data).eq("owner_id", userId).select("id")
  if (error) return NextResponse.json({ error: "Delete failed" }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: "Unknown food" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
