import { describe, expect, it } from "vitest"
import { entryTitle } from "./today"

const items = [{ name: "protein milk" }, { name: "peanut butter chocolate whey protein powder" }]

describe("entryTitle", () => {
  it("uses the user's raw input instead of joined item names", () => {
    expect(entryTitle("protein shake with PB whey", items)).toBe("protein shake with PB whey")
  })

  it("keeps one line with whitespace collapsed", () => {
    expect(entryTitle("\n  oats   and berries \n coffee", items)).toBe("oats and berries")
  })

  it("falls back to item names without typed input", () => {
    expect(entryTitle(null, items)).toBe("protein milk, peanut butter chocolate whey protein powder")
    expect(entryTitle("   ", items)).toBe("protein milk, peanut butter chocolate whey protein powder")
  })
})
