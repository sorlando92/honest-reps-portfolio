import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { DayTotals } from "../days/week"
import type { ProgressSummary, WeightRange } from "./types"

interface DayRow {
  local_date: string
  logged: boolean
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  items: number
  weighed_items: number
  target_calories: number | null
  target_protein_g: number | null
  target_carbs_g: number | null
  target_fat_g: number | null
  adherent: boolean | null
  protein_hit: boolean | null
  weight_kg: number | null
}

interface Raw {
  today: string
  units: string | null
  week: DayRow[]
  averages: {
    elapsed_days: number
    logged_days: number
    avg_calories: number | null
    avg_protein_g: number | null
    days_on_target: number | null
    protein_days: number | null
    weighed_share: number | null
  }
  days30: { date: string; logged: boolean; adherent: boolean; weighed: boolean }[]
  weight: {
    range_days: WeightRange
    points: { date: string; kg: number; trend_kg: number }[]
    trend_before_kg: number | null
    goal_kg: number | null
  }
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

function day(r: DayRow): DayTotals {
  return {
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
    weightKg: num(r.weight_kg),
  }
}

/**
 * The whole Progress screen for one user in one database call
 * (progress_summary). The user is a parameter so the coach client week view
 * (step 5) reuses it; RLS limits whose data comes back.
 */
export async function progressSummary(supabase: SupabaseClient, userId: string, weekStart: string, range: WeightRange): Promise<ProgressSummary> {
  const { data, error } = await supabase.rpc("progress_summary", { p_user_id: userId, p_week_start: weekStart, p_weight_range: range })
  if (error) throw new Error(`progress_summary: ${error.message}`)
  const r = data as Raw
  const a = r.averages
  return {
    today: r.today,
    units: r.units === "metric" ? "metric" : "imperial",
    weekStart,
    week: r.week.map(day),
    averages: {
      elapsedDays: a.elapsed_days,
      loggedDays: a.logged_days,
      avgCalories: num(a.avg_calories),
      avgProteinG: num(a.avg_protein_g),
      daysOnTarget: a.days_on_target,
      proteinDays: a.protein_days,
      weighedShare: num(a.weighed_share),
    },
    days30: r.days30,
    weight: {
      rangeDays: r.weight.range_days,
      points: r.weight.points.map((p) => ({ date: p.date, kg: Number(p.kg), trendKg: Number(p.trend_kg) })),
      trendBeforeKg: num(r.weight.trend_before_kg),
      goalKg: num(r.weight.goal_kg),
    },
  }
}
