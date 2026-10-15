import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Serving } from "../parsing/parse-meal"
import type { Per100g } from "../parsing/usda"
import type { FoodResult } from "./search"

// Open Food Facts asks every client to name itself.
const USER_AGENT = "HonestReps/1.0 (https://app.honestreps.app)"
const FIELDS = "code,product_name,product_name_en,brands,serving_size,serving_quantity,nutriments"
const TIMEOUT_MS = 6000

const round1 = (n: number) => Math.round(n * 10) / 10

/** EAN-8, UPC-A, EAN-13 and GTIN-14, digits only. */
export function normalizeBarcode(raw: string): string | null {
  const digits = raw.replace(/\D/g, "")
  return digits.length >= 8 && digits.length <= 14 ? digits : null
}

interface OffProduct {
  code?: string
  product_name?: string
  product_name_en?: string
  brands?: string
  serving_size?: string
  serving_quantity?: number | string
  nutriments?: Record<string, number | string | undefined>
}

/**
 * A packaged product from Open Food Facts (PRD F2). Null when the product is
 * unknown or has no calories. Nutrients per 100 g, plus the label serving
 * when the product lists one.
 */
export function productFood(p: OffProduct): { name: string; brand: string | null; per100g: Per100g; serving: Serving | null } | null {
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
  return { name, brand: p.brands?.split(",")[0]?.trim() || null, per100g, serving }
}

/** Cached product first, then Open Food Facts. Found products are cached in food_items. */
export async function lookupBarcode(admin: SupabaseClient, code: string): Promise<FoodResult | null> {
  const columns = "id, source, source_id, name, brand, data_type, state, per_100g, serving"
  const { data: cached } = await admin.from("food_items").select(columns).eq("barcode", code).limit(1).maybeSingle()
  if (cached) return toResult(cached)

  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${FIELDS}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null)
  if (!res?.ok) return null
  const body = (await res.json().catch(() => null)) as { status?: number; product?: OffProduct } | null
  if (body?.status !== 1 || !body.product) return null
  const food = productFood(body.product)
  if (!food) return null

  const { data } = await admin
    .from("food_items")
    .upsert(
      {
        source: "off",
        source_id: code,
        barcode: code,
        name: food.name,
        brand: food.brand,
        data_type: "Open Food Facts",
        per_100g: food.per100g,
        serving: food.serving,
        source_url: `https://world.openfoodfacts.org/product/${code}`,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "source,source_id" }
    )
    .select(columns)
    .single()
  return data ? toResult(data) : null
}

function toResult(row: Record<string, unknown>): FoodResult {
  return {
    foodItemId: row.id as string,
    source: row.source as FoodResult["source"],
    sourceId: row.source_id as string,
    name: row.name as string,
    brand: (row.brand as string | null) ?? null,
    dataType: (row.data_type as string | null) ?? "Open Food Facts",
    state: null,
    per100g: (row.per_100g as Per100g) ?? {},
    serving: (row.serving as Serving | null) ?? null,
    portion: null,
  }
}
