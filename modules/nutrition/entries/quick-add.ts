import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { AmountSource, FoodState } from "@/lib/ai/p1"
import { entryTitle } from "./today"

/** An item as the entries API takes it (modules/nutrition/entries/save.ts). */
export interface ChipItem {
  name: string
  foodItemId: string | null
  amount: number
  unit: string
  grams: number
  amountSource: AmountSource
  state: FoodState | null
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  flagReason: null
  confidence: null
}

/** One quick add chip: a starred favorite or a frequent food (PRD F2). */
export interface QuickAddChip {
  key: string
  kind: "favorite" | "frequent"
  /** The chip and the logged entry's title. */
  title: string
  calories: number
  items: ChipItem[]
}

const MAX_CHIPS = 6
const MAX_FAVORITES = 3
const LOOKBACK_DAYS = 60

export interface ItemHistoryRow {
  name: string
  food_item_id: string | null
  amount: number
  unit: string
  grams: number
  amount_source: AmountSource
  state: FoodState | null
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  logged_at: string
}

/** Morning, midday, evening or late, by the user's local hour. */
export function timeOfDay(instant: Date | string, timezone: string): "morning" | "midday" | "evening" | "late" {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hourCycle: "h23" }).format(new Date(instant)))
  if (hour >= 4 && hour < 11) return "morning"
  if (hour >= 11 && hour < 16) return "midday"
  if (hour >= 16 && hour < 22) return "evening"
  return "late"
}

/**
 * The user's most frequent foods for this time of day, filled from the whole
 * day when there are too few. Each food logs at its last weighed amount,
 * else its most recent amount (PRD F2). Pure, so it is unit tested.
 */
export function frequentFoods(rows: ItemHistoryRow[], timezone: string, now: Date, limit: number): QuickAddChip[] {
  const key = (r: ItemHistoryRow) => r.food_item_id ?? `name:${r.name.trim().toLowerCase()}`
  const slot = timeOfDay(now, timezone)
  const byFood = new Map<string, { inSlot: number; all: number; latest: ItemHistoryRow; latestWeighed: ItemHistoryRow | null }>()
  for (const r of rows) {
    const k = key(r)
    const f = byFood.get(k) ?? { inSlot: 0, all: 0, latest: r, latestWeighed: null }
    f.all++
    if (timeOfDay(r.logged_at, timezone) === slot) f.inSlot++
    if (r.logged_at > f.latest.logged_at) f.latest = r
    if (r.amount_source === "weighed" && (!f.latestWeighed || r.logged_at > f.latestWeighed.logged_at)) f.latestWeighed = r
    byFood.set(k, f)
  }
  return [...byFood.entries()]
    .sort(([, a], [, b]) => b.inSlot - a.inSlot || b.all - a.all || b.latest.logged_at.localeCompare(a.latest.logged_at))
    .slice(0, limit)
    .map(([k, f]) => {
      const r = f.latestWeighed ?? f.latest
      const item: ChipItem = {
        name: r.name,
        foodItemId: r.food_item_id,
        amount: Number(r.amount),
        unit: r.unit,
        grams: Number(r.grams),
        amountSource: r.amount_source,
        state: r.state,
        calories: Number(r.calories),
        proteinG: Number(r.protein_g),
        carbsG: Number(r.carbs_g),
        fatG: Number(r.fat_g),
        flagReason: null,
        confidence: null,
      }
      return { key: `food:${k}`, kind: "frequent" as const, title: r.name.trim(), calories: Math.round(item.calories), items: [item] }
    })
}

/** Favorites first (newest), then frequent foods, up to six chips. Never calls a model. */
export async function quickAddChips(supabase: SupabaseClient, userId: string, timezone: string, now = new Date()): Promise<QuickAddChip[]> {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString()
  const [{ data: favorites }, { data: history }] = await Promise.all([
    supabase.from("favorites").select("id, title, items").eq("user_id", userId).order("created_at", { ascending: false }).limit(MAX_FAVORITES),
    supabase
      .from("food_entries")
      .select("logged_at, food_entry_items(name, food_item_id, amount, unit, grams, amount_source, state, calories, protein_g, carbs_g, fat_g)")
      .eq("user_id", userId)
      .eq("status", "final")
      .gte("logged_at", since)
      .order("logged_at", { ascending: false })
      .limit(500),
  ])

  const favoriteChips: QuickAddChip[] = (favorites ?? []).map((f) => {
    const items = (f.items as Record<string, unknown>[]).map(fromStored)
    return { key: `favorite:${f.id}`, kind: "favorite", title: f.title, calories: Math.round(items.reduce((s, i) => s + i.calories, 0)), items }
  })
  const rows = (history ?? []).flatMap((e) =>
    (e.food_entry_items as unknown as Omit<ItemHistoryRow, "logged_at">[]).map((i) => ({ ...i, logged_at: e.logged_at as string }))
  )
  return [...favoriteChips, ...frequentFoods(rows, timezone, now, MAX_CHIPS - favoriteChips.length)]
}

/** A favorite's stored item (database column names) as a chip item. */
function fromStored(i: Record<string, unknown>): ChipItem {
  return {
    name: String(i.name),
    foodItemId: (i.food_item_id as string | null) ?? null,
    amount: Number(i.amount),
    unit: String(i.unit),
    grams: Number(i.grams),
    amountSource: i.amount_source as AmountSource,
    state: (i.state as FoodState | null) ?? null,
    calories: Number(i.calories),
    proteinG: Number(i.protein_g),
    carbsG: Number(i.carbs_g),
    fatG: Number(i.fat_g),
    flagReason: null,
    confidence: null,
  }
}

/**
 * Stars a logged entry: its title and items become a favorite (RLS: own
 * entries only). Returns the favorite id, or null when the entry is not the
 * user's.
 */
export async function starEntry(supabase: SupabaseClient, userId: string, entryId: string): Promise<string | null> {
  const { data: entry } = await supabase
    .from("food_entries")
    .select("id, title, raw_input, food_entry_items(name, food_item_id, amount, unit, grams, amount_source, state, calories, protein_g, carbs_g, fat_g, position)")
    .eq("id", entryId)
    .eq("user_id", userId)
    .maybeSingle()
  if (!entry?.food_entry_items?.length) return null
  const items = [...entry.food_entry_items]
    .sort((a, b) => a.position - b.position)
    .map((i) => ({ name: i.name, food_item_id: i.food_item_id, amount: i.amount, unit: i.unit, grams: i.grams, amount_source: i.amount_source, state: i.state, calories: i.calories, protein_g: i.protein_g, carbs_g: i.carbs_g, fat_g: i.fat_g }))
  const title = entryTitle(entry.title ?? entry.raw_input, items).slice(0, 200)
  // Favorites are never updated (no update grant), so a second star finds the first.
  const { data, error } = await supabase.from("favorites").insert({ user_id: userId, title, items, source_entry_id: entryId }).select("id").single()
  if (error?.code === "23505") {
    const { data: existing } = await supabase.from("favorites").select("id").eq("user_id", userId).eq("source_entry_id", entryId).single()
    return existing?.id ?? null
  }
  return error ? null : data.id
}
