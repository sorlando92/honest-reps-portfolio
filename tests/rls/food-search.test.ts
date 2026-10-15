import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { chainIn, searchFoods } from "@/modules/nutrition/foods/search"
import { createCast, deleteCast, type Cast } from "./fixtures"

// Not an RLS suite: food search against the seeded curated chain items. USDA
// is switched off so the test never calls it; generic results come back empty.

let cast: Cast
beforeAll(async () => {
  vi.stubEnv("USDA_API_KEY", "")
  cast = await createCast()
})
afterAll(async () => {
  vi.unstubAllEnvs()
  await deleteCast(cast)
})

describe("chainIn", () => {
  it("finds a curated chain by any alias and strips it from the query", () => {
    expect(chainIn("Chick fil a nuggets")).toMatchObject({ chain: { chain: "Chick-fil-A" }, rest: "nuggets" })
    expect(chainIn("cfa nuggets").chain?.chain).toBe("Chick-fil-A")
    expect(chainIn("chicken breast")).toEqual({ chain: null, rest: "chicken breast" })
  })
})

describe("searchFoods", () => {
  it("returns the named chain's curated items with their published serving", async () => {
    const results = await searchFoods(cast.admin, "chick fil a nuggets")
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((r) => r.brand === "Chick-fil-A" && /nugget/i.test(r.name))).toBe(true)
    const plain = results.find((r) => r.name === "Chick-fil-A Nuggets")
    expect(plain?.serving).toMatchObject({ grams: 113 })
    expect(plain?.foodItemId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("returns nothing without USDA when no chain is named and nothing curated matches", async () => {
    expect(await searchFoods(cast.admin, "zzqx unobtainium")).toEqual([])
  })
})
