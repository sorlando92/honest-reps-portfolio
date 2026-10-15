import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createCast, deleteCast, PERMISSION_DENIED, type Cast } from "./fixtures"

let cast: Cast
const ID = 999_999_901
const row = {
  fdc_id: ID,
  data_type: "SR Legacy",
  description: "Zzqx test grain, cooked",
  per_100g: { kcal: 120, protein_g: 4, carbs_g: 25, fat_g: 1 },
  portions: [{ label: "1 cup", grams: 160 }],
  release: "test",
}

beforeAll(async () => {
  cast = await createCast()
  const { error } = await cast.admin.from("fdc_foods").upsert(row)
  if (error) throw error
})
afterAll(async () => {
  await cast.admin.from("fdc_foods").delete().eq("fdc_id", ID)
  await deleteCast(cast)
})

describe("fdc_foods RLS and search_fdc", () => {
  it("signed in users read rows and search them", async () => {
    const read = await cast.a.client.from("fdc_foods").select("description").eq("fdc_id", ID)
    expect(read.data).toEqual([{ description: row.description }])
    const { data, error } = await cast.a.client.rpc("search_fdc", { p_query: "zzqx grains", p_limit: 5 })
    expect(error).toBeNull()
    expect((data as { fdc_id: number }[]).map((r) => r.fdc_id)).toContain(ID)
  })

  it("matches foods sharing any word, not all of them", async () => {
    const { data } = await cast.a.client.rpc("search_fdc", { p_query: "zzqx qqblorp", p_limit: 5 })
    expect((data as { fdc_id: number }[]).map((r) => r.fdc_id)).toContain(ID)
  })

  it("signed out visitors read and search nothing", async () => {
    const read = await cast.anon.from("fdc_foods").select("fdc_id").eq("fdc_id", ID)
    expect(read.data ?? []).toEqual([])
    const search = await cast.anon.rpc("search_fdc", { p_query: "zzqx", p_limit: 5 })
    expect(search.error).not.toBeNull()
  })

  it("nobody but the server writes", async () => {
    for (const user of [cast.a, cast.coach]) {
      expect((await user.client.from("fdc_foods").insert({ ...row, fdc_id: ID + 1 })).error?.code).toBe(PERMISSION_DENIED)
      expect((await user.client.from("fdc_foods").update({ description: "x" }).eq("fdc_id", ID)).error?.code).toBe(PERMISSION_DENIED)
      expect((await user.client.from("fdc_foods").delete().eq("fdc_id", ID)).error?.code).toBe(PERMISSION_DENIED)
    }
  })

  it("an empty or stop word query returns nothing instead of failing", async () => {
    const { data, error } = await cast.a.client.rpc("search_fdc", { p_query: "the and", p_limit: 5 })
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})
