import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createCast, deleteCast, PERMISSION_DENIED, type Cast, type TestUser } from "./fixtures"

let cast: Cast
beforeAll(async () => {
  cast = await createCast()
})
afterAll(async () => {
  await deleteCast(cast)
})

async function entryFor(user: TestUser) {
  const { data, error } = await user.client
    .from("food_entries")
    .insert({
      user_id: user.id,
      logged_at: new Date().toISOString(),
      method: "text",
      raw_input: "2 eggs",
      model_output: { items: [] },
      confidence: 0.9,
      client_uuid: randomUUID(),
    })
    .select("id")
    .single()
  if (error) throw error
  return data.id as string
}

const item = (entryId: string, userId: string) => ({
  entry_id: entryId,
  user_id: userId,
  name: "egg",
  amount: 2,
  unit: "piece",
  grams: 100,
  amount_source: "measured",
  calories: 143,
  protein_g: 12.6,
  carbs_g: 0.7,
  fat_g: 9.5,
})

describe("food_entries and food_entry_items RLS", () => {
  it("a user writes, reads and deletes their own entries and items", async () => {
    const id = await entryFor(cast.a)
    expect((await cast.a.client.from("food_entry_items").insert(item(id, cast.a.id))).error).toBeNull()
    const { data } = await cast.a.client.from("food_entries").select("id, food_entry_items(name)").eq("id", id).single()
    expect(data?.food_entry_items).toEqual([{ name: "egg" }])
    expect((await cast.a.client.from("food_entries").delete().eq("id", id)).error).toBeNull()
    const gone = await cast.admin.from("food_entry_items").select("id").eq("entry_id", id)
    expect(gone.data).toEqual([])
  })

  it("the coach reads assigned users' entries, nobody else does", async () => {
    const id = await entryFor(cast.a)
    await cast.a.client.from("food_entry_items").insert(item(id, cast.a.id))
    const coach = await cast.coach.client.from("food_entry_items").select("entry_id").eq("entry_id", id)
    expect(coach.data).toHaveLength(1)
    for (const user of [cast.b, cast.outsider, cast.otherCoach]) {
      const { data } = await user.client.from("food_entries").select("id").eq("id", id)
      expect(data).toEqual([])
    }
  })

  it("nobody writes entries or items for someone else", async () => {
    const insert = await cast.b.client
      .from("food_entries")
      .insert({ user_id: cast.a.id, logged_at: new Date().toISOString(), method: "text", client_uuid: randomUUID() })
    expect(insert.error?.code).toBe(PERMISSION_DENIED)

    // An item pointing at someone else's entry is refused, even as your own row.
    const theirs = await entryFor(cast.a)
    const sneaky = await cast.b.client.from("food_entry_items").insert(item(theirs, cast.b.id))
    expect(sneaky.error?.code).toBe(PERMISSION_DENIED)

    const coachEdit = await cast.coach.client.from("food_entries").update({ meal_tag: "lunch" }).eq("id", theirs).select()
    expect(coachEdit.data).toEqual([])
  })

  it("the audit trail cannot be edited, but the time and meal tag can", async () => {
    const id = await entryFor(cast.a)
    const audit = await cast.a.client.from("food_entries").update({ raw_input: "edited" }).eq("id", id)
    expect(audit.error?.code).toBe(PERMISSION_DENIED)
    const tag = await cast.a.client.from("food_entries").update({ meal_tag: "breakfast" }).eq("id", id).select("meal_tag")
    expect(tag.data).toEqual([{ meal_tag: "breakfast" }])
  })

  it("an offline entry synced twice is saved once", async () => {
    const client_uuid = randomUUID()
    const row = { user_id: cast.a.id, logged_at: new Date().toISOString(), method: "quick_add", client_uuid }
    expect((await cast.a.client.from("food_entries").insert(row)).error).toBeNull()
    expect((await cast.a.client.from("food_entries").insert(row)).error?.code).toBe("23505")
  })

  it("anonymous visitors see nothing", async () => {
    const { error } = await cast.anon.from("food_entries").select("id")
    expect(error?.code).toBe(PERMISSION_DENIED)
  })
})
