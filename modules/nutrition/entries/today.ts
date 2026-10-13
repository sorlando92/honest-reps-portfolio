import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"

export interface TimelineEntry {
  id: string
  loggedAt: string
  /** Local time, for example "7:42 AM". */
  time: string
  names: string
  calories: number
  proteinG: number
  /** Q34: "match" shows Check this, "amount" shows est. */
  marker: "match" | "amount" | null
}

interface Row {
  id: string
  logged_at: string
  food_entry_items: { name: string; calories: number; protein_g: number; flag_reason: "match" | "amount" | null; position: number }[]
}

/** The user's entries for today in their own timezone, oldest first (PRD F3). */
export async function todayEntries(supabase: SupabaseClient, userId: string, timezone: string): Promise<TimelineEntry[]> {
  // Fetch a window wide enough for any timezone, then keep the local day.
  const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString()
  const { data } = await supabase
    .from("food_entries")
    .select("id, logged_at, food_entry_items(name, calories, protein_g, flag_reason, position)")
    .eq("user_id", userId)
    .eq("status", "final")
    .gte("logged_at", since)
    .order("logged_at", { ascending: true })

  const day = (iso: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone, dateStyle: "short" }).format(new Date(iso))
  const today = day(new Date())
  const time = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" })

  return ((data ?? []) as Row[])
    .filter((row) => day(row.logged_at) === today)
    .map((row) => {
      const items = [...row.food_entry_items].sort((a, b) => a.position - b.position)
      const reasons = items.map((i) => i.flag_reason)
      return {
        id: row.id,
        loggedAt: row.logged_at,
        time: time.format(new Date(row.logged_at)),
        names: items.map((i) => i.name).join(", "),
        calories: Math.round(items.reduce((s, i) => s + Number(i.calories), 0)),
        proteinG: Math.round(items.reduce((s, i) => s + Number(i.protein_g), 0)),
        marker: reasons.includes("match") ? "match" : reasons.includes("amount") ? "amount" : null,
      }
    })
}
