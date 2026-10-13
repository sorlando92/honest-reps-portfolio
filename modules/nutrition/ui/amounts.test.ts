import { describe, expect, it } from "vitest"
import type { DraftItem } from "../parsing/service"
import { fromUnit, swapped, toUnit, totals, weighed, withGrams } from "./amounts"

const rice: DraftItem = {
  name: "white rice",
  brand: null,
  quantity: 1,
  unit: "cup",
  grams: 158,
  amountSource: "estimated",
  state: "cooked",
  confidence: 0.6,
  match: { source: "usda", sourceId: "1", name: "Rice, white, cooked", brand: null, dataType: "SR Legacy", state: "cooked", per100g: { kcal: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3 } },
  matchScore: 0.9,
  calories: 205,
  proteinG: 4.3,
  carbsG: 44.2,
  fatG: 0.5,
  flagged: true,
  flagReason: "amount",
  alternatives: [],
  foodItemId: "a",
}

describe("amounts", () => {
  it("converts grams and ounces", () => {
    expect(toUnit(170, "oz")).toBe(6)
    expect(Math.round(fromUnit(6, "oz"))).toBe(170)
  })

  it("recalculates from the matched food per 100 g", () => {
    expect(withGrams(rice, 200)).toMatchObject({ grams: 200, calories: 260, proteinG: 5.4, carbsG: 56 })
  })

  it("scales an item with no per 100 g values", () => {
    const servingOnly = { ...rice, match: null }
    expect(withGrams(servingOnly, 316).calories).toBe(410)
  })

  it("weighing resolves an estimated amount", () => {
    const w = weighed(rice, 180)
    expect(w).toMatchObject({ amountSource: "weighed", unit: "g", quantity: 180, flagged: false, flagReason: null })
  })

  it("weighing keeps an uncertain food match flagged", () => {
    expect(weighed({ ...rice, flagReason: "match" }, 180)).toMatchObject({ flagged: true, flagReason: "match" })
  })

  it("swapping resolves an uncertain match and keeps the old match as an alternative", () => {
    const other = { ...rice.match!, sourceId: "2", name: "Rice, brown, cooked", per100g: { kcal: 123, protein_g: 2.7, carbs_g: 25.6, fat_g: 1 }, foodItemId: "b" }
    const s = swapped({ ...rice, amountSource: "measured", flagReason: "match" }, other)
    expect(s).toMatchObject({ name: "white rice", flagged: false, flagReason: null, foodItemId: "b", calories: 194 })
    expect(s.match?.name).toBe("Rice, brown, cooked")
    expect(s.alternatives.map((a) => a.sourceId)).toEqual(["1"])
  })

  it("adds up calories and protein", () => {
    expect(totals([rice, rice])).toEqual({ calories: 410, proteinG: 8.6 })
  })
})
