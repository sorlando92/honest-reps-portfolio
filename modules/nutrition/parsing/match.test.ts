import { describe, expect, it } from "vitest"
import { describedState, rank, rankMenu, searchText, stateOptions, wantedState } from "./match"

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

describe("rankMenu", () => {
  const menu = ["Chick-fil-A Nuggets", "8 ct Grilled Nuggets", "12 ct Chick-fil-A Nuggets", "Medium Waffle Potato Fries", "Large Waffle Potato Fries"]
    .map((name) => ({ name: name.replace("Chick-fil-A ", "") }))
  const top = (name: string, quantity = 1) => rankMenu({ name, quantity }, menu)[0].item.name

  it("matches the menu name the user's words cover", () => {
    expect(top("chicken nuggets", 8)).toBe("Nuggets")
    expect(top("chicken nuggets", 12)).toBe("12 ct Nuggets")
    expect(top("grilled nuggets", 8)).toBe("8 ct Grilled Nuggets")
    expect(top("waffle fries, large")).toBe("Large Waffle Potato Fries")
  })
})

describe("searchText", () => {
  it("never sends a slash, which FDC rejects", () => {
    expect(searchText("ground beef 93/7, cooked")).toBe("ground beef 93% lean, cooked")
    expect(searchText("90 / 10 beef")).toBe("90% lean beef")
    expect(searchText("salt/pepper")).toBe("salt pepper")
    expect(searchText("chicken (Chipotle)")).toBe("chicken")
  })
})

describe("menu sizes, brands and skin", () => {
  const menu = ["Pepperoni pizza, medium hand tossed, 1 slice", "Pepperoni pizza, large hand tossed, 1 slice", "Cheese pizza, large hand tossed, 1 slice"].map((name) => ({ name }))

  it("finds the item without its size words and picks the size from the meal text", () => {
    const top = rankMenu({ name: "pepperoni pizza", quantity: 2 }, menu, "2 slices of large pepperoni pizza from dominos")[0]
    expect(top.item.name).toBe("Pepperoni pizza, large hand tossed, 1 slice")
    expect(top.score).toBeGreaterThanOrEqual(0.5)
    expect(rankMenu({ name: "pepperoni pizza", quantity: 1 }, menu, "medium pepperoni pizza")[0].item.name).toContain("medium")
  })

  it("prefers the brand the user named", () => {
    const shakes = [
      { id: "1", description: "Beverages, SLIMFAST, Meal replacement, High Protein Shake, Ready-To-Drink", dataType: "SR Legacy", brand: null },
      { id: "2", description: "CORE POWER ELITE CHOCOLATE HIGH PROTEIN MILK SHAKE", dataType: "Branded", brand: "fairlife, LLC" },
    ]
    expect(rank({ name: "protein shake", brand: "Fairlife", state: null }, shakes)[0].candidate.id).toBe("2")
  })

  it("avoids skin on unless the user said skin", () => {
    const thighs = ["Chicken thigh, NS as to cooking method, skin eaten", "Chicken, broilers or fryers, thigh, meat only, cooked, roasted"]
    expect(best("chicken thigh", null, ...thighs)).toContain("meat only")
    expect(best("chicken thigh with skin", null, ...thighs)).toContain("skin eaten")
  })
})

describe("stateOptions", () => {
  it("gives meat and fish Raw and Cooked, grains and pasta also Dry, other foods none", () => {
    expect(stateOptions("chicken breast")).toEqual(["raw", "cooked"])
    expect(stateOptions("salmon")).toEqual(["raw", "cooked"])
    expect(stateOptions("white rice")).toEqual(["raw", "cooked", "dry"])
    expect(stateOptions("penne pasta")).toEqual(["raw", "cooked", "dry"])
    expect(stateOptions("banana")).toBeNull()
  })
})
