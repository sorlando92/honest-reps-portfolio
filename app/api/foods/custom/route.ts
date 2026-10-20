import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { track } from "@/core/events/track"
import { customFoodColumns } from "@/modules/nutrition/foods/custom"
import { customFoodInput } from "@/modules/nutrition/foods/custom-input"
import { toFoodResult, type FoodItemRow } from "@/modules/nutrition/foods/hits"
import { FOOD_ITEM_COLUMNS } from "@/modules/nutrition/foods/search"

const body = customFoodInput.extend({ source: z.enum(["label", "manual"]) })

/** A new custom food (docs/FOOD_LOOKUP_SPEC.md 4), saved as the user through RLS. */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 })

  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid food" }, { status: 400 })
  const columns = customFoodColumns(parsed.data)
  if (!columns) return NextResponse.json({ error: "Invalid barcode" }, { status: 400 })

  const { data: row, error } = await supabase
    .from("food_items")
    .insert({ source: "user", source_id: randomUUID(), owner_id: userId, data_type: "Custom food", ...columns })
    .select(FOOD_ITEM_COLUMNS)
    .single()
  if (error?.code === "23505") return NextResponse.json({ error: "You already have a food with this barcode" }, { status: 409 })
  if (error || !row) return NextResponse.json({ error: "Save failed" }, { status: 500 })

  await track("custom_food_created", { source: parsed.data.source })
  return NextResponse.json({ result: toFoodResult(row as FoodItemRow) }, { status: 201 })
}
