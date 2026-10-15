import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { dayBounds } from "@/core/time/local-day"

export interface TimelineItem {
  name: string
  calories: number
  proteinG: number
}

export interface TimelineEntry {
  id: string
  loggedAt: string
  /** Local time, for example "7:42 AM". */
  time: string
  /** What the user typed, one line; item names when there was no typed input. */
  title: string
  items: TimelineItem[]
  calories: number
  proteinG: number
  /** Q34: "match" shows Check this, "amount" shows est. */
  marker: "match" | "amount" | null
}

interface Row {
  id: string
  logged_at: string
  raw_input: string | null
  food_entry_items: { name: string; calories: number; protein_g: number; flag_reason: "match" | "amount" | null; position: number }[]
}

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
    .select("id, logged_at, raw_input, food_entry_items(name, calories, protein_g, flag_reason, position)")
    .eq("user_id", userId)
    .eq("status", "final")
    .gte("logged_at", start.toISOString())
    .lt("logged_at", end.toISOString())
    .order("logged_at", { ascending: true })

  const time = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" })

  return ((data ?? []) as Row[]).map((row) => {
    const items = [...row.food_entry_items].sort((a, b) => a.position - b.position)
    const reasons = items.map((i) => i.flag_reason)
    return {
      id: row.id,
      loggedAt: row.logged_at,
      time: time.format(new Date(row.logged_at)),
      title: entryTitle(row.raw_input, items),
      items: items.map((i) => ({ name: i.name, calories: Math.round(Number(i.calories)), proteinG: Math.round(Number(i.protein_g)) })),
      calories: Math.round(items.reduce((s, i) => s + Number(i.calories), 0)),
      proteinG: Math.round(items.reduce((s, i) => s + Number(i.protein_g), 0)),
      marker: reasons.includes("match") ? "match" : reasons.includes("amount") ? "amount" : null,
    }
  })
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
