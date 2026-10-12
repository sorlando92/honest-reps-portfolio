import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createCast, deleteCast, PERMISSION_DENIED, type Cast } from "./fixtures"

let cast: Cast
beforeAll(async () => {
  cast = await createCast()
})
afterAll(async () => {
  await deleteCast(cast)
})

describe("nutrition_profiles RLS", () => {
  it("a user creates and updates their own row, including goal weight", async () => {
    const insert = await cast.a.client.from("nutrition_profiles").insert({ user_id: cast.a.id, goal: "lose_fat" })
    expect(insert.error).toBeNull()
    const update = await cast.a.client
      .from("nutrition_profiles")
      .update({ goal_weight_kg: 80 })
      .eq("user_id", cast.a.id)
      .select("goal_weight_kg")
    expect(update.data).toEqual([{ goal_weight_kg: 80 }])
  })

  it("a user cannot write another user's row", async () => {
    const insert = await cast.a.client.from("nutrition_profiles").insert({ user_id: cast.b.id })
    expect(insert.error?.code).toBe(PERMISSION_DENIED)
    const update = await cast.b.client.from("nutrition_profiles").update({ goal: "maintain" }).eq("user_id", cast.a.id).select()
    expect(update.data).toEqual([])
  })

  it("other users cannot read the row; the assigned coach can", async () => {
    for (const user of [cast.b, cast.outsider, cast.otherCoach]) {
      const { data } = await user.client.from("nutrition_profiles").select("user_id").eq("user_id", cast.a.id)
      expect(data).toEqual([])
    }
    const { data } = await cast.coach.client.from("nutrition_profiles").select("user_id").eq("user_id", cast.a.id)
    expect(data).toEqual([{ user_id: cast.a.id }])
  })

  it("rows cannot be deleted from the client", async () => {
    const { error } = await cast.a.client.from("nutrition_profiles").delete().eq("user_id", cast.a.id)
    expect(error?.code).toBe(PERMISSION_DENIED)
  })

  it("anonymous visitors read nothing", async () => {
    const { data, error } = await cast.anon.from("nutrition_profiles").select("user_id")
    expect(error?.code === PERMISSION_DENIED || (data ?? []).length === 0).toBe(true)
  })
})
