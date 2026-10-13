import { describe, expect, it } from "vitest"
import { DEFAULT_HAND_PORTIONS, handPortionFor, handPortionGrams } from "./hand"

const text = "a palm of chicken, a fist of broccoli, a cupped hand of rice, a thumb of butter"

describe("hand portions", () => {
  it("finds the hand portion named for each food", () => {
    expect(handPortionFor(text, "chicken breast")).toEqual({ kind: "palm", count: 1 })
    expect(handPortionFor(text, "broccoli")).toEqual({ kind: "fist", count: 1 })
    expect(handPortionFor(text, "white rice")).toEqual({ kind: "cupped_hand", count: 1 })
    expect(handPortionFor(text, "butter")).toEqual({ kind: "thumb", count: 1 })
    expect(handPortionFor("two palms of salmon", "salmon")).toEqual({ kind: "palm", count: 2 })
    expect(handPortionFor("handful of almonds", "almonds")).toEqual({ kind: "handful", count: 1 })
  })

  it("converts with the coach's settings", () => {
    const grams = (food: string) => handPortionGrams(handPortionFor(text, food)!, food, DEFAULT_HAND_PORTIONS)
    expect(grams("chicken breast")).toBe(100)
    expect(grams("white rice")).toBe(90)
    expect(grams("butter")).toBe(14)
    expect(grams("broccoli")).toBeNull()
    expect(handPortionGrams({ kind: "thumb", count: 1 }, "peanut butter", DEFAULT_HAND_PORTIONS)).toBe(16)
  })
})
