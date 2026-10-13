import { describe, expect, it } from "vitest"
import { casePassed, scoreCase, type EvalCase, type ReturnedItem } from "./scoring"

const item = (over: Partial<ReturnedItem>): ReturnedItem => ({
  name: "x",
  matchName: null,
  grams: 100,
  amountSource: "measured",
  state: null,
  flagged: false,
  calories: 0,
  ...over,
})

const pasta: EvalCase = {
  id: "t1",
  split: "dev",
  input: "weighed my pasta dry, 85g penne, plus 1/2 cup marinara",
  units: "imperial",
  expected_items: [
    { name: "penne pasta, dry", aliases: ["pasta", "penne"], grams: [83, 87], amount_source: "weighed", state: "dry" },
    { name: "marinara sauce", aliases: ["pasta sauce"], grams: [115, 135], amount_source: "measured" },
  ],
  must_not_include: [],
  expect_flagged: [],
  meal_kcal: [360, 420],
}

describe("scoreCase", () => {
  it("passes a correct parse", () => {
    const t = scoreCase(pasta, [
      item({ name: "penne", matchName: "Pasta, dry, enriched", grams: 85, amountSource: "weighed", state: "dry", calories: 315 }),
      item({ name: "marinara sauce", grams: 125, calories: 60 }),
    ])
    expect(casePassed(t)).toBe(true)
    expect(t.weighed_grams).toEqual({ pass: 1, total: 1 })
    expect(t.state).toEqual({ pass: 1, total: 1 })
  })

  it("fails the dry pasta trap when cooked pasta is matched", () => {
    const t = scoreCase(pasta, [
      item({ name: "penne", grams: 85, amountSource: "weighed", state: "cooked", calories: 134 }),
      item({ name: "marinara sauce", grams: 125, calories: 60 }),
    ])
    expect(t.state.pass).toBe(0)
    expect(t.meal_kcal.pass).toBe(0)
  })

  it("weighed grams must be within 3 percent of the stated weight", () => {
    const t = scoreCase(pasta, [item({ name: "penne", grams: 90, amountSource: "weighed", state: "dry" })])
    expect(t.weighed_grams.pass).toBe(0)
  })

  it("treats any item as invented for the negative case", () => {
    const negative: EvalCase = { ...pasta, expected_items: [], must_not_include: ["*"], meal_kcal: [0, 0] }
    expect(scoreCase(negative, []).no_invented_foods).toEqual({ pass: 1, total: 1 })
    expect(scoreCase(negative, [item({ name: "toast" })]).no_invented_foods.pass).toBe(0)
  })

  it("catches a modifier that was ignored", () => {
    const bowl: EvalCase = { ...pasta, expected_items: [], must_not_include: ["rice"] }
    expect(scoreCase(bowl, [item({ name: "white rice, cooked" })]).no_invented_foods.pass).toBe(0)
  })

  it("accepts a decomposed dish when every part is present", () => {
    const sandwich: EvalCase = {
      ...pasta,
      expected_items: [{ name: "turkey sandwich", aliases: [], grams: [140, 260], amount_source: "estimated", decomposed_ok: ["bread", "turkey"] }],
    }
    const t = scoreCase(sandwich, [item({ name: "whole wheat bread" }), item({ name: "deli turkey" })])
    expect(t.item_recall).toEqual({ pass: 1, total: 1 })
  })

  it("checks flags both ways", () => {
    const toast: EvalCase = {
      ...pasta,
      expected_items: [
        { name: "butter", aliases: [], grams: [4, 15], amount_source: "estimated" },
        { name: "toast", aliases: [], grams: [50, 70], amount_source: "measured" },
      ],
      expect_flagged: ["butter"],
    }
    const t = scoreCase(toast, [item({ name: "butter", flagged: true }), item({ name: "toast", flagged: true })])
    expect(t.flag_calibration).toEqual({ pass: 1, total: 2 })
  })
})
