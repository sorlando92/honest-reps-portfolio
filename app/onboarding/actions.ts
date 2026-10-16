"use server"

import { z } from "zod"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/core/auth/current-user"
import { track } from "@/core/events/track"
import { localToday } from "@/core/time/local-day"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { ageOn, computeTargets, MINIMUM_AGE, type TargetDefaults } from "@/modules/nutrition/targets/formula"

const answers = z.object({
  units: z.enum(["imperial", "metric"]),
  goal: z.enum(["lose_fat", "maintain", "build_muscle", "performance"]),
  sex: z.enum(["male", "female"]),
  dateOfBirth: z.iso.date(),
  heightCm: z.number().min(120).max(230),
  weightKg: z.number().min(30).max(300),
  goalWeightKg: z.number().min(30).max(300).nullable(),
  activityLevel: z.enum(["sedentary", "light", "moderate", "very_active", "extra_active"]),
  hasScale: z.boolean(),
  medical: z.boolean(),
  consents: z.object({ terms: z.literal(true), privacy: z.literal(true), disclaimer: z.literal(true) }),
})

export type OnboardingAnswers = z.infer<typeof answers>

export type FinishResult = { ok: false; error: "underage" | "invalid" | "settings" | "save" }

/**
 * Saves onboarding (PRD F1): profile, nutrition profile, the first weigh-in
 * (Q56), formula targets (Q54) and the signup consents (Q55), then lands on
 * Today. Under 18 saves nothing (Q61). Date of birth and the medical flag are
 * written with the service role because users cannot change them later.
 */
export async function finishOnboarding(input: OnboardingAnswers): Promise<FinishResult> {
  const parsed = answers.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid" }
  const a = parsed.data
  const user = await getCurrentUser()
  const today = localToday(user.timezone)
  if (ageOn(a.dateOfBirth, today) < MINIMUM_AGE) return { ok: false, error: "underage" }

  const supabase = await createClient()
  const admin = createAdminClient()
  const { data: profile } = await supabase.from("profiles").select("coach_id, onboarding_completed_at, medical_flag").eq("id", user.id).single()
  const { data: settings } = profile?.coach_id
    ? await supabase.from("coach_settings").select("target_defaults").eq("coach_id", profile.coach_id).maybeSingle()
    : { data: null }
  const { data: consentVersions } = await supabase.from("app_config").select("value").eq("key", "consent_versions").maybeSingle()
  if (!settings?.target_defaults) return { ok: false, error: "settings" }

  let targets
  try {
    targets = computeTargets(
      { sex: a.sex, ageYears: ageOn(a.dateOfBirth, today), heightCm: a.heightCm, weightKg: a.weightKg, goalWeightKg: a.goalWeightKg, activityLevel: a.activityLevel, goal: a.goal },
      settings.target_defaults as TargetDefaults
    )
  } catch {
    return { ok: false, error: "settings" }
  }

  const firstTime = !profile?.onboarding_completed_at
  const versions = (consentVersions?.value ?? {}) as Record<string, string>
  const steps = await Promise.all([
    admin
      .from("profiles")
      .update({
        units: a.units,
        date_of_birth: a.dateOfBirth,
        // A medical yes stays until the coach reviews it (Q20); a later no never clears it.
        medical_flag: Boolean(profile?.medical_flag) || a.medical,
        onboarding_completed_at: profile?.onboarding_completed_at ?? new Date().toISOString(),
      })
      .eq("id", user.id),
    supabase.from("nutrition_profiles").upsert(
      { user_id: user.id, goal: a.goal, sex: a.sex, height_cm: a.heightCm, activity_level: a.activityLevel, goal_weight_kg: a.goalWeightKg, has_scale: a.hasScale, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    ),
    supabase.from("weights").upsert({ user_id: user.id, date: today, weight_kg: Math.round(a.weightKg * 100) / 100, updated_at: new Date().toISOString() }, { onConflict: "user_id,date" }),
    supabase.from("targets").insert({
      user_id: user.id,
      calories: targets.calories,
      protein_g: targets.proteinG,
      carbs_g: targets.carbsG,
      fat_g: targets.fatG,
      set_by: "formula",
      note: targets.note,
    }),
    supabase.from("consents").insert(
      (["terms", "privacy", "disclaimer"] as const).map((kind) => ({ user_id: user.id, kind, version: versions[kind] ?? "draft-2026-10" }))
    ),
  ])
  if (steps.some((s) => s.error)) return { ok: false, error: "save" }

  if (firstTime) await track("onboarding_completed", { goal: a.goal, has_scale: a.hasScale, medical: a.medical, units: a.units })
  redirect("/today")
}
