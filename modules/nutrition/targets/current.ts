import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { localToday } from "@/core/time/local-day"
import { ageOn, calorieFloor, type Sex } from "./formula"

export interface CurrentTargets {
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  setBy: "formula" | "user" | "coach"
}

/** The latest targets row, or null before onboarding. */
export async function currentTargets(supabase: SupabaseClient, userId: string): Promise<CurrentTargets | null> {
  const { data } = await supabase
    .from("targets")
    .select("calories, protein_g, carbs_g, fat_g, set_by")
    .eq("user_id", userId)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return { calories: data.calories, proteinG: data.protein_g, carbsG: data.carbs_g, fatG: data.fat_g, setBy: data.set_by }
}

/**
 * The user's calorie floor today from their onboarding answers and latest
 * weigh-in, or null when something it needs is missing.
 */
export async function userCalorieFloor(supabase: SupabaseClient, userId: string): Promise<number | null> {
  const [{ data: profile }, { data: body }, { data: weight }] = await Promise.all([
    supabase.from("profiles").select("date_of_birth, timezone").eq("id", userId).single(),
    supabase.from("nutrition_profiles").select("sex, height_cm").eq("user_id", userId).maybeSingle(),
    supabase.from("weights").select("weight_kg").eq("user_id", userId).order("date", { ascending: false }).limit(1).maybeSingle(),
  ])
  if (!profile?.date_of_birth || !body?.sex || !body.height_cm || !weight) return null
  return calorieFloor({
    sex: body.sex as Sex,
    ageYears: ageOn(profile.date_of_birth, localToday(profile.timezone ?? "UTC")),
    heightCm: Number(body.height_cm),
    weightKg: Number(weight.weight_kg),
  })
}
