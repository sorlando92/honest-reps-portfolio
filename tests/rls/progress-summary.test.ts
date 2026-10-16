import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { addDays, localToday } from "@/core/time/local-day"
import { weekStart } from "@/modules/nutrition/days/week"
import { progressSummary } from "@/modules/nutrition/progress/summary"
import { createCast, deleteCast, PERMISSION_DENIED, type Cast } from "./fixtures"

// progress_summary against a real database (docs/PROGRESS_SPEC.md "Data and
// performance"), plus profiles.is_test. Dates are relative to the real today
// in UTC, since the function reads the clock.

const TZ = "UTC"
let cast: Cast
let today: string
let monday: string

beforeAll(async () => {
  cast = await createCast()
  today = localToday(TZ)
  monday = weekStart(today)
  await cast.admin.from("profiles").update({ timezone: TZ, units: "metric" }).eq("id", cast.a.id)
  await cast.admin.from("nutrition_profiles").upsert({ user_id: cast.a.id, goal_weight_kg: 78 })
  await cast.admin
    .from("targets")
    .insert({ user_id: cast.a.id, calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 70, set_by: "formula", effective_from: `${addDays(today, -60)}T00:00:00Z` })
  // Today: on target, protein hit, 1 of 2 items weighed. 3 days ago (when in the 30 day window): off target.
  await log(today, 1950, 150, ["weighed", "estimated"])
  await log(addDays(today, -3), 1200, 60, ["hand", "hand"])
  // Weigh-ins: one before a 7 day range and two inside it.
  for (const [ago, kg] of [[20, 82], [5, 81], [0, 80]] as const) {
    const { error } = await cast.a.client.from("weights").insert({ user_id: cast.a.id, date: addDays(today, -ago), weight_kg: kg })
    if (error) throw error
  }
})
afterAll(async () => {
  await deleteCast(cast)
})

async function log(date: string, calories: number, protein: number, sources: string[]) {
  const { data, error } = await cast.a.client
    .from("food_entries")
    .insert({ user_id: cast.a.id, logged_at: `${date}T12:00:00Z`, method: "manual", meal: "lunch", client_uuid: randomUUID() })
    .select("id")
    .single()
  if (error) throw error
  const per = calories / sources.length
  const items = await cast.a.client.from("food_entry_items").insert(
    sources.map((s, position) => ({
      entry_id: data.id,
      user_id: cast.a.id,
      position,
      name: `item ${position}`,
      amount: 1,
      unit: "g",
      grams: 100,
      amount_source: s,
      calories: per,
      protein_g: protein / sources.length,
      carbs_g: 10,
      fat_g: 5,
    }))
  )
  if (items.error) throw items.error
}

describe("progress_summary", () => {
  it("returns the week, averages over logged days, 30 days and the weight series", async () => {
    const s = await progressSummary(cast.a.client, cast.a.id, monday, 7)
    expect(s.today).toBe(today)
    expect(s.units).toBe("metric")
    expect(s.week.map((d) => d.date)[0]).toBe(monday)
    expect(s.week).toHaveLength(7)
    expect(s.week.find((d) => d.date === today)).toMatchObject({ logged: true, calories: 1950, adherent: true, proteinHit: true })

    const elapsed = s.week.filter((d) => d.date <= today)
    expect(s.averages.elapsedDays).toBe(elapsed.length)
    expect(s.averages.loggedDays).toBe(elapsed.filter((d) => d.logged).length)
    // Unlogged days are not zeros in the average.
    expect(s.averages.avgCalories).toBeCloseTo(elapsed.filter((d) => d.logged).reduce((t, d) => t + d.calories, 0) / s.averages.loggedDays)
    expect(s.averages.daysOnTarget).toBe(1)

    expect(s.days30).toHaveLength(30)
    expect(s.days30[29]).toEqual({ date: today, logged: true, adherent: true, weighed: true })
    expect(s.days30[26]).toMatchObject({ date: addDays(today, -3), logged: true, adherent: false })
    expect(s.days30.filter((d) => d.logged)).toHaveLength(2)

    // 7 day range: the weigh-in 20 days ago only seeds the trend.
    expect(s.weight.points.map((p) => p.date)).toEqual([addDays(today, -5), today])
    expect(s.weight.trendBeforeKg).toBe(82)
    expect(s.weight.points[0].trendKg).toBeCloseTo(81.9)
    expect(s.weight.points[1].trendKg).toBeCloseTo(81.71)
    expect(s.weight.goalKg).toBe(78)
  })

  it("covers the whole 90 day range", async () => {
    const s = await progressSummary(cast.a.client, cast.a.id, monday, 90)
    expect(s.weight.points).toHaveLength(3)
    expect(s.weight.trendBeforeKg).toBeNull()
  })

  it("counts the weighed share of items (Q57)", async () => {
    const s = await progressSummary(cast.a.client, cast.a.id, monday, 30)
    const items = s.week.filter((d) => d.date <= today).reduce((t, d) => t + d.items, 0)
    const weighed = s.week.filter((d) => d.date <= today).reduce((t, d) => t + d.weighedItems, 0)
    expect(s.averages.weighedShare).toBeCloseTo(weighed / items)
  })

  it("gives the assigned coach the same summary and others nothing", async () => {
    const mine = await progressSummary(cast.a.client, cast.a.id, monday, 30)
    expect(await progressSummary(cast.coach.client, cast.a.id, monday, 30)).toEqual(mine)
    for (const other of [cast.b, cast.otherCoach]) {
      const s = await progressSummary(other.client, cast.a.id, monday, 30)
      expect(s.days30.some((d) => d.logged || d.weighed)).toBe(false)
      expect(s.weight.points).toEqual([])
      expect(s.averages.daysOnTarget).toBeNull()
    }
  })

  it("refuses bad arguments and signed out callers", async () => {
    const notMonday = await cast.a.client.rpc("progress_summary", { p_user_id: cast.a.id, p_week_start: addDays(monday, 1), p_weight_range: 30 })
    expect(notMonday.error).not.toBeNull()
    const badRange = await cast.a.client.rpc("progress_summary", { p_user_id: cast.a.id, p_week_start: monday, p_weight_range: 14 })
    expect(badRange.error).not.toBeNull()
    const anon = await cast.anon.rpc("progress_summary", { p_user_id: cast.a.id, p_week_start: monday, p_weight_range: 30 })
    expect(anon.error).not.toBeNull()
  })

  it("has empty states for a user with nothing logged", async () => {
    const s = await progressSummary(cast.b.client, cast.b.id, monday, 30)
    expect(s.averages).toMatchObject({ loggedDays: 0, avgCalories: null, daysOnTarget: null, weighedShare: null })
    expect(s.weight.points).toEqual([])
  })
})

describe("profiles.is_test", () => {
  it("defaults to false and users cannot set it", async () => {
    const { data } = await cast.a.client.from("profiles").select("is_test").eq("id", cast.a.id).single()
    expect(data?.is_test).toBe(false)
    const { error } = await cast.a.client.from("profiles").update({ is_test: true }).eq("id", cast.a.id)
    expect(error?.code).toBe(PERMISSION_DENIED)
  })
})
