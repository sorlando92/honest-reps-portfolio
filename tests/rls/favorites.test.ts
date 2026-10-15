import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { CHECK_VIOLATION, createCast, deleteCast, PERMISSION_DENIED, type Cast, type TestUser } from "./fixtures"

let cast: Cast
beforeAll(async () => {
  cast = await createCast()
})
afterAll(async () => {
  await deleteCast(cast)
})

const items = [{ name: "egg", food_item_id: null, amount: 2, unit: "piece", grams: 100, amount_source: "measured", state: null, calories: 143, protein_g: 12.6, carbs_g: 0.7, fat_g: 9.5 }]

const favorite = (user: TestUser, title = "2 eggs") => user.client.from("favorites").insert({ user_id: user.id, title, items }).select("id").single()

describe("favorites RLS", () => {
  it("a user stars, reads and removes their own favorites", async () => {
    const { data, error } = await favorite(cast.a)
    expect(error).toBeNull()
    const read = await cast.a.client.from("favorites").select("title").eq("id", data!.id)
    expect(read.data).toEqual([{ title: "2 eggs" }])
    expect((await cast.a.client.from("favorites").delete().eq("id", data!.id)).error).toBeNull()
    expect((await cast.admin.from("favorites").select("id").eq("id", data!.id)).data).toEqual([])
  })

  it("a user cannot write a favorite for someone else", async () => {
    const { error } = await cast.a.client.from("favorites").insert({ user_id: cast.b.id, title: "x", items })
    expect(error?.code).toBe(PERMISSION_DENIED)
  })

  it("only the owner and the assigned coach read a favorite", async () => {
    const { data } = await favorite(cast.a, "coach can see")
    for (const user of [cast.b, cast.outsider, cast.otherCoach]) {
      expect((await user.client.from("favorites").select("id").eq("id", data!.id)).data).toEqual([])
    }
    expect((await cast.coach.client.from("favorites").select("id").eq("id", data!.id)).data).toEqual([{ id: data!.id }])
    expect((await cast.anon.from("favorites").select("id").eq("id", data!.id)).data ?? []).toEqual([])
  })

  it("others cannot delete it, and nobody can edit it", async () => {
    const { data } = await favorite(cast.a, "keep me")
    const del = await cast.coach.client.from("favorites").delete().eq("id", data!.id).select()
    expect(del.data ?? []).toEqual([])
    const upd = await cast.a.client.from("favorites").update({ title: "changed" }).eq("id", data!.id)
    expect(upd.error?.code).toBe(PERMISSION_DENIED)
  })

  it("needs a title and 1 to 30 items", async () => {
    expect((await cast.a.client.from("favorites").insert({ user_id: cast.a.id, title: "", items })).error?.code).toBe(CHECK_VIOLATION)
    expect((await cast.a.client.from("favorites").insert({ user_id: cast.a.id, title: "none", items: [] })).error?.code).toBe(CHECK_VIOLATION)
  })
})
