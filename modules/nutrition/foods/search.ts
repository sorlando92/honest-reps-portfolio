import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Serving } from "../parsing/parse-meal"
import { fdcPortion } from "../parsing/fdc-local"
import type { Per100g, Portion } from "../parsing/usda"
import { toFoodResult, toSections, type FoodItemRow, type FoodResult, type IndexRow, type SearchSections } from "./hits"
import { brandedServing, tidyCase } from "./label"

export type { FoodResult } from "./hits"

export const FOOD_ITEM_COLUMNS = "id, source, source_id, name, brand, data_type, state, per_100g, serving, barcode, image_url"

/** Rows per section; the sheet shows 5 and "Show more" shows the rest. */
const PER_SECTION = 15

/**
 * Search as you type (docs/FOOD_LOOKUP_SPEC.md 1, 2) over the local food
 * index, as the signed in user: their custom foods, history and favorites
 * count, nobody else's. Never writes; a picked FDC row is copied into
 * food_items by pickFdc().
 */
export async function searchIndex(supabase: SupabaseClient, query: string): Promise<SearchSections> {
  const { data, error } = await supabase.rpc("search_food_index", { p_query: query, p_limit: PER_SECTION })
  if (error) throw new Error(`Food search failed: ${error.message}`)
  return toSections((data ?? []) as IndexRow[])
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** Per 100 g with zeros for anything FDC does not list. */
function full(p: Partial<Per100g>): Per100g {
  return { kcal: p.kcal ?? 0, protein_g: p.protein_g ?? 0, carbs_g: p.carbs_g ?? 0, fat_g: p.fat_g ?? 0 }
}

/**
 * An FDC food the user tapped, copied into food_items so the saved item can
 * reference it. Branded products carry their label serving and GTIN; generic
 * foods their first common portion. Null for an unknown id.
 */
export async function pickFdc(admin: SupabaseClient, fdcId: number): Promise<FoodResult | null> {
  const [{ data: branded }, { data: generic }] = await Promise.all([
    admin.from("fdc_branded").select("fdc_id, gtin, description, brand_name, brand_owner, serving_size, serving_unit, household_serving, per_100g").eq("fdc_id", fdcId).maybeSingle(),
    admin.from("fdc_foods").select("fdc_id, data_type, description, per_100g, portions").eq("fdc_id", fdcId).maybeSingle(),
  ])
  let row: Record<string, unknown>
  if (branded) {
    const per = branded.per_100g as Partial<Per100g>
    row = {
      source: "usda",
      source_id: String(fdcId),
      name: tidyCase(branded.description),
      brand: tidyCase(branded.brand_name || branded.brand_owner || "") || null,
      data_type: "Branded",
      per_100g: full(per),
      serving: brandedServing(per, branded.serving_size === null ? null : Number(branded.serving_size), branded.serving_unit, branded.household_serving),
      barcode: branded.gtin,
      fetched_at: new Date().toISOString(),
    }
  } else if (generic) {
    const per = full(generic.per_100g as Partial<Per100g>)
    const portion = ((generic.portions as Portion[] | null) ?? [])[0]
    row = {
      source: "usda",
      source_id: String(fdcId),
      name: generic.description,
      brand: null,
      data_type: generic.data_type,
      per_100g: per,
      serving: portion ? portionServing(portion, per) : null,
      fetched_at: new Date().toISOString(),
    }
  } else return null

  const { data } = await admin.from("food_items").upsert(row, { onConflict: "source,source_id" }).select(FOOD_ITEM_COLUMNS).single()
  return data ? toFoodResult(data as FoodItemRow) : null
}

/** A food_items row the user can read (RLS applies), as a result. */
export async function foodItemResult(supabase: SupabaseClient, id: string): Promise<FoodResult | null> {
  const { data } = await supabase.from("food_items").select(FOOD_ITEM_COLUMNS).eq("id", id).maybeSingle()
  return data ? toFoodResult(data as FoodItemRow) : null
}

/** A USDA portion stored in food_items.serving, with its nutrition. */
function portionServing(portion: Portion, per: Per100g): Serving {
  const f = portion.grams / 100
  return { label: portion.label, grams: portion.grams, kcal: round1(per.kcal * f), protein_g: round1(per.protein_g * f), carbs_g: round1(per.carbs_g * f), fat_g: round1(per.fat_g * f) }
}

/**
 * The common portion for a USDA food the user picked, from the local FDC copy
 * (Q40), cached in food_items.serving; a food with no portion is cached as
 * such. Null for other foods.
 */
export async function portionForFood(admin: SupabaseClient, foodItemId: string): Promise<FoodResult["portion"]> {
  const { data: row } = await admin.from("food_items").select("source, source_id, data_type, per_100g, serving").eq("id", foodItemId).maybeSingle()
  if (!row || row.source !== "usda" || row.data_type === "Branded") return null
  const cached = row.serving as Serving | null
  if (cached) return cached.grams ? { label: cached.label, grams: cached.grams } : null
  const portion = await fdcPortion(row.source_id).catch(() => undefined)
  if (portion === undefined) return null
  const per = row.per_100g as Per100g
  await admin
    .from("food_items")
    .update({ serving: portion ? portionServing(portion, per) : { label: "", grams: null, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 } })
    .eq("id", foodItemId)
  return portion
}
