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
  /** QUESTIONS.md Q54: fat as a share of calories by goal. */
  fat_pct_of_calories: Record<Goal, number>
  /** Fat floor, grams per lb of goal weight (current weight if none). */
  fat_min_g_per_lb_goal_weight: number
  /** Carbs never go below this; fat gives way first, then calories rise. */
  carbs_min_g: number
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
  /** Set when protein, fat and carb floors forced calories above the formula (Q54); shown to the coach. */
  note: string | null
}

export const FLOORS_NOTE = "Calories raised to fit the protein, fat and carb floors."

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
  let calories = Math.max(roundTo(adjusted, 10), floor)

  const basisLb = (input.goalWeightKg ?? input.weightKg) * LB_PER_KG
  const proteinG = Math.round(Math.min(basisLb * d.protein_g_per_lb_goal_weight[input.goal], d.protein_cap_g))

  // Q54: fat is a share of calories, never under its floor; carbs take the
  // rest, never under their minimum. Fat gives way toward its floor first; if
  // both floors bind, calories rise to fit and the coach gets a note.
  const fatFloor = Math.round(d.fat_min_g_per_lb_goal_weight * basisLb)
  let fatG = Math.max(Math.round(((d.fat_pct_of_calories[input.goal] / 100) * calories) / 9), fatFloor)
  const carbsFor = (fat: number) => Math.floor((calories - proteinG * 4 - fat * 9) / 4)
  let carbsG = carbsFor(fatG)
  let note: string | null = null
  if (carbsG < d.carbs_min_g) {
    fatG = Math.max(fatFloor, Math.floor((calories - proteinG * 4 - d.carbs_min_g * 4) / 9))
    carbsG = carbsFor(fatG)
  }
  if (carbsG < d.carbs_min_g) {
    carbsG = d.carbs_min_g
    calories = Math.ceil((proteinG * 4 + fatG * 9 + carbsG * 4) / 10) * 10
    note = FLOORS_NOTE
  }
  return { calories, proteinG, carbsG, fatG, bmr: Math.round(rest), note }
}

/** Whole years on a local date (YYYY-MM-DD) for a date of birth (YYYY-MM-DD). */
export function ageOn(dateOfBirth: string, today: string): number {
  const [by, bm, bd] = dateOfBirth.split("-").map(Number)
  const [ty, tm, td] = today.split("-").map(Number)
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0)
}

/** PRD F1: under 18 cannot create an account. */
export const MINIMUM_AGE = 18

/** The calorie floor: estimated BMR rounded up to 10 (PRD F1). */
export function calorieFloor(input: Pick<TargetInput, "sex" | "ageYears" | "heightCm" | "weightKg">): number {
  return Math.ceil(bmr(input) / 10) * 10
}
