import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Serving } from "../parsing/parse-meal"
import type { Per100g } from "../parsing/usda"
import { offCodes, padGtin } from "./gtin"
import { toFoodResult, type FoodItemRow, type FoodResult } from "./hits"
import { tidyCase } from "./label"
import { FOOD_ITEM_COLUMNS, pickFdc } from "./search"

// Open Food Facts asks every client to name itself.
const USER_AGENT = "HonestReps/1.0 (https://app.honestreps.app)"
const FIELDS = "code,product_name,product_name_en,brands,serving_size,serving_quantity,nutriments,image_front_small_url"
const TIMEOUT_MS = 6000

const round1 = (n: number) => Math.round(n * 10) / 10

interface OffProduct {
  code?: string
  product_name?: string
  product_name_en?: string
  brands?: string
  serving_size?: string
  serving_quantity?: number | string
  nutriments?: Record<string, number | string | undefined>
  image_front_small_url?: string
}

/**
 * A packaged product from Open Food Facts (PRD F2). Null when the product is
 * unknown or has no calories. Nutrients per 100 g, plus the label serving
 * when the product lists one.
 */
export function productFood(p: OffProduct): { name: string; brand: string | null; per100g: Per100g; serving: Serving | null; imageUrl: string | null } | null {
  const n = p.nutriments ?? {}
  const num = (key: string) => {
    const v = Number(n[key])
    return Number.isFinite(v) && v >= 0 ? v : null
  }
  const kcal100 = num("energy-kcal_100g") ?? (num("energy_100g") !== null ? num("energy_100g")! / 4.184 : null)
  const name = (p.product_name_en || p.product_name || "").trim()
  if (kcal100 === null || !name) return null
  const per100g = { kcal: kcal100, protein_g: num("proteins_100g") ?? 0, carbs_g: num("carbohydrates_100g") ?? 0, fat_g: num("fat_100g") ?? 0 }

  const grams = Number(p.serving_quantity)
  const servingGrams = Number.isFinite(grams) && grams > 0 ? grams : null
  const kcalServing = num("energy-kcal_serving")
  let serving: Serving | null = null
  if (servingGrams) {
    const f = servingGrams / 100
    serving = {
      label: p.serving_size?.trim() || `${Math.round(servingGrams)} g`,
      grams: servingGrams,
      kcal: round1(kcalServing ?? per100g.kcal * f),
      protein_g: round1(num("proteins_serving") ?? per100g.protein_g * f),
      carbs_g: round1(num("carbohydrates_serving") ?? per100g.carbs_g * f),
      fat_g: round1(num("fat_serving") ?? per100g.fat_g * f),
    }
  } else if (kcalServing !== null && p.serving_size) {
    serving = { label: p.serving_size.trim(), grams: null, kcal: kcalServing, protein_g: num("proteins_serving") ?? 0, carbs_g: num("carbohydrates_serving") ?? 0, fat_g: num("fat_serving") ?? 0 }
  }
  const image = p.image_front_small_url?.startsWith("https://") ? p.image_front_small_url : null
  return { name, brand: p.brands?.split(",")[0]?.trim() || null, per100g, serving, imageUrl: image }
}

/**
 * Every way a GTIN-14 may already be stored: canonical, and the shorter
 * forms cached before canonical storage (a 12 digit UPC, a 13 digit EAN).
 */
export function storedForms(gtin14: string): string[] {
  const forms = new Set([gtin14])
  for (let cut = 1; cut <= 6 && gtin14[cut - 1] === "0"; cut++) {
    const form = gtin14.slice(cut)
    if (form.length === 13 || form.length === 12 || form.length === 8) forms.add(form)
  }
  return [...forms]
}

export type LookupSource = "user" | "cache" | "fdc" | "off"

export interface Lookup {
  result: FoodResult | null
  source: LookupSource | null
  /** The canonical GTIN that matched, or the first candidate on a miss. */
  gtin: string
}

/**
 * docs/FOOD_LOOKUP_SPEC.md 3 "Lookup order": the user's correction or custom
 * food, then the food_items cache, then FDC Branded, then Open Food Facts.
 * `candidates` are canonical GTIN-14s (two only for an ambiguous typed
 * 8 digit code). Every hit ends up cached in food_items.
 */
export async function lookupBarcode(admin: SupabaseClient, userId: string, candidates: string[]): Promise<Lookup> {
  const forms = candidates.flatMap(storedForms)

  // 1. The user's own: a food picked after "Not this", else a custom food.
  const { data: match } = await admin.from("barcode_matches").select("gtin, food_item_id").eq("user_id", userId).in("gtin", candidates).limit(1).maybeSingle()
  if (match) {
    const row = await item(admin, match.food_item_id)
    if (row) return { result: row, source: "user", gtin: match.gtin }
  }
  const { data: custom } = await admin.from("food_items").select(FOOD_ITEM_COLUMNS).eq("source", "user").eq("owner_id", userId).in("barcode", forms).limit(1).maybeSingle()
  if (custom) return { result: toFoodResult(custom as FoodItemRow), source: "user", gtin: padGtin(custom.barcode)! }

  // 2. Shared cache.
  const { data: cached } = await admin.from("food_items").select(FOOD_ITEM_COLUMNS).is("owner_id", null).in("barcode", forms).order("fetched_at", { ascending: false }).limit(1).maybeSingle()
  if (cached) return { result: toFoodResult(cached as FoodItemRow), source: "cache", gtin: padGtin(cached.barcode)! }

  // 3. FDC Branded, by the canonical GTIN stored at import.
  const { data: branded } = await admin.from("fdc_branded").select("fdc_id, gtin").in("gtin", candidates).limit(1).maybeSingle()
  if (branded) {
    const result = await pickFdc(admin, branded.fdc_id)
    if (result) return { result, source: "fdc", gtin: branded.gtin }
  }

  // 4. Open Food Facts.
  for (const gtin of candidates) {
    const off = await offProduct(admin, gtin)
    if (off) return { result: off, source: "off", gtin }
  }
  return { result: null, source: null, gtin: candidates[0] }
}

async function item(admin: SupabaseClient, id: string): Promise<FoodResult | null> {
  const { data } = await admin.from("food_items").select(FOOD_ITEM_COLUMNS).eq("id", id).maybeSingle()
  return data ? toFoodResult(data as FoodItemRow) : null
}

async function offProduct(admin: SupabaseClient, gtin: string): Promise<FoodResult | null> {
  for (const code of offCodes(gtin)) {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${FIELDS}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch(() => null)
    if (!res?.ok) continue
    const body = (await res.json().catch(() => null)) as { status?: number; product?: OffProduct } | null
    if (body?.status !== 1 || !body.product) continue
    const food = productFood(body.product)
    if (!food) continue
    const { data } = await admin
      .from("food_items")
      .upsert(
        {
          source: "off",
          source_id: gtin,
          barcode: gtin,
          name: tidyCase(food.name),
          brand: food.brand ? tidyCase(food.brand) : null,
          data_type: "Open Food Facts",
          per_100g: food.per100g,
          serving: food.serving,
          image_url: food.imageUrl,
          source_url: `https://world.openfoodfacts.org/product/${code}`,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "source,source_id" }
      )
      .select(FOOD_ITEM_COLUMNS)
      .single()
    return data ? toFoodResult(data as FoodItemRow) : null
  }
  return null
}

/** One row of the scan log (barcode_scans), written by the server. */
export async function logScan(
  admin: SupabaseClient,
  scan: { userId: string; rawRead: string; lookup: Lookup | null; gtin: string | null; readsToConfirm: number | null; msToResult: number | null }
): Promise<string | null> {
  const { data } = await admin
    .from("barcode_scans")
    .insert({
      user_id: scan.userId,
      raw_read: scan.rawRead.slice(0, 64) || "?",
      gtin: scan.lookup?.gtin ?? scan.gtin,
      result: scan.lookup?.result ? "hit" : "miss",
      source: scan.lookup?.result ? scan.lookup.source : null,
      food_item_id: scan.lookup?.result?.foodItemId ?? null,
      reads_to_confirm: scan.readsToConfirm,
      ms_to_result: scan.msToResult,
    })
    .select("id")
    .single()
  return data?.id ?? null
}
