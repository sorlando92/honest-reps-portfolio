import { describe, expect, it } from "vitest"
import { pickDefaults } from "./defaults"

const full = {
  activity_multipliers: { moderate: 1.55 },
  goal_calorie_adjustment_pct: { lose_fat: -20 },
  protein_g_per_lb_goal_weight: { lose_fat: 1 },
  protein_cap_g: 220,
  fat_pct_of_calories: { lose_fat: 30 },
  fat_min_g_per_lb_goal_weight: 0.3,
  carbs_min_g: 50,
}

describe("pickDefaults", () => {
  it("uses the user's coach first", () => {
    const r = pickDefaults({ coach: { ...full, protein_cap_g: 250 }, defaultCoach: { ...full, protein_cap_g: 200 }, appConfig: full })
    expect(r).toMatchObject({ source: "coach", defaults: { protein_cap_g: 250 } })
  })

  it("falls back to the default coach for a coach or a member without a coach", () => {
    const r = pickDefaults({ coach: null, defaultCoach: { ...full, protein_cap_g: 200 }, appConfig: full })
    expect(r).toMatchObject({ source: "default_coach", defaults: { protein_cap_g: 200 } })
  })

  it("falls back to app_config when there is no coach at all", () => {
    expect(pickDefaults({ coach: null, defaultCoach: null, appConfig: full })).toMatchObject({ source: "app_config", defaults: full })
  })

  it("fills keys a coach's older settings lack from app_config", () => {
    const older = Object.fromEntries(Object.entries(full).filter(([k]) => !["carbs_min_g", "fat_pct_of_calories", "fat_min_g_per_lb_goal_weight"].includes(k)))
    const r = pickDefaults({ coach: { ...older, protein_cap_g: 240 }, defaultCoach: null, appConfig: full })
    expect(r?.defaults).toMatchObject({ protein_cap_g: 240, carbs_min_g: 50, fat_pct_of_calories: { lose_fat: 30 } })
  })

  it("is null only when nothing complete exists", () => {
    expect(pickDefaults({ coach: null, defaultCoach: null, appConfig: null })).toBeNull()
    expect(pickDefaults({ coach: { protein_cap_g: 1 }, defaultCoach: null, appConfig: null })).toBeNull()
  })
})
