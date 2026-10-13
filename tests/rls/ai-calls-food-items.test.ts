import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createCast, deleteCast, PERMISSION_DENIED, type Cast } from "./fixtures"

let cast: Cast
beforeAll(async () => {
  cast = await createCast()
  const rows = [cast.a, cast.otherMember].map((u) => ({
    user_id: u.id,
    prompt_id: "P1",
    prompt_version: "test",
    model: "test-model",
    latency_ms: 1,
    outcome: "ok",
    validation: "passed",
  }))
  const { error } = await cast.admin.from("ai_calls").insert(rows)
  if (error) throw error
})
afterAll(async () => {
  await cast.admin.from("ai_calls").delete().eq("prompt_version", "test")
  await deleteCast(cast)
})

describe("ai_calls RLS", () => {
  it("the coach reads calls for assigned users only", async () => {
    const { data } = await cast.coach.client.from("ai_calls").select("user_id").eq("prompt_version", "test")
    expect(data?.map((r) => r.user_id)).toEqual([cast.a.id])
  })

  it("users cannot read calls, even their own", async () => {
    const { data } = await cast.a.client.from("ai_calls").select("id")
    expect(data).toEqual([])
  })

  it("nobody writes calls from the client", async () => {
    const row = { user_id: cast.a.id, prompt_id: "P1", prompt_version: "x", model: "m", latency_ms: 1, outcome: "ok", validation: "passed" }
    for (const client of [cast.a.client, cast.coach.client, cast.anon]) {
      const { error } = await client.from("ai_calls").insert(row)
      expect(error?.code).toBe(PERMISSION_DENIED)
    }
  })
})

describe("food_items RLS", () => {
  const sourceId = `test-${randomUUID()}`
  beforeAll(async () => {
    const { error } = await cast.admin.from("food_items").insert({
      source: "usda",
      source_id: sourceId,
      name: "Test food",
      per_100g: { kcal: 100, protein_g: 10, carbs_g: 10, fat_g: 2 },
    })
    if (error) throw error
  })
  afterAll(async () => {
    await cast.admin.from("food_items").delete().eq("source_id", sourceId)
  })

  it("every signed in user reads food items", async () => {
    for (const user of [cast.a, cast.outsider, cast.coach]) {
      const { data } = await user.client.from("food_items").select("name").eq("source_id", sourceId)
      expect(data).toEqual([{ name: "Test food" }])
    }
  })

  it("anonymous visitors cannot read food items", async () => {
    const { error } = await cast.anon.from("food_items").select("name").eq("source_id", sourceId)
    expect(error?.code).toBe(PERMISSION_DENIED)
  })

  it("nobody writes food items from the client", async () => {
    const insert = await cast.a.client
      .from("food_items")
      .insert({ source: "custom", source_id: "x", name: "x", per_100g: {} })
    expect(insert.error?.code).toBe(PERMISSION_DENIED)
    const update = await cast.coach.client.from("food_items").update({ name: "y" }).eq("source_id", sourceId)
    expect(update.error?.code).toBe(PERMISSION_DENIED)
  })
})
