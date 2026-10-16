import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { TargetDefaults } from "./formula"

export type DefaultsSource = "coach" | "default_coach" | "app_config"

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v)

/**
 * The target settings for a user, never failing for a missing coach (bug
 * 2026-10-16): the user's coach's settings, else the default coach's, layered
 * over the seeded app_config defaults so a settings row missing a newer key
 * still works. Pure, so the order is unit tested.
 */
export function pickDefaults(sources: { coach: unknown; defaultCoach: unknown; appConfig: unknown }): { defaults: TargetDefaults; source: DefaultsSource } | null {
  const base = isObject(sources.appConfig) ? sources.appConfig : {}
  const [overlay, source]: [unknown, DefaultsSource] = isObject(sources.coach)
    ? [sources.coach, "coach"]
    : isObject(sources.defaultCoach)
      ? [sources.defaultCoach, "default_coach"]
      : [{}, "app_config"]
  const merged = { ...base, ...(overlay as Record<string, unknown>) }
  const complete = ["activity_multipliers", "goal_calorie_adjustment_pct", "protein_g_per_lb_goal_weight", "protein_cap_g", "fat_pct_of_calories", "fat_min_g_per_lb_goal_weight", "carbs_min_g"].every(
    (k) => k in merged
  )
  return complete ? { defaults: merged as unknown as TargetDefaults, source } : null
}

/** Reads the three sources with the service role (settings are reference data here). */
export async function resolveTargetDefaults(admin: SupabaseClient, userId: string) {
  const [{ data: profile }, { data: config }] = await Promise.all([
    admin.from("profiles").select("coach_id").eq("id", userId).maybeSingle(),
    admin.from("app_config").select("key, value").in("key", ["default_coach_id", "target_defaults"]),
  ])
  const value = (key: string) => config?.find((r) => r.key === key)?.value
  const settingsOf = async (coachId: unknown) => {
    if (typeof coachId !== "string") return null
    const { data } = await admin.from("coach_settings").select("target_defaults").eq("coach_id", coachId).maybeSingle()
    return data?.target_defaults ?? null
  }
  const [coach, defaultCoach] = await Promise.all([settingsOf(profile?.coach_id), settingsOf(value("default_coach_id"))])
  return pickDefaults({ coach, defaultCoach, appConfig: value("target_defaults") })
}
