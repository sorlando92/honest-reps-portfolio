import { describe, expect, it } from "vitest"
import { ageOn, bmr, calorieFloor, computeTargets, FLOORS_NOTE, type TargetDefaults, type TargetInput } from "./formula"

// The seeded defaults (QUESTIONS.md Q29, Q54).
const defaults: TargetDefaults = {
  activity_multipliers: { sedentary: 1.2, light: 1.375, moderate: 1.55, very_active: 1.725, extra_active: 1.9 },
  goal_calorie_adjustment_pct: { lose_fat: -20, maintain: 0, build_muscle: 10, performance: 5 },
  protein_g_per_lb_goal_weight: { lose_fat: 1.0, maintain: 0.8, build_muscle: 1.0, performance: 0.9 },
  protein_cap_g: 220,
  fat_pct_of_calories: { lose_fat: 30, maintain: 30, build_muscle: 25, performance: 25 },
  fat_min_g_per_lb_goal_weight: 0.3,
  carbs_min_g: 50,
}

const man: TargetInput = { sex: "male", ageYears: 35, heightCm: 180, weightKg: 90, goalWeightKg: 82, activityLevel: "moderate", goal: "lose_fat" }
const kcal = (t: { proteinG: number; carbsG: number; fatG: number }) => t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9

describe("bmr", () => {
  it("is Mifflin St Jeor", () => {
    expect(bmr(man)).toBe(1855) // 900 + 1125 - 175 + 5
    expect(bmr({ sex: "female", ageYears: 30, heightCm: 165, weightKg: 65 })).toBeCloseTo(1370.25, 2)
  })
})

describe("computeTargets", () => {
  it("applies activity and goal, protein from goal weight, fat at 30% for fat loss, carbs the rest", () => {
    const t = computeTargets(man, defaults)
    expect(t.calories).toBe(2300) // 1855 x 1.55 x 0.8 = 2300.2
    expect(t.proteinG).toBe(181) // 82 kg = 180.8 lb x 1.0
    expect(t.fatG).toBe(77) // 30% of 2300 / 9 = 76.7 (floor 0.3 x 180.8 lb = 54)
    expect(t.carbsG).toBe(220) // (2300 - 724 - 693) / 4 = 220.75
    expect(t).toMatchObject({ bmr: 1855, note: null })
  })

  it("uses 25% fat for build muscle and performance", () => {
    const t = computeTargets({ ...man, goal: "build_muscle", goalWeightKg: null }, defaults)
    expect(t.calories).toBe(3160) // 1855 x 1.55 x 1.1 = 3162.8
    expect(t.fatG).toBe(88) // 25% of 3160 / 9 = 87.8
    expect(t.proteinG).toBe(198) // 90 kg = 198.4 lb x 1.0
  })

  it("never goes below BMR", () => {
    const t = computeTargets({ ...man, activityLevel: "sedentary" }, { ...defaults, goal_calorie_adjustment_pct: { ...defaults.goal_calorie_adjustment_pct, lose_fat: -40 } })
    expect(t.calories).toBe(1860) // 1855 x 1.2 x 0.6 = 1335.6, floored to BMR rounded up
  })

  it("caps protein and uses current weight without a goal weight", () => {
    expect(computeTargets({ ...man, weightKg: 130, goalWeightKg: null, goal: "build_muscle" }, defaults).proteinG).toBe(220)
    expect(computeTargets({ ...man, goalWeightKg: null, goal: "maintain" }, defaults).proteinG).toBe(159) // 198.4 lb x 0.8
  })

  it("lowers fat toward its floor before carbs go under 50 g", () => {
    // A coach setting of 2 g protein per lb: 30% fat would leave carbs at 39 g.
    const highProtein = { ...defaults, protein_g_per_lb_goal_weight: { ...defaults.protein_g_per_lb_goal_weight, lose_fat: 2.0 }, protein_cap_g: 400 }
    const t = computeTargets(man, highProtein)
    expect(t.proteinG).toBe(362)
    expect(t.fatG).toBe(72) // (2300 - 1448 - 200) / 9, above the 54 g floor
    expect(t.carbsG).toBe(51)
    expect(t).toMatchObject({ calories: 2300, note: null })
  })

  it("raises calories to fit when protein, fat and carb floors all bind, with a note for the coach", () => {
    const t = computeTargets({ sex: "female", ageYears: 60, heightCm: 150, weightKg: 50, goalWeightKg: 100, activityLevel: "sedentary", goal: "lose_fat" }, defaults)
    expect(t.proteinG).toBe(220) // cap
    expect(t.fatG).toBe(66) // floor 0.3 x 220.5 lb
    expect(t.carbsG).toBe(50)
    expect(t.calories).toBe(1680) // 880 + 594 + 200 = 1674, up to 10
    expect(t.note).toBe(FLOORS_NOTE)
    expect(kcal(t)).toBeLessThanOrEqual(t.calories)
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

describe("calorieFloor", () => {
  it("is BMR rounded up to 10", () => {
    // 10 x 80 + 6.25 x 180 - 5 x 36 + 5 = 1,750
    expect(calorieFloor({ sex: "male", ageYears: 36, heightCm: 180, weightKg: 80 })).toBe(1750)
    // 10 x 60 + 6.25 x 165 - 5 x 30 - 161 = 1,320.25
    expect(calorieFloor({ sex: "female", ageYears: 30, heightCm: 165, weightKg: 60 })).toBe(1330)
  })
})
