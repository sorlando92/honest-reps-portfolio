// Calorie and macro targets from onboarding answers (PRD F1, ARCHITECTURE.md
// "Target formula defaults"). Pure; every number comes from
// coach_settings.target_defaults. Weights in kg, heights in cm.

export type Goal = "lose_fat" | "maintain" | "build_muscle" | "performance"
export type Sex = "male" | "female"

export interface TargetDefaults {
  activity_multipliers: Record<string, number>
  goal_calorie_adjustment_pct: Record<Goal, number>
  protein_g_per_lb_goal_weight: Record<Goal, number>
  protein_cap_g: number
  /** QUESTIONS.md Q54: fat as a share of calories, with a floor per lb of body weight. */
  fat_pct_of_calories?: number
  fat_min_g_per_lb?: number
}

export interface TargetInput {
  sex: Sex
  ageYears: number
  heightCm: number
  weightKg: number
  goalWeightKg: number | null
  activityLevel: string
  goal: Goal
}

export interface Targets {
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  /** Estimated BMR, the calorie floor (PRD F1). */
  bmr: number
}

// Q54 recommendation, used until the coach settings carry their own values.
const FAT_PCT_DEFAULT = 25
const FAT_MIN_PER_LB_DEFAULT = 0.3
const LB_PER_KG = 2.20462

/** Mifflin St Jeor resting energy, kcal per day. */
export function bmr({ sex, ageYears, heightCm, weightKg }: Pick<TargetInput, "sex" | "ageYears" | "heightCm" | "weightKg">): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * ageYears + (sex === "male" ? 5 : -161)
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step

export function computeTargets(input: TargetInput, d: TargetDefaults): Targets {
  const rest = bmr(input)
  const multiplier = d.activity_multipliers[input.activityLevel]
  if (!multiplier) throw new Error(`Unknown activity level: ${input.activityLevel}`)
  const adjusted = rest * multiplier * (1 + (d.goal_calorie_adjustment_pct[input.goal] ?? 0) / 100)
  // Floor: never below estimated BMR, after rounding too.
  const floor = Math.ceil(rest / 10) * 10
  const calories = Math.max(roundTo(adjusted, 10), floor)

  const proteinBasisLb = (input.goalWeightKg ?? input.weightKg) * LB_PER_KG
  const proteinG = Math.round(Math.min(proteinBasisLb * (d.protein_g_per_lb_goal_weight[input.goal] ?? 0.8), d.protein_cap_g))

  const fatG = Math.round(Math.max(((d.fat_pct_of_calories ?? FAT_PCT_DEFAULT) / 100) * calories / 9, (d.fat_min_g_per_lb ?? FAT_MIN_PER_LB_DEFAULT) * input.weightKg * LB_PER_KG))
  const carbsG = Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4))
  return { calories, proteinG, carbsG, fatG, bmr: Math.round(rest) }
}

/** Whole years on a local date (YYYY-MM-DD) for a date of birth (YYYY-MM-DD). */
export function ageOn(dateOfBirth: string, today: string): number {
  const [by, bm, bd] = dateOfBirth.split("-").map(Number)
  const [ty, tm, td] = today.split("-").map(Number)
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0)
}

/** PRD F1: under 18 cannot create an account. */
export const MINIMUM_AGE = 18
