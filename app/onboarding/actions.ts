"use server"

import { z } from "zod"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/core/auth/current-user"
import { track } from "@/core/events/track"
import { localToday } from "@/core/time/local-day"
import { deleteAccount } from "@/core/account/delete"
import { createAdminClient } from "@/lib/supabase/admin"
import { resolveTargetDefaults } from "@/modules/nutrition/targets/defaults"
import { ageOn, computeTargets, MINIMUM_AGE } from "@/modules/nutrition/targets/formula"

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

/**
 * Under 18 (Q61, security audit L2): the screen stops at the date of birth
 * and calls this, which checks the age again on the server and deletes the
 * account. Nothing about the person is kept.
 */
export async function closeUnderageAccount(dateOfBirth: string): Promise<{ deleted: boolean }> {
  if (!z.iso.date().safeParse(dateOfBirth).success) return { deleted: false }
  const user = await getCurrentUser()
  if (ageOn(dateOfBirth, localToday(user.timezone)) >= MINIMUM_AGE) return { deleted: false }
  return { deleted: await closeAccount(user.id) }
}

/**
 * Deletes without touching cookies here: changing them in a server action
 * re-renders the page, which would leave for sign in before the screen can
 * say the account is gone. The screen clears the session itself afterwards.
 */
async function closeAccount(userId: string): Promise<boolean> {
  const deleted = await deleteAccount(createAdminClient(), userId)
  if (!deleted) console.error("[onboarding] under 18 account not deleted", { userId })
  return deleted
}

/** Why a save failed, so the screen can say what happened (never "connection" unless it was the network). */
export type FinishResult = { ok: false; error: "underage" | "invalid" | "server" }

const CONSENT_KINDS = ["terms", "privacy", "disclaimer"] as const

/**
 * Saves onboarding (PRD F1) in one transaction (`complete_onboarding`):
 * profile, nutrition profile, the first weigh-in (Q56), formula targets (Q54)
 * and signup consents (Q55). Safe to retry. Under 18 saves nothing (Q61).
 * Target settings resolve from the user's coach, else the default coach, else
 * app_config, so a coach or a member without a coach never fails.
 */
export async function finishOnboarding(input: OnboardingAnswers): Promise<FinishResult> {
  const parsed = answers.safeParse(input)
  if (!parsed.success) {
    console.error("[onboarding] invalid answers", parsed.error.issues)
    return { ok: false, error: "invalid" }
  }
  const a = parsed.data
  const user = await getCurrentUser()
  const today = localToday(user.timezone)
  const age = ageOn(a.dateOfBirth, today)
  if (age < MINIMUM_AGE) {
    await closeAccount(user.id)
    return { ok: false, error: "underage" }
  }

  const admin = createAdminClient()
  const [resolved, { data: consentConfig }] = await Promise.all([
    resolveTargetDefaults(admin, user.id),
    admin.from("app_config").select("value").eq("key", "consent_versions").maybeSingle(),
  ])
  if (!resolved) {
    console.error("[onboarding] no target settings: no coach, default coach or app_config.target_defaults", { userId: user.id })
    return { ok: false, error: "server" }
  }

  let targets
  try {
    targets = computeTargets(
      { sex: a.sex, ageYears: age, heightCm: a.heightCm, weightKg: a.weightKg, goalWeightKg: a.goalWeightKg, activityLevel: a.activityLevel, goal: a.goal },
      resolved.defaults
    )
  } catch (error) {
    console.error("[onboarding] target formula failed", { userId: user.id, source: resolved.source, error })
    return { ok: false, error: "server" }
  }

  const versions = (consentConfig?.value ?? {}) as Record<string, string>
  const { data: firstTime, error } = await admin.rpc("complete_onboarding", {
    p_user_id: user.id,
    p: {
      units: a.units,
      date_of_birth: a.dateOfBirth,
      medical: a.medical,
      goal: a.goal,
      sex: a.sex,
      height_cm: a.heightCm,
      activity_level: a.activityLevel,
      goal_weight_kg: a.goalWeightKg,
      has_scale: a.hasScale,
      weight_kg: Math.round(a.weightKg * 100) / 100,
      local_date: today,
      targets: { calories: targets.calories, protein_g: targets.proteinG, carbs_g: targets.carbsG, fat_g: targets.fatG, note: targets.note },
      consent_versions: Object.fromEntries(CONSENT_KINDS.map((k) => [k, versions[k] ?? "draft-2026-10"])),
    },
  })
  if (error) {
    console.error("[onboarding] save failed", { userId: user.id, code: error.code, message: error.message, details: error.details })
    return { ok: false, error: "server" }
  }

  if (firstTime) await track("onboarding_completed", { goal: a.goal, has_scale: a.hasScale, medical: a.medical, units: a.units, targets_source: resolved.source })
  // PRD F1: the required install step and push permission come next.
  redirect("/install")
}
