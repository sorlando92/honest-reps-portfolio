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

const item = (name: string, calories: number, flag_reason: string | null = null) => ({
  food_item_id: null,
  name,
  amount: 100,
  unit: "g",
  grams: 100,
  amount_source: "weighed",
  state: null,
  calories,
  protein_g: 10,
  carbs_g: 0,
  fat_g: 0,
  flag_reason,
})

async function entryWithItems(user: TestUser): Promise<string> {
  const { data, error } = await user.client
    .from("food_entries")
    .insert({ user_id: user.id, logged_at: new Date().toISOString(), method: "text", raw_input: "eggs", client_uuid: randomUUID() })
    .select("id")
    .single()
  if (error) throw error
  const { error: rpcError } = await user.client.rpc("replace_food_entry_items", { p_entry_id: data.id, p_items: [item("egg", 140, "amount")] })
  if (rpcError) throw rpcError
  return data.id
}

const itemsOf = async (entryId: string) =>
  (await cast.admin.from("food_entry_items").select("name, calories, position, flagged").eq("entry_id", entryId).order("position")).data

describe("replace_food_entry_items", () => {
  it("replaces the owner's items in order and clears flags the owner drops", async () => {
    const id = await entryWithItems(cast.a)
    const { error } = await cast.a.client.rpc("replace_food_entry_items", {
      p_entry_id: id,
      p_items: [item("egg", 70), item("toast", 80)],
    })
    expect(error).toBeNull()
    expect(await itemsOf(id)).toEqual([
      { name: "egg", calories: 70, position: 0, flagged: false },
      { name: "toast", calories: 80, position: 1, flagged: false },
    ])
  })

  it("refuses another user's entry and the coach, leaving it unchanged", async () => {
    const id = await entryWithItems(cast.a)
    for (const user of [cast.b, cast.coach]) {
      const { error } = await user.client.rpc("replace_food_entry_items", { p_entry_id: id, p_items: [item("x", 1)] })
      expect(error?.code).toBe("42501")
    }
    expect(await itemsOf(id)).toEqual([{ name: "egg", calories: 140, position: 0, flagged: true }])
  })

  it("keeps the old items when the new ones are invalid", async () => {
    const id = await entryWithItems(cast.a)
    const bad = { ...item("egg", 70), amount_source: "guessed" }
    const { error } = await cast.a.client.rpc("replace_food_entry_items", { p_entry_id: id, p_items: [item("toast", 80), bad] })
    expect(error).not.toBeNull()
    expect(await itemsOf(id)).toEqual([{ name: "egg", calories: 140, position: 0, flagged: true }])
  })

  it("refuses an empty item list", async () => {
    const id = await entryWithItems(cast.a)
    const { error } = await cast.a.client.rpc("replace_food_entry_items", { p_entry_id: id, p_items: [] })
    expect(error?.code).toBe("22023")
  })

  it("is not callable signed out", async () => {
    const id = await entryWithItems(cast.a)
    const { error } = await cast.anon.rpc("replace_food_entry_items", { p_entry_id: id, p_items: [item("x", 1)] })
    expect(error).not.toBeNull()
  })
})
