import { describe, expect, it } from "vitest"
import { detailPortion, measurePortion } from "./usda"

describe("common portions", () => {
  it("takes FNDDS rank 1 and skips the survey default", () => {
    expect(
      measurePortion([
        { disseminationText: "1 cup, mashed", gramWeight: 225, rank: 4 },
        { disseminationText: "Quantity not specified", gramWeight: 45, rank: 0 },
        { disseminationText: "1 banana", gramWeight: 126, rank: 1 },
      ])
    ).toEqual({ label: "1 banana", grams: 126 })
    expect(measurePortion([])).toBeNull()
  })

  it("takes the lowest sequence SR Legacy portion and drops size notes and NLEA servings", () => {
    expect(
      detailPortion([
        { amount: 1, modifier: "NLEA serving", measureUnit: { name: "undetermined" }, gramWeight: 126, sequenceNumber: 0 },
        { amount: 1, modifier: "cup, sliced", measureUnit: { name: "undetermined" }, gramWeight: 150, sequenceNumber: 2 },
        { amount: 1, modifier: 'medium (7" to 7-7/8" long)', measureUnit: { name: "undetermined" }, gramWeight: 118, sequenceNumber: 1 },
      ])
    ).toEqual({ label: "1 medium", grams: 118 })
  })

  it("reads Foundation portions and skips RACC", () => {
    expect(
      detailPortion([
        { amount: 1, modifier: null, measureUnit: { name: "RACC" }, gramWeight: 140, sequenceNumber: 1 },
        { amount: 1, modifier: "Peeled", measureUnit: { name: "Banana" }, gramWeight: 115, sequenceNumber: 1 },
      ])
    ).toEqual({ label: "1 Banana Peeled", grams: 115 })
  })
})
