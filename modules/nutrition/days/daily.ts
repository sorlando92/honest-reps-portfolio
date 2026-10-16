import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { DayTotals } from "./week"

interface Row {
  local_date: string
  logged: boolean
  calories: number | string
  protein_g: number | string
  carbs_g: number | string
  fat_g: number | string
  items: number
  weighed_items: number
  target_calories: number | null
  target_protein_g: number | null
  target_carbs_g: number | null
  target_fat_g: number | null
  adherent: boolean | null
  protein_hit: boolean | null
  weight_kg: number | string | null
}

/**
 * Per local day totals from `from` to `to` inclusive (daily_totals in the
 * database, ARCHITECTURE.md "Daily aggregates and Progress"). Shared by
 * Today, Progress and the coach client week view; RLS decides which users'
 * days the caller can read.
 */
export async function dailyTotals(supabase: SupabaseClient, userId: string, from: string, to: string): Promise<DayTotals[]> {
  const { data, error } = await supabase.rpc("daily_totals", { p_user_id: userId, p_from: from, p_to: to })
  if (error) throw new Error(`daily_totals: ${error.message}`)
  return ((data ?? []) as Row[]).map((r) => ({
    date: r.local_date,
    logged: r.logged,
    calories: Number(r.calories),
    proteinG: Number(r.protein_g),
    carbsG: Number(r.carbs_g),
    fatG: Number(r.fat_g),
    items: r.items,
    weighedItems: r.weighed_items,
    target:
      r.target_calories === null
        ? null
        : { calories: r.target_calories, proteinG: r.target_protein_g ?? 0, carbsG: r.target_carbs_g ?? 0, fatG: r.target_fat_g ?? 0 },
    adherent: r.adherent,
    proteinHit: r.protein_hit,
    weightKg: r.weight_kg === null ? null : Number(r.weight_kg),
  }))
}

/** Consecutive logged days through `today` (or yesterday when today is empty). */
export async function loggingStreak(supabase: SupabaseClient, userId: string, today: string): Promise<number> {
  const { data, error } = await supabase.rpc("logging_streak", { p_user_id: userId, p_today: today })
  if (error) throw new Error(`logging_streak: ${error.message}`)
  return (data as number | null) ?? 0
}
