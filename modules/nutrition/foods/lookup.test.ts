import { describe, expect, it } from "vitest"
import { customFoodColumns, servingLabelOf } from "./custom"
import { servingText, toSections, type IndexRow } from "./hits"
import { brandedServing, qualityIssue, tidyCase } from "./label"
import { nextRead, START } from "./reads"

const UPC = "815863022027"

describe("two identical valid reads (FOOD_LOOKUP_SPEC 3, acceptance 4)", () => {
  it("looks up only after the same valid read twice in a row", () => {
    const one = nextRead(START, UPC, "upc_a")
    expect(one.confirmed).toBeNull()
    const two = nextRead(one.state, `0${UPC}`, "ean_13")
    expect(two.confirmed).toMatchObject({ gtin: "00815863022027" })
    expect(two.state.reads).toBe(2)
  })

  it("ignores a misread and starts over", () => {
    let s = nextRead(START, UPC, "upc_a").state
    const bad = nextRead(s, "815863022028", "upc_a")
    expect(bad.confirmed).toBeNull()
    s = nextRead(bad.state, UPC, "upc_a").state
    expect(s.reads).toBe(3)
    expect(nextRead(s, UPC, "upc_a").confirmed).not.toBeNull()
  })

  it("never confirms two different products", () => {
    const s = nextRead(START, UPC, "upc_a").state
    expect(nextRead(s, "0894700010045", "ean_13").confirmed).toBeNull()
  })
})

describe("label foods", () => {
  it("tidies FDC capitals", () => {
    expect(tidyCase("NATIVE FUEL WHEY, CHOCOLATE")).toBe("Native Fuel Whey, Chocolate")
    expect(tidyCase("Greek Yogurt")).toBe("Greek Yogurt")
    expect(tidyCase("HICKORY BBQ CHIPS")).toBe("Hickory BBQ Chips")
  })

  it("builds the label serving, dropping cut off household text", () => {
    const per = { kcal: 382, protein_g: 73.5, carbs_g: 8.8, fat_g: 4.4 }
    expect(brandedServing(per, 34, "g", "1 SCOOP")).toEqual({ label: "1 scoop (34 g)", grams: 34, kcal: 129.9, protein_g: 25, carbs_g: 3, fat_g: 1.5 })
    expect(brandedServing(per, 31, "g", "1 PO")?.label).toBe("31 g")
    expect(brandedServing(per, null, "g", "1 SCOOP")).toBeNull()
    expect(brandedServing(per, 30, null, null)).toBeNull()
  })

  it("flags a missing serving and calories more than 20% off the macros (acceptance 7)", () => {
    expect(qualityIssue({ grams: 34, kcal: 130, protein_g: 25, carbs_g: 3, fat_g: 1.5 })).toBeNull()
    expect(qualityIssue({ grams: 34, kcal: 200, protein_g: 25, carbs_g: 3, fat_g: 1.5 })).toBe("calories_mismatch")
    expect(qualityIssue({ grams: 34, kcal: 100, protein_g: 25, carbs_g: 3, fat_g: 1.5 })).toBe("calories_mismatch")
    expect(qualityIssue({ grams: null, kcal: 130, protein_g: 25, carbs_g: 3, fat_g: 1.5 })).toBe("no_serving")
    expect(qualityIssue(null)).toBe("no_serving")
    expect(qualityIssue({ grams: 355, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })).toBeNull()
  })

  it("adds grams to a serving only when the label does not show them", () => {
    expect(servingText({ label: "1 scoop", grams: 31 })).toBe("1 scoop (31 g)")
    expect(servingText({ label: "1 container (170 g)", grams: 170 })).toBe("1 container (170 g)")
    expect(servingText({ label: "1 bottle (325 ml)", grams: 325 })).toBe("1 bottle (325 ml)")
  })
})

describe("custom foods", () => {
  const input = { name: "Bar", brand: null, gtin: UPC, servingLabel: "1 bar", servingSize: 2, servingUnit: "oz" as const, calories: 210, proteinG: 20, carbsG: 22, fatG: 7 }

  it("stores the serving as entered, per 100 g from it, and the canonical GTIN", () => {
    expect(customFoodColumns(input)).toEqual({
      name: "Bar",
      brand: null,
      barcode: "00815863022027",
      serving: { label: "1 bar (2 oz)", grams: 56.7, kcal: 210, protein_g: 20, carbs_g: 22, fat_g: 7 },
      per_100g: { kcal: 370.4, protein_g: 35.3, carbs_g: 38.8, fat_g: 12.3 },
    })
    expect(servingLabelOf({ servingLabel: null, servingSize: 34, servingUnit: "g" })).toBe("34 g")
  })

  it("refuses a barcode that fails its check digit", () => {
    expect(customFoodColumns({ ...input, gtin: "815863022028" })).toBeNull()
    expect(customFoodColumns({ ...input, gtin: null })?.barcode).toBeNull()
  })
})

describe("search rows", () => {
  const row = (over: Partial<IndexRow>): IndexRow => ({
    section: "brands",
    ref: "fdc:1",
    source: "fdc",
    source_id: "1",
    state: null,
    barcode: null,
    image_url: null,
    food_item_id: null,
    fdc_id: 1,
    name: "CHOCOLATE WHEY PROTEIN POWDER BLEND, CHOCOLATE",
    brand: "ASCENT",
    data_type: "Branded",
    per_100g: { kcal: 382, protein_g: 73.5, carbs_g: 8.8, fat_g: 4.4 },
    serving: null,
    serving_size: "34",
    serving_unit: "g",
    household_serving: "1 SCOOP",
    portions: null,
    favorite_items: null,
    score: 1,
    ...over,
  })

  it("shows name, brand, serving and calories per serving; FDC rows are resolved on tap", () => {
    const { brands } = toSections([row({})])
    expect(brands[0]).toMatchObject({ name: "Chocolate Whey Protein Powder Blend, Chocolate", brand: "Ascent", servingLabel: "1 scoop (34 g)", kcal: 130, food: null })
  })

  it("uses the common portion for generic foods, else 100 g", () => {
    const { basic } = toSections([
      row({ section: "basic", data_type: "SR Legacy", brand: null, name: "Bananas, raw", per_100g: { kcal: 89 }, portions: [{ label: "1 medium", grams: 118 }] }),
      row({ section: "basic", data_type: "SR Legacy", brand: null, name: "Oil", per_100g: { kcal: 884 } }),
    ])
    expect(basic.map((h) => [h.servingLabel, h.kcal])).toEqual([
      ["1 medium (118 g)", 105],
      ["100 g", 884],
    ])
  })

  it("food_items rows are ready to add", () => {
    const { mine } = toSections([
      row({ section: "mine", ref: "item:abc", source: "user", source_id: "abc", food_item_id: "abc", data_type: "Custom food", name: "Shake", brand: null, serving: { label: "1 bottle (325 ml)", grams: 325, kcal: 160, protein_g: 30, carbs_g: 5, fat_g: 2.5 } }),
    ])
    expect(mine[0]).toMatchObject({ servingLabel: "1 bottle (325 ml)", kcal: 160, food: { foodItemId: "abc", source: "user", serving: { kcal: 160 } } })
  })
})
