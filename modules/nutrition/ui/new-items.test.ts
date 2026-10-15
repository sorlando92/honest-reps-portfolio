import { describe, expect, it } from "vitest"
import type { FoodResult } from "../foods/search"
import { weighed, withGrams } from "./amounts"
import { fromManual, fromSearchResult, usableResults } from "./new-items"

const usda: FoodResult = {
  foodItemId: "11111111-1111-4111-8111-111111111111",
  source: "usda",
  sourceId: "171477",
  name: "Chicken, broilers or fryers, breast, meat only, cooked, roasted",
  brand: null,
  dataType: "SR Legacy",
  state: "cooked",
  per100g: { kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 },
  serving: null,
}

const curated: FoodResult = {
  foodItemId: "22222222-2222-4222-8222-222222222222",
  source: "custom",
  sourceId: "chick-fil-a:Chick-fil-A Nuggets (8 ct)",
  name: "Chick-fil-A Nuggets (8 ct)",
  brand: "Chick-fil-A",
  dataType: "Curated",
  state: null,
  per100g: { kcal: 230, protein_g: 24, carbs_g: 9, fat_g: 10.6 },
  serving: { label: "8 ct", grams: 113, kcal: 250, protein_g: 27, carbs_g: 11, fat_g: 11 },
}

describe("fromSearchResult", () => {
  it("starts a generic food at 100 g, estimated, so the row asks to weigh it", () => {
    const item = fromSearchResult(usda)
    expect(item).toMatchObject({ grams: 100, calories: 165, proteinG: 31, amountSource: "estimated", flagReason: "amount", foodItemId: usda.foodItemId, state: "cooked" })
  })

  it("weighing it resolves Estimated and scales from the food", () => {
    const item = weighed(fromSearchResult(usda), 150)
    expect(item).toMatchObject({ grams: 150, calories: 248, proteinG: 46.5, amountSource: "weighed", flagReason: null })
  })

  it("starts a curated chain item at its published serving, as label", () => {
    expect(fromSearchResult(curated)).toMatchObject({ quantity: 1, unit: "serving", grams: 113, calories: 250, proteinG: 27, amountSource: "label", flagReason: null })
  })

  it("leaves out curated servings that have no weight", () => {
    const noWeight: FoodResult = { ...curated, per100g: {}, serving: { ...curated.serving!, grams: null } }
    expect(usableResults([usda, curated, noWeight])).toEqual([usda, curated])
  })
})

describe("fromManual", () => {
  const item = fromManual({ name: " protein bar ", grams: 60, calories: 210, proteinG: 20, carbsG: 22, fatG: 7 })

  it("is weighed at the typed weight with the typed numbers", () => {
    expect(item).toMatchObject({ name: "protein bar", grams: 60, unit: "g", amountSource: "weighed", calories: 210, proteinG: 20, flagReason: null, match: null })
  })

  it("scales when the amount changes", () => {
    expect(withGrams(item, 30)).toMatchObject({ grams: 30, calories: 105, proteinG: 10 })
  })
})
