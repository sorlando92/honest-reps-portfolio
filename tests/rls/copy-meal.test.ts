import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createCast, deleteCast, type Cast, type TestUser } from "./fixtures"

let cast: Cast
beforeAll(async () => {
  cast = await createCast()
})
afterAll(async () => {
  await deleteCast(cast)
})

const YESTERDAY = { from: "2026-10-14T05:00:00Z", to: "2026-10-15T05:00:00Z" } // Oct 14 in Chicago
const NOW = "2026-10-15T17:30:00Z"

async function entry(user: TestUser, meal: string, loggedAt: string, rawInput: string, items: { name: string; calories: number; flag?: string }[]) {
  const { data, error } = await user.client
    .from("food_entries")
    .insert({ user_id: user.id, logged_at: loggedAt, method: "text", raw_input: rawInput, meal, client_uuid: randomUUID() })
    .select("id")
    .single()
  if (error) throw error
  const rpc = await user.client.rpc("replace_food_entry_items", {
    p_entry_id: data.id,
    p_items: items.map((i) => ({
      food_item_id: null,
      name: i.name,
      amount: 100,
      unit: "g",
      grams: 100,
      amount_source: i.flag ? "estimated" : "weighed",
      state: null,
      calories: i.calories,
      protein_g: 10,
      carbs_g: 0,
      fat_g: 0,
      flag_reason: i.flag ?? null,
    })),
  })
  if (rpc.error) throw rpc.error
  return data.id as string
}

describe("copy_meal", () => {
  it("copies the caller's entries of that meal and day with items, title and a link back", async () => {
    const first = await entry(cast.a, "lunch", "2026-10-14T17:00:00Z", "turkey sandwich\nand chips", [
      { name: "turkey sandwich", calories: 400 },
      { name: "chips", calories: 150, flag: "amount" },
    ])
    await entry(cast.a, "lunch", "2026-10-14T18:00:00Z", "apple", [{ name: "apple", calories: 95 }])
    await entry(cast.a, "dinner", "2026-10-14T23:00:00Z", "steak", [{ name: "steak", calories: 600 }])
    await entry(cast.a, "lunch", "2026-10-13T17:00:00Z", "day before", [{ name: "soup", calories: 200 }])

    const { data, error } = await cast.a.client.rpc("copy_meal", { p_from: YESTERDAY.from, p_to: YESTERDAY.to, p_meal: "lunch", p_logged_at: NOW })
    expect(error).toBeNull()
    expect(data).toBe(2)

    const { data: copies } = await cast.admin
      .from("food_entries")
      .select("title, meal, method, logged_at, raw_input, copied_from_entry_id, food_entry_items(name, calories, amount_source, flag_reason, position)")
      .eq("user_id", cast.a.id)
      .gte("logged_at", NOW)
      .order("logged_at")
    expect(copies).toHaveLength(2)
    expect(copies![0]).toMatchObject({ title: "turkey sandwich", meal: "lunch", method: "quick_add", raw_input: null, copied_from_entry_id: first })
    expect(copies![0].food_entry_items.sort((a, b) => a.position - b.position)).toEqual([
      { name: "turkey sandwich", calories: 400, amount_source: "weighed", flag_reason: null, position: 0 },
      { name: "chips", calories: 150, amount_source: "estimated", flag_reason: "amount", position: 1 },
    ])
    expect(copies![1].title).toBe("apple")
    expect(new Date(copies![1].logged_at).getTime()).toBeGreaterThan(new Date(copies![0].logged_at).getTime())
  })

  it("never copies someone else's entries", async () => {
    await entry(cast.b, "breakfast", "2026-10-14T13:00:00Z", "oats", [{ name: "oats", calories: 300 }])
    const { data } = await cast.a.client.rpc("copy_meal", { p_from: YESTERDAY.from, p_to: YESTERDAY.to, p_meal: "breakfast", p_logged_at: NOW })
    expect(data).toBe(0)
    const { data: coachCopy } = await cast.coach.client.rpc("copy_meal", { p_from: YESTERDAY.from, p_to: YESTERDAY.to, p_meal: "breakfast", p_logged_at: NOW })
    expect(coachCopy).toBe(0)
  })

  it("is not callable signed out", async () => {
    const { error } = await cast.anon.rpc("copy_meal", { p_from: YESTERDAY.from, p_to: YESTERDAY.to, p_meal: "lunch", p_logged_at: NOW })
    expect(error).not.toBeNull()
  })
})
