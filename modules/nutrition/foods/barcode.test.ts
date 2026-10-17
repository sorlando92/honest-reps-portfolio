import { describe, expect, it } from "vitest"
import { productFood, storedForms } from "./barcode"

describe("storedForms", () => {
  it("finds a product cached under its 12 or 13 digit form (Sean's Ascent scan)", () => {
    expect(storedForms("00815863022027")).toEqual(["00815863022027", "0815863022027", "815863022027"])
  })

  it("includes the 8 digit form of an EAN-8 and never a cut that is not a barcode length", () => {
    expect(storedForms("00000096385074")).toEqual(["00000096385074", "0000096385074", "000096385074", "96385074"])
    expect(storedForms("10815863022024")).toEqual(["10815863022024"])
  })
})

describe("productFood", () => {
  it("reads per 100 g and the label serving", () => {
    expect(
      productFood({
        product_name: "Greek Yogurt Plain",
        brands: "Fage, Total",
        serving_size: "1 container (170 g)",
        serving_quantity: "170",
        nutriments: { "energy-kcal_100g": 97, proteins_100g: 9, carbohydrates_100g: 3.9, fat_100g: 5, "energy-kcal_serving": 165 },
      })
    ).toEqual({
      name: "Greek Yogurt Plain",
      brand: "Fage",
      imageUrl: null,
      per100g: { kcal: 97, protein_g: 9, carbs_g: 3.9, fat_g: 5 },
      serving: { label: "1 container (170 g)", grams: 170, kcal: 165, protein_g: 15.3, carbs_g: 6.6, fat_g: 8.5 },
    })
  })

  it("converts kilojoules when calories are missing, and has no serving without one", () => {
    const food = productFood({ product_name: "Oats", nutriments: { energy_100g: 1569, proteins_100g: 13 } })
    expect(food?.per100g.kcal).toBeCloseTo(375, 0)
    expect(food?.serving).toBeNull()
  })

  it("is null without a name or calories", () => {
    expect(productFood({ product_name: "Mystery", nutriments: {} })).toBeNull()
    expect(productFood({ nutriments: { "energy-kcal_100g": 100 } })).toBeNull()
  })
})
