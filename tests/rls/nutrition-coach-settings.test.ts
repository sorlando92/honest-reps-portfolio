import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createCast, deleteCast, PERMISSION_DENIED, type Cast } from "./fixtures"

let cast: Cast
beforeAll(async () => {
  cast = await createCast()
  const { error } = await cast.admin
    .from("nutrition_coach_settings")
    .insert({ coach_id: cast.coach.id, hand_portions: { palm: { grams: 100 } } })
  if (error) throw error
})
afterAll(async () => {
  await deleteCast(cast)
})

describe("nutrition_coach_settings RLS", () => {
  it("the coach and their users read the row", async () => {
    for (const user of [cast.coach, cast.a, cast.b]) {
      const { data } = await user.client.from("nutrition_coach_settings").select("coach_id").eq("coach_id", cast.coach.id)
      expect(data).toEqual([{ coach_id: cast.coach.id }])
    }
  })

  it("other users and coaches do not", async () => {
    for (const user of [cast.outsider, cast.otherMember, cast.otherCoach]) {
      const { data } = await user.client.from("nutrition_coach_settings").select("coach_id").eq("coach_id", cast.coach.id)
      expect(data).toEqual([])
    }
  })

  it("only the coach updates their own row", async () => {
    const own = await cast.coach.client
      .from("nutrition_coach_settings")
      .update({ hand_portions: { palm: { grams: 110 } } })
      .eq("coach_id", cast.coach.id)
      .select("hand_portions")
    expect(own.data).toEqual([{ hand_portions: { palm: { grams: 110 } } }])

    for (const user of [cast.a, cast.otherCoach]) {
      const { data } = await user.client
        .from("nutrition_coach_settings")
        .update({ hand_portions: {} })
        .eq("coach_id", cast.coach.id)
        .select()
      expect(data).toEqual([])
    }
  })

  it("members cannot create a row and nobody deletes from the client", async () => {
    const insert = await cast.a.client.from("nutrition_coach_settings").insert({ coach_id: cast.a.id })
    expect(insert.error).not.toBeNull()
    const del = await cast.coach.client.from("nutrition_coach_settings").delete().eq("coach_id", cast.coach.id)
    expect(del.error?.code).toBe(PERMISSION_DENIED)
  })
})
