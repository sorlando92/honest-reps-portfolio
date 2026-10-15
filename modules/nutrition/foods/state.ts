import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { FoodState } from "@/lib/ai/p1"
import { rank, searchText } from "../parsing/match"
import { searchUsda, type UsdaFood } from "../parsing/usda"
import type { FoodResult } from "./search"

// USDA names dry grains and pasta "dry" or "uncooked"; raw meat "raw".
const QUERY_WORD: Record<FoodState, string> = { raw: "raw", cooked: "cooked", dry: "dry" }

/**
 * The food entry for a food in another state, for the Raw / Cooked / Dry
 * toggle (PRD F2: changing it recalculates from the matching database entry).
 * Ranked like text logging with the state forced; only a candidate in that
 * state is returned. Cached in food_items like any match.
 */
export async function matchForState(admin: SupabaseClient, name: string, state: FoodState): Promise<FoodResult | null> {
  const base = searchText(name)
    .replace(/\b(raw|cooked|uncooked|dry|dried)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!base) return null
  const found = await searchUsda(`${base} ${QUERY_WORD[state]}`).catch(() => [] as UsdaFood[])
  const ranked = rank({ name: base, brand: null, state }, found.map((f) => ({ ...f, id: String(f.fdcId) })))
  const best = ranked.find((r) => r.state === state)
  if (!best) return null

  const c = best.candidate
  const { data } = await admin
    .from("food_items")
    .upsert(
      { source: "usda", source_id: c.id, name: c.description, brand: c.brand, data_type: c.dataType, state, per_100g: c.per100g, fetched_at: new Date().toISOString() },
      { onConflict: "source,source_id" }
    )
    .select("id")
    .single()
  if (!data) return null
  return { foodItemId: data.id, source: "usda", sourceId: c.id, name: c.description, brand: c.brand, dataType: c.dataType, state, per100g: c.per100g, serving: null, portion: null }
}
