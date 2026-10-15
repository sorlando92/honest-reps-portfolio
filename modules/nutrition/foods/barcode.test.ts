import { describe, expect, it } from "vitest"
import { normalizeBarcode, productFood } from "./barcode"

describe("normalizeBarcode", () => {
  it("keeps 8 to 14 digits and drops spaces and dashes", () => {
    expect(normalizeBarcode("0 49000 05010 3")).toBe("049000050103")
    expect(normalizeBarcode("1234567")).toBeNull()
    expect(normalizeBarcode("123456789012345")).toBeNull()
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
