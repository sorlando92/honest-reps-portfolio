import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { dayEntries } from "@/modules/nutrition/entries/today"
import { createCast, deleteCast, type Cast } from "./fixtures"

// Not an RLS suite: the Today query against a real database, so local day
// bounds are checked end to end in the user's profile timezone.

let cast: Cast
beforeAll(async () => {
  cast = await createCast()
  await log("2026-10-15T04:30:00Z", "2 eggs and toast\nwith butter") // 11:30 PM CDT, Oct 14
  await log("2026-10-15T05:30:00Z", null) // 12:30 AM CDT, Oct 15
  await log("2026-10-14T04:30:00Z", "late snack") // 11:30 PM CDT, Oct 13
})
afterAll(async () => {
  await deleteCast(cast)
})

async function log(loggedAt: string, rawInput: string | null) {
  const { data, error } = await cast.a.client
    .from("food_entries")
    .insert({ user_id: cast.a.id, logged_at: loggedAt, method: rawInput ? "text" : "manual", raw_input: rawInput, meal: "lunch", client_uuid: randomUUID() })
    .select("id")
    .single()
  if (error) throw error
  const items = [
    { name: "egg", calories: 143, protein_g: 12.6 },
    { name: "toast", calories: 80, protein_g: 3 },
  ].map((i, position) => ({
    ...i,
    entry_id: data.id,
    user_id: cast.a.id,
    position,
    amount: 1,
    unit: "piece",
    grams: 50,
    amount_source: "measured",
    carbs_g: 0,
    fat_g: 0,
  }))
  const inserted = await cast.a.client.from("food_entry_items").insert(items)
  if (inserted.error) throw inserted.error
}

describe("dayEntries", () => {
  it("puts a log at 11:30 PM Central on that Central day with its local time", async () => {
    const oct14 = await dayEntries(cast.a.client, cast.a.id, "America/Chicago", "2026-10-14")
    expect(oct14.map((e) => e.time)).toEqual(["11:30 PM"])
    expect(oct14[0].calories).toBe(223)

    const oct15 = await dayEntries(cast.a.client, cast.a.id, "America/Chicago", "2026-10-15")
    expect(oct15.map((e) => e.time)).toEqual(["12:30 AM"])
  })

  it("uses UTC days only for a UTC profile", async () => {
    const oct15 = await dayEntries(cast.a.client, cast.a.id, "UTC", "2026-10-15")
    expect(oct15.map((e) => e.time)).toEqual(["4:30 AM", "5:30 AM"])
  })

  it("titles the row with the first line of the raw input, items kept inside", async () => {
    const [typed] = await dayEntries(cast.a.client, cast.a.id, "America/Chicago", "2026-10-14")
    expect(typed.title).toBe("2 eggs and toast")
    expect(typed.items.map((i) => i.name)).toEqual(["egg", "toast"])

    const [manual] = await dayEntries(cast.a.client, cast.a.id, "America/Chicago", "2026-10-15")
    expect(manual.title).toBe("egg, toast")
  })
})
