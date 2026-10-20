// Search results for the log bar and food search (docs/FOOD_LOOKUP_SPEC.md 1).
// Pure, so the browser shares the types and the mapping is unit tested.

import type { FoodState } from "@/lib/ai/p1"
import type { Serving } from "../parsing/parse-meal"
import type { Per100g } from "../parsing/usda"
import { brandedServing, tidyCase } from "./label"

/** One food search result: a food_items row the user can add to a card. */
export interface FoodResult {
  foodItemId: string
  source: "usda" | "custom" | "off" | "user"
  sourceId: string
  name: string
  brand: string | null
  dataType: string
  state: FoodState | null
  /** Empty for curated servings published without a weight. */
  per100g: Per100g | Record<string, never>
  /** Label foods (curated chain items, products, custom foods): the published serving. */
  serving: Serving | null
  /** Generic USDA foods: the first common portion, when known ("1 medium"). */
  portion: { label: string; grams: number } | null
  /** Packaged products: the canonical GTIN-14 and, from Open Food Facts, a front image. */
  barcode?: string | null
  imageUrl?: string | null
}

export const SECTIONS = ["mine", "brands", "basic"] as const
export type Section = (typeof SECTIONS)[number]

export const SECTION_TITLES: Record<Section, string> = {
  mine: "My foods",
  brands: "Brands and restaurants",
  basic: "Basic foods",
}

/** A favorite's saved items, as the entries API takes them. */
export interface FavoriteItem {
  name: string
  foodItemId: string | null
  amount: number
  unit: string
  grams: number
  amountSource: "weighed" | "label" | "measured" | "hand" | "estimated"
  state: FoodState | null
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
}

/** What a result row shows and what tapping it needs. */
export interface SearchHit {
  /** "item:<food_items id>", "fdc:<fdc id>" (copied into food_items on tap) or "fav:<favorite id>". */
  ref: string
  section: Section
  name: string
  brand: string | null
  /** "1 scoop (31 g)", "1 medium (118 g)", "100 g". */
  servingLabel: string
  /** Calories in that serving, rounded. */
  kcal: number
  /** Ready to add for food_items rows; null until an FDC row is picked. */
  food: FoodResult | null
  /** Favorites: the items it logs. */
  favoriteItems?: FavoriteItem[]
}

export type SearchSections = Record<Section, SearchHit[]>

/** A search_food_index() row. */
export interface IndexRow {
  section: Section
  ref: string
  /** food_items.source for "item:" rows; "fdc" and "favorite" otherwise. */
  source: string
  source_id: string
  state: string | null
  barcode: string | null
  image_url: string | null
  food_item_id: string | null
  fdc_id: number | null
  name: string
  brand: string | null
  data_type: string | null
  per_100g: Partial<Per100g> | null
  serving: Serving | null
  serving_size: number | string | null
  serving_unit: string | null
  household_serving: string | null
  portions: { label: string; grams: number }[] | null
  favorite_items: FavoriteItem[] | null
  score: number
}

/** A food_items row as the API returns it. */
export interface FoodItemRow {
  id: string
  source: string
  source_id: string
  name: string
  brand: string | null
  data_type: string | null
  state: string | null
  per_100g: unknown
  serving: unknown
  barcode?: string | null
  image_url?: string | null
}

/**
 * Products with a label (curated chain items, Open Food Facts, FDC Branded,
 * custom foods) step in their published serving; for generic USDA foods
 * food_items.serving holds the common portion instead.
 */
function isLabelFood(row: { source: string; data_type: string | null }): boolean {
  return row.source !== "usda" || row.data_type === "Branded"
}

export function toFoodResult(row: FoodItemRow): FoodResult {
  const serving = (row.serving as Serving | null) ?? null
  const label = isLabelFood(row)
  return {
    foodItemId: row.id,
    source: row.source as FoodResult["source"],
    sourceId: row.source_id,
    name: row.name,
    brand: row.brand ?? null,
    dataType: row.data_type ?? "",
    state: (row.state as FoodState | null) ?? null,
    per100g: (row.per_100g as FoodResult["per100g"]) ?? {},
    serving: label ? serving : null,
    portion: !label && serving?.grams ? { label: serving.label, grams: serving.grams } : null,
    barcode: row.barcode ?? null,
    imageUrl: row.image_url ?? null,
  }
}

const per = (p: Partial<Per100g> | null | undefined, key: keyof Per100g) => Number(p?.[key] ?? 0)

/** The label serving of a row, if it has one. */
function labelServing(r: IndexRow): Serving | null {
  if (r.source === "fdc") return r.data_type === "Branded" ? brandedServing(r.per_100g ?? {}, r.serving_size === null ? null : Number(r.serving_size), r.serving_unit, r.household_serving) : null
  return r.serving && isLabelFood({ source: r.source, data_type: r.data_type }) ? r.serving : null
}

/** "1 scoop (31 g)": the grams are added when the label does not show them. */
export function servingText(s: Pick<Serving, "label" | "grams">): string {
  return s.grams && !/\d\s*(g|ml)\b/i.test(s.label) ? `${s.label} (${Math.round(s.grams)} g)` : s.label
}

/** The serving a row shows and its calories. */
function rowServing(r: IndexRow): { label: string; kcal: number } {
  if (r.source === "favorite") {
    const items = r.favorite_items ?? []
    return { label: `${items.length} ${items.length === 1 ? "item" : "items"}`, kcal: Math.round(items.reduce((sum, i) => sum + i.calories, 0)) }
  }
  const label = labelServing(r)
  if (label) return { label: servingText(label), kcal: Math.round(label.kcal) }
  const portion = r.portions?.[0] ?? (r.serving?.grams ? { label: r.serving.label, grams: r.serving.grams } : null)
  if (portion) return { label: `${portion.label} (${Math.round(portion.grams)} g)`, kcal: Math.round((per(r.per_100g, "kcal") * portion.grams) / 100) }
  return { label: "100 g", kcal: Math.round(per(r.per_100g, "kcal")) }
}

/** search_food_index() rows to result rows, by section, in rank order. */
export function toSections(rows: IndexRow[]): SearchSections {
  const out: SearchSections = { mine: [], brands: [], basic: [] }
  for (const r of rows) {
    const { label, kcal } = rowServing(r)
    const food =
      r.ref.startsWith("item:") && r.food_item_id
        ? toFoodResult({
            id: r.food_item_id,
            source: r.source,
            source_id: r.source_id,
            name: r.name,
            brand: r.brand,
            data_type: r.data_type,
            state: r.state,
            per_100g: r.per_100g ?? {},
            serving: r.serving,
            barcode: r.barcode,
            image_url: r.image_url,
          })
        : null
    out[r.section].push({
      ref: r.ref,
      section: r.section,
      name: tidyCase(r.name),
      brand: r.brand ? tidyCase(r.brand) : null,
      servingLabel: label,
      kcal,
      food,
      ...(r.favorite_items ? { favoriteItems: r.favorite_items } : {}),
    })
  }
  return out
}
