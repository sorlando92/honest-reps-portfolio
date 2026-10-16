import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { dailyTotals, loggingStreak } from "@/modules/nutrition/days/daily"
import { createCast, deleteCast, type Cast } from "./fixtures"

// daily_totals and logging_streak against a real database: local days in
// the profile timezone, targets in effect on each date, adherence, and who
// may read whose days.

let cast: Cast
beforeAll(async () => {
  cast = await createCast()
  await cast.admin.from("profiles").update({ timezone: "America/Chicago" }).eq("id", cast.a.id)

  // Targets: 2,000 from Oct 1, then 2,500 from Oct 14 at noon Central.
  const targets = await cast.admin.from("targets").insert([
    { user_id: cast.a.id, calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 70, set_by: "formula", effective_from: "2026-10-01T05:00:00Z" },
    { user_id: cast.a.id, calories: 2500, protein_g: 180, carbs_g: 250, fat_g: 80, set_by: "coach", effective_from: "2026-10-14T17:00:00Z" },
  ])
  if (targets.error) throw targets.error

  await log("2026-10-13T04:30:00Z", 1900, 150, "weighed") // 11:30 PM CDT Oct 12: on target, protein hit
  await log("2026-10-13T15:00:00Z", 1000, 60, "estimated") // Oct 13: off target
  await log("2026-10-14T13:00:00Z", 2400, 170, "weighed") // Oct 14: judged against 2,500
  await log("2026-10-15T15:00:00Z", 2550, 100, "hand") // Oct 15
  const weighed = await cast.a.client.from("weights").insert({ user_id: cast.a.id, date: "2026-10-14", weight_kg: 82.5 })
  if (weighed.error) throw weighed.error
})
afterAll(async () => {
  await deleteCast(cast)
})

async function log(loggedAt: string, calories: number, protein: number, amountSource: string) {
  const { data, error } = await cast.a.client
    .from("food_entries")
    .insert({ user_id: cast.a.id, logged_at: loggedAt, method: "manual", meal: "lunch", client_uuid: randomUUID() })
    .select("id")
    .single()
  if (error) throw error
  const items = await cast.a.client.from("food_entry_items").insert([
    { entry_id: data.id, user_id: cast.a.id, position: 0, name: "a", amount: 1, unit: "g", grams: 100, amount_source: amountSource, calories: calories - 100, protein_g: protein, carbs_g: 10, fat_g: 5 },
    { entry_id: data.id, user_id: cast.a.id, position: 1, name: "b", amount: 1, unit: "g", grams: 100, amount_source: "estimated", calories: 100, protein_g: 0, carbs_g: 10, fat_g: 5 },
  ])
  if (items.error) throw items.error
}

describe("daily_totals", () => {
  it("returns one row per local day with totals, targets in effect and adherence", async () => {
    const days = await dailyTotals(cast.a.client, cast.a.id, "2026-10-11", "2026-10-16")
    expect(days.map((d) => d.date)).toEqual(["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"])
    const [oct11, oct12, oct13, oct14, oct15, oct16] = days

    expect(oct11).toMatchObject({ logged: false, calories: 0, adherent: false, proteinHit: false })
    // 11:30 PM Central belongs to the Central day.
    expect(oct12).toMatchObject({ logged: true, calories: 1900, proteinG: 150, carbsG: 20, items: 2, weighedItems: 1, adherent: true, proteinHit: true })
    expect(oct12.target?.calories).toBe(2000)
    expect(oct13).toMatchObject({ logged: true, calories: 1000, adherent: false, proteinHit: false, weighedItems: 0 })
    // The new target took effect at noon on Oct 14, so it applies to that day.
    expect(oct14.target?.calories).toBe(2500)
    expect(oct14).toMatchObject({ adherent: true, proteinHit: true, weightKg: 82.5 }) // 170 g is over 90% of 180 g
    expect(oct15).toMatchObject({ proteinHit: false })
    expect(oct15).toMatchObject({ calories: 2550, adherent: true })
    expect(oct16.logged).toBe(false)
  })

  it("has no targets and null adherence before the first target", async () => {
    const [sep30] = await dailyTotals(cast.a.client, cast.a.id, "2026-09-30", "2026-09-30")
    expect(sep30).toMatchObject({ target: null, adherent: null, proteinHit: null })
  })

  it("lets the assigned coach read the same days, and nobody else", async () => {
    const mine = await dailyTotals(cast.a.client, cast.a.id, "2026-10-12", "2026-10-15")
    const coach = await dailyTotals(cast.coach.client, cast.a.id, "2026-10-12", "2026-10-15")
    expect(coach).toEqual(mine)

    for (const other of [cast.b, cast.outsider, cast.otherCoach]) {
      const days = await dailyTotals(other.client, cast.a.id, "2026-10-12", "2026-10-15")
      expect(days.every((d) => !d.logged && d.target === null && d.weightKg === null)).toBe(true)
    }
  })

  it("refuses callers who are not signed in", async () => {
    const { error } = await cast.anon.rpc("daily_totals", { p_user_id: cast.a.id, p_from: "2026-10-12", p_to: "2026-10-15" })
    expect(error).not.toBeNull()
  })
})

describe("logging_streak", () => {
  it("counts consecutive logged days and does not break before the day ends", async () => {
    expect(await loggingStreak(cast.a.client, cast.a.id, "2026-10-15")).toBe(4)
    expect(await loggingStreak(cast.a.client, cast.a.id, "2026-10-16")).toBe(4) // nothing yet today
    expect(await loggingStreak(cast.a.client, cast.a.id, "2026-10-17")).toBe(0) // yesterday empty
    expect(await loggingStreak(cast.a.client, cast.a.id, "2026-10-13")).toBe(2)
  })

  it("is 0 for other members", async () => {
    expect(await loggingStreak(cast.b.client, cast.a.id, "2026-10-15")).toBe(0)
  })
})
