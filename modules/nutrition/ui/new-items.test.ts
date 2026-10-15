import { describe, expect, it } from "vitest"
import type { FoodResult } from "../foods/search"
import { weighed, withGrams, withServings } from "./amounts"
import { changedFood, fromManual, fromSearchResult } from "./new-items"

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
  portion: null,
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
  portion: null,
}

describe("fromSearchResult", () => {
  it("starts a generic food at its common portion, still estimated", () => {
    const banana: FoodResult = { ...usda, name: "Bananas, raw", state: null, per100g: { kcal: 89, protein_g: 1.1, carbs_g: 22.8, fat_g: 0.3 }, portion: { label: "1 medium", grams: 118 } }
    expect(fromSearchResult(banana)).toMatchObject({ grams: 118, calories: 105, amountSource: "estimated", flagReason: "amount" })
  })

  it("starts a generic food without a portion at 100 g, estimated, so the row asks to weigh it", () => {
    const item = fromSearchResult(usda)
    expect(item).toMatchObject({ grams: 100, calories: 165, proteinG: 31, amountSource: "estimated", flagReason: "amount", foodItemId: usda.foodItemId, state: "cooked" })
  })

  it("weighing it resolves Estimated and scales from the food", () => {
    const item = weighed(fromSearchResult(usda), 150)
    expect(item).toMatchObject({ grams: 150, calories: 248, proteinG: 46.5, amountSource: "weighed", flagReason: null })
  })

  it("starts a curated chain item at one published serving, as label, and steps in servings", () => {
    const item = fromSearchResult(curated)
    expect(item).toMatchObject({ quantity: 1, unit: "serving", grams: 113, calories: 250, proteinG: 27, amountSource: "label", flagReason: null })
    expect(withServings(item, 1.5)).toMatchObject({ quantity: 1.5, grams: 169.5, calories: 375, proteinG: 40.5 })
  })

  it("steps a serving published without a weight in servings, grams unknown", () => {
    const bagel: FoodResult = { ...curated, name: "Plain Bagel", per100g: {}, serving: { label: "1 Bagel", grams: null, kcal: 290, protein_g: 10, carbs_g: 58, fat_g: 1.5 } }
    const item = fromSearchResult(bagel)
    expect(item).toMatchObject({ quantity: 1, unit: "serving", grams: 0, calories: 290, amountSource: "label" })
    expect(withServings(item, 2)).toMatchObject({ quantity: 2, calories: 580, proteinG: 20 })
  })

  it("changing food to a chain item switches the row to servings, closest to its weight", () => {
    const chicken = weighed(fromSearchResult(usda), 230)
    expect(changedFood(chicken, curated)).toMatchObject({ quantity: 2, unit: "serving", grams: 226, calories: 500, amountSource: "label", flagReason: null })
  })

  it("changing a chain item to a generic food goes back to grams at the same weight", () => {
    const nuggets = withServings(fromSearchResult(curated), 2)
    expect(changedFood(nuggets, usda)).toMatchObject({ unit: "g", quantity: 226, grams: 226, calories: 373, serving: undefined })
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
