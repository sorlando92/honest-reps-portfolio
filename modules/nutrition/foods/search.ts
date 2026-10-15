import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { FoodState } from "@/lib/ai/p1"
import { CURATED_CHAINS, normalizeBrand, type ChainData } from "../data/chains/index"
import { rank, searchText, tokens } from "../parsing/match"
import type { Serving } from "../parsing/parse-meal"
import { fdcPortion } from "../parsing/fdc-local"
import { searchUsda, type Per100g, type Portion, type UsdaFood } from "../parsing/usda"

/** One food search result: a food_items row the user can add to a card. */
export interface FoodResult {
  foodItemId: string
  source: "usda" | "custom" | "off"
  sourceId: string
  name: string
  brand: string | null
  dataType: string
  state: FoodState | null
  /** Empty for curated servings published without a weight. */
  per100g: Per100g | Record<string, never>
  /** Label foods (curated chain items, products): the published serving. */
  serving: Serving | null
  /** Generic USDA foods: the first common portion, when known ("1 medium"). */
  portion: { label: string; grams: number } | null
}

const CURATED_LIMIT = 8
const CURATED_FETCH = 60
const USDA_LIMIT = 12

/**
 * Food search for Add item and search logging (PRD F2). Curated chain items
 * first when the query names a curated chain, then USDA generic foods ranked
 * by the same matcher as text logging. USDA results are cached in food_items
 * so a saved item references its row. Until the local FDC import lands
 * (QUESTIONS.md Q40), each search costs three USDA requests.
 */
export async function searchFoods(admin: SupabaseClient, query: string): Promise<FoodResult[]> {
  const { chain, rest } = chainIn(query)
  const [curated, usda] = await Promise.all([
    searchCurated(admin, chain, rest),
    chain && !rest ? Promise.resolve([]) : searchGeneric(admin, chain ? rest : query),
  ])
  return [...curated, ...usda]
}

/** A curated chain named in the query, and the query without it. */
export function chainIn(query: string): { chain: ChainData | null; rest: string } {
  const q = ` ${normalizeBrand(query)} `
  for (const chain of CURATED_CHAINS) {
    const alias = [...chain.aliases]
      .map(normalizeBrand)
      .sort((a, b) => b.length - a.length)
      .find((a) => q.includes(` ${a} `))
    if (alias) return { chain, rest: q.replace(` ${alias} `, " ").trim() }
  }
  return { chain: null, rest: query.trim() }
}

async function searchCurated(admin: SupabaseClient, chain: ChainData | null, rest: string): Promise<FoodResult[]> {
  const words = tokens(rest).filter((t) => t.length > 1).slice(0, 5)
  if (!chain && words.length === 0) return []
  let request = admin
    .from("food_items")
    .select("id, source, source_id, name, brand, data_type, state, per_100g, serving")
    .eq("source", "custom")
  if (chain) request = request.eq("brand", chain.chain)
  // Stems from tokens() ("fries" becomes "frie") still match as substrings.
  for (const word of words) request = request.ilike("name", `%${word.replace(/[%_]/g, "")}%`)
  const { data } = await request.limit(CURATED_FETCH)
  const rows = (data ?? []).map(toResult)
  if (!words.length) return rows.sort((a, b) => a.name.length - b.name.length).slice(0, CURATED_LIMIT)
  // Rank like text logging, reading each name without the chain's own name.
  const strip = (name: string) => (chain ? chainIn(name).rest : name)
  const ranked = rank({ name: rest, brand: null, state: null }, rows.map((r) => ({ ...r, id: r.foodItemId, description: strip(r.name) })))
  return ranked.slice(0, CURATED_LIMIT).map((r) => rows.find((row) => row.foodItemId === r.candidate.id)!)
}

async function searchGeneric(admin: SupabaseClient, query: string): Promise<FoodResult[]> {
  const text = searchText(query)
  if (!text) return []
  const found = await searchUsda(text, { pageSize: 15 }).catch(() => [] as UsdaFood[])
  const ranked = rank({ name: query, brand: null, state: null }, found.map((f) => ({ ...f, id: String(f.fdcId) })))
  const top = [...new Map(ranked.map((r) => [r.candidate.id, r])).values()].slice(0, USDA_LIMIT)
  if (!top.length) return []

  await admin.from("food_items").upsert(
    top.map((r) => ({
      source: "usda",
      source_id: r.candidate.id,
      name: r.candidate.description,
      brand: r.candidate.brand,
      data_type: r.candidate.dataType,
      state: r.state,
      per_100g: r.candidate.per100g,
      fetched_at: new Date().toISOString(),
    })),
    { onConflict: "source,source_id" }
  )
  // FNDDS results carry their common portion; written separately so a portion
  // cached from a detail lookup is never overwritten with nothing.
  const withPortion = top.filter((r) => r.candidate.portion)
  if (withPortion.length) {
    await admin.from("food_items").upsert(
      withPortion.map((r) => ({ source: "usda", source_id: r.candidate.id, name: r.candidate.description, per_100g: r.candidate.per100g, serving: portionServing(r.candidate.portion!, r.candidate.per100g) })),
      { onConflict: "source,source_id" }
    )
  }
  const { data } = await admin
    .from("food_items")
    .select("id, source, source_id, name, brand, data_type, state, per_100g, serving")
    .eq("source", "usda")
    .in("source_id", top.map((r) => r.candidate.id))
  const rows = new Map((data ?? []).map((row) => [row.source_id as string, row]))
  return top.flatMap((r) => {
    const row = rows.get(r.candidate.id)
    return row ? [toResult(row)] : []
  })
}

function toResult(row: Record<string, unknown>): FoodResult {
  return {
    foodItemId: row.id as string,
    source: row.source as FoodResult["source"],
    sourceId: row.source_id as string,
    name: row.name as string,
    brand: (row.brand as string | null) ?? null,
    dataType: (row.data_type as string | null) ?? "",
    state: (row.state as FoodState | null) ?? null,
    per100g: (row.per_100g as FoodResult["per100g"]) ?? {},
    // food_items.serving is the published serving for label foods and the
    // common portion for USDA foods.
    serving: row.source === "usda" ? null : ((row.serving as Serving | null) ?? null),
    portion: row.source === "usda" && row.serving ? portionOf(row.serving as Serving) : null,
  }
}

function portionOf(s: Serving): FoodResult["portion"] {
  return s.grams ? { label: s.label, grams: s.grams } : null
}

/** A USDA portion stored in food_items.serving, with its nutrition. */
export function portionServing(portion: Portion, per: Per100g): Serving {
  const f = portion.grams / 100
  return { label: portion.label, grams: portion.grams, kcal: per.kcal * f, protein_g: per.protein_g * f, carbs_g: per.carbs_g * f, fat_g: per.fat_g * f }
}

/**
 * The common portion for a USDA food the user picked, from the local FDC copy
 * (Q40), cached in food_items.serving; a food with no portion is cached as
 * such. Null for other foods.
 */
export async function portionForFood(admin: SupabaseClient, foodItemId: string): Promise<FoodResult["portion"]> {
  const { data: row } = await admin.from("food_items").select("source, source_id, per_100g, serving").eq("id", foodItemId).maybeSingle()
  if (!row || row.source !== "usda") return null
  if (row.serving) return portionOf(row.serving as Serving)
  const portion = await fdcPortion(row.source_id).catch(() => undefined)
  if (portion === undefined) return null
  const per = row.per_100g as Per100g
  await admin
    .from("food_items")
    .update({ serving: portion ? portionServing(portion, per) : { label: "", grams: null, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 } })
    .eq("id", foodItemId)
  return portion
}
