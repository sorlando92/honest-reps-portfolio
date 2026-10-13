import { describe, expect, it } from "vitest"
import { describedState, rank, wantedState } from "./match"

const foods = (...descriptions: string[]) =>
  descriptions.map((description, i) => ({ id: String(i), description, dataType: "SR Legacy", brand: null }))
const best = (name: string, state: "raw" | "cooked" | "dry" | null, ...descriptions: string[]) =>
  rank({ name, brand: null, state }, foods(...descriptions))[0].candidate.description

// Each case is a wrong match the first eval run produced (2026-10-13).
describe("rank", () => {
  it("prefers the food itself over a food named after it", () => {
    expect(best("egg", null, "Bagels, egg", "Egg, whole, cooked, scrambled")).toBe("Egg, whole, cooked, scrambled")
    expect(best("oatmeal", null, "Bread, oatmeal, toasted", "Cereals, oats, regular and quick, cooked with water")).toBe(
      "Cereals, oats, regular and quick, cooked with water"
    )
    expect(best("jasmine rice", "cooked", "Rice noodles, cooked", "Rice, white, long-grain, regular, cooked")).toBe(
      "Rice, white, long-grain, regular, cooked"
    )
  })

  it("avoids breaded, fried and unusual variants the user did not ask for", () => {
    expect(
      best("chicken breast", null, "Chicken breast tenders, breaded, cooked, microwaved", "Chicken, broilers or fryers, breast, meat only, cooked, roasted")
    ).toBe("Chicken, broilers or fryers, breast, meat only, cooked, roasted")
    expect(best("butter", null, "Butter, Clarified butter (ghee)", "Butter, salted")).toBe("Butter, salted")
    expect(best("egg", null, "Egg, whole, dried", "Egg, whole, cooked, hard-boiled")).toBe("Egg, whole, cooked, hard-boiled")
    expect(best("whole wheat toast", null, "Crackers, melba toast, wheat", "Bread, whole-wheat, commercially prepared, toasted")).toBe(
      "Bread, whole-wheat, commercially prepared, toasted"
    )
  })

  it("matches the stated state and defaults stateful foods to cooked", () => {
    expect(best("penne pasta", "dry", "Pasta, cooked, enriched", "Pasta, dry, enriched")).toBe("Pasta, dry, enriched")
    expect(best("ground beef 93% lean", null, "Beef, ground, 93% lean meat / 7% fat, raw", "Beef, ground, 93% lean meat / 7% fat, crumbles, cooked, pan-browned")).toContain("cooked")
  })
})

describe("state", () => {
  it("reads raw, cooked and dry from descriptions", () => {
    expect(describedState("Pasta, dry, enriched", "penne")).toBe("dry")
    expect(describedState("Beef, ground, raw", "ground beef")).toBe("raw")
    expect(describedState("Fish, salmon, Atlantic, farmed, cooked, dry heat", "salmon")).toBe("cooked")
  })

  it("defaults only foods whose calories depend on it", () => {
    expect(wantedState("chicken thigh", null)).toBe("cooked")
    expect(wantedState("almonds", null)).toBeNull()
    // USDA "raw" beans are dry beans, about 2.5 times the calories of cooked.
    expect(wantedState("black beans", null)).toBe("cooked")
    expect(wantedState("penne", "dry")).toBe("dry")
  })
})
