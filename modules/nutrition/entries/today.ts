import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { dayBounds } from "@/core/time/local-day"
import type { AmountSource, FoodState } from "@/lib/ai/p1"
import type { Per100g } from "../parsing/usda"
import type { DraftItem } from "../parsing/service"

export interface TimelineEntry {
  id: string
  loggedAt: string
  /** Local time, for example "7:42 AM". */
  time: string
  /** What the user typed, one line; item names when there was no typed input. */
  title: string
  /** Saved items in card form, so the editor reuses the confirmation card. */
  items: DraftItem[]
  calories: number
  proteinG: number
  /** Q34 on the timeline: "match" shows Check this, "estimated" shows est. */
  marker: "match" | "estimated" | null
}

interface FoodRow {
  source: "usda" | "custom" | "off"
  source_id: string
  name: string
  brand: string | null
  data_type: string | null
  state: FoodState | null
  per_100g: Per100g | null
}

interface ItemRow {
  name: string
  amount: number | string
  unit: string
  grams: number | string
  amount_source: AmountSource
  state: FoodState | null
  calories: number | string
  protein_g: number | string
  carbs_g: number | string
  fat_g: number | string
  flag_reason: "match" | "amount" | null
  position: number
  food_item_id: string | null
  food_items: FoodRow | null
}

interface Row {
  id: string
  logged_at: string
  raw_input: string | null
  food_entry_items: ItemRow[]
}

const ITEM_COLUMNS =
  "name, amount, unit, grams, amount_source, state, calories, protein_g, carbs_g, fat_g, flag_reason, position, food_item_id, food_items(source, source_id, name, brand, data_type, state, per_100g)"

/**
 * The user's final entries on one local date in their profile timezone,
 * oldest first (PRD F3).
 */
export async function dayEntries(
  supabase: SupabaseClient,
  userId: string,
  timezone: string,
  date: string
): Promise<TimelineEntry[]> {
  const { start, end } = dayBounds(date, timezone)
  const { data } = await supabase
    .from("food_entries")
    .select(`id, logged_at, raw_input, food_entry_items(${ITEM_COLUMNS})`)
    .eq("user_id", userId)
    .eq("status", "final")
    .gte("logged_at", start.toISOString())
    .lt("logged_at", end.toISOString())
    .order("logged_at", { ascending: true })

  const time = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" })

  return ((data ?? []) as unknown as Row[]).map((row) => {
    const items = [...row.food_entry_items].sort((a, b) => a.position - b.position).map(toDraftItem)
    return {
      id: row.id,
      loggedAt: row.logged_at,
      time: time.format(new Date(row.logged_at)),
      title: entryTitle(row.raw_input, items),
      items,
      calories: Math.round(items.reduce((s, i) => s + i.calories, 0)),
      proteinG: Math.round(items.reduce((s, i) => s + i.proteinG, 0)),
      marker: items.some((i) => i.flagReason === "match")
        ? "match"
        : items.some((i) => i.amountSource === "estimated")
          ? "estimated"
          : null,
    }
  })
}

/** A saved item in the confirmation card's shape. Saved items have no alternatives. */
function toDraftItem(row: ItemRow): DraftItem {
  const food = row.food_items
  return {
    name: row.name,
    brand: food?.brand ?? null,
    quantity: Number(row.amount),
    unit: row.unit,
    grams: Number(row.grams),
    amountSource: row.amount_source,
    state: row.state,
    confidence: 1,
    match:
      food && food.per_100g && food.source !== "off"
        ? {
            source: food.source,
            sourceId: food.source_id,
            name: food.name,
            brand: food.brand,
            dataType: food.data_type ?? "",
            state: food.state,
            per100g: food.per_100g,
          }
        : null,
    matchScore: 1,
    calories: Number(row.calories),
    proteinG: Number(row.protein_g),
    carbsG: Number(row.carbs_g),
    fatG: Number(row.fat_g),
    flagged: row.flag_reason !== null,
    flagReason: row.flag_reason,
    foodItemId: row.food_item_id,
    alternatives: [],
  }
}

/**
 * Timeline title: the user's own words, first line only with whitespace
 * collapsed (the row truncates it visually). Entries without typed input
 * (manual, search, barcode) fall back to their item names.
 */
export function entryTitle(rawInput: string | null, items: { name: string }[]): string {
  const line = (rawInput ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .find((l) => l.length > 0)
  return line ?? items.map((i) => i.name).join(", ")
}
