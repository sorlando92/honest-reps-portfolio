import { describe, expect, it } from "vitest"
import { ageOn, bmr, computeTargets, type TargetDefaults, type TargetInput } from "./formula"

// The seeded defaults (QUESTIONS.md Q29, Q54).
const defaults: TargetDefaults = {
  activity_multipliers: { sedentary: 1.2, light: 1.375, moderate: 1.55, very_active: 1.725, extra_active: 1.9 },
  goal_calorie_adjustment_pct: { lose_fat: -20, maintain: 0, build_muscle: 10, performance: 5 },
  protein_g_per_lb_goal_weight: { lose_fat: 1.0, maintain: 0.8, build_muscle: 1.0, performance: 0.9 },
  protein_cap_g: 220,
  fat_pct_of_calories: 25,
  fat_min_g_per_lb: 0.3,
}

const man: TargetInput = { sex: "male", ageYears: 35, heightCm: 180, weightKg: 90, goalWeightKg: 82, activityLevel: "moderate", goal: "lose_fat" }

describe("bmr", () => {
  it("is Mifflin St Jeor", () => {
    expect(bmr(man)).toBe(1855) // 900 + 1125 - 175 + 5
    expect(bmr({ sex: "female", ageYears: 30, heightCm: 165, weightKg: 65 })).toBeCloseTo(1370.25, 2)
  })
})

describe("computeTargets", () => {
  it("applies activity and goal, protein from goal weight, fat at 25%, carbs the rest", () => {
    const t = computeTargets(man, defaults)
    expect(t.calories).toBe(2300) // 1855 x 1.55 x 0.8 = 2300.2
    expect(t.proteinG).toBe(181) // 82 kg = 180.8 lb x 1.0
    expect(t.fatG).toBe(64) // 25% of 2300 / 9 = 63.9 (floor 0.3 x 198.4 lb = 59.5)
    expect(t.carbsG).toBe(250) // (2300 - 724 - 576) / 4
    expect(t.bmr).toBe(1855)
  })

  it("never goes below BMR", () => {
    const t = computeTargets({ ...man, activityLevel: "sedentary" }, { ...defaults, goal_calorie_adjustment_pct: { ...defaults.goal_calorie_adjustment_pct, lose_fat: -40 } })
    expect(t.calories).toBe(1860) // 1855 x 1.2 x 0.6 = 1335.6, floored to BMR rounded up
  })

  it("caps protein and uses current weight without a goal weight", () => {
    expect(computeTargets({ ...man, weightKg: 130, goalWeightKg: null, goal: "build_muscle" }, defaults).proteinG).toBe(220)
    expect(computeTargets({ ...man, goalWeightKg: null, goal: "maintain" }, defaults).proteinG).toBe(159) // 198.4 lb x 0.8
  })

  it("keeps fat at its floor per lb when 25% is lower, and carbs never negative", () => {
    const heavy = computeTargets({ ...man, sex: "female", weightKg: 120, heightCm: 155, ageYears: 60, activityLevel: "sedentary" }, defaults)
    expect(heavy.fatG).toBe(79) // 0.3 x 264.6 lb
    expect(heavy.carbsG).toBeGreaterThanOrEqual(0)
  })

  it("rejects an unknown activity level", () => {
    expect(() => computeTargets({ ...man, activityLevel: "couch" }, defaults)).toThrow()
  })
})

describe("ageOn", () => {
  it("counts whole years and turns over on the birthday", () => {
    expect(ageOn("2008-10-16", "2026-10-15")).toBe(17)
    expect(ageOn("2008-10-15", "2026-10-15")).toBe(18)
  })
})
