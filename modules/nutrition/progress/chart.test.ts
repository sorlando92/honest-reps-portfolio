import { describe, expect, it } from "vitest"
import { LB_PER_KG } from "../weight/trend"
import { barSegments, defaultSelected, gridlines, rangeChangeKg, rangeChangeText, weekLabel, weightBounds, yMax } from "./chart"
import type { DayTotals } from "../days/week"

const day = (date: string, calories: number, target: number | null = 2000): DayTotals => ({
  date,
  logged: calories > 0,
  calories,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  items: 0,
  weighedItems: 0,
  target: target === null ? null : { calories: target, proteinG: 150, carbsG: 200, fatG: 70 },
  adherent: null,
  proteinHit: null,
  weightKg: null,
})

describe("barSegments", () => {
  it("adds a neutral remainder when calories exceed the macro sum", () => {
    expect(barSegments({ calories: 2000, proteinG: 150, carbsG: 200, fatG: 60 })).toEqual({ protein: 600, carbs: 800, fat: 540, other: 60 })
  })

  it("scales the segments to the bar when the macro sum is higher", () => {
    const s = barSegments({ calories: 1000, proteinG: 100, carbsG: 100, fatG: 44.444 })
    expect(s.protein + s.carbs + s.fat).toBeCloseTo(1000)
    expect(s.other).toBe(0)
  })

  it("is all remainder with no macros", () => {
    expect(barSegments({ calories: 300, proteinG: 0, carbsG: 0, fatG: 0 }).other).toBe(300)
  })
})

describe("axis", () => {
  it("tops out 10% over the highest bar or target", () => {
    expect(yMax([day("2026-10-12", 2500), day("2026-10-13", 0, 2100)])).toBeCloseTo(2750)
    expect(yMax([day("2026-10-12", 0, null)])).toBe(2000)
  })

  it("draws 3 gridlines", () => {
    expect(gridlines(2750)).toEqual([1000, 2000])
    expect(gridlines(2200)).toEqual([500, 1000, 1500])
  })
})

describe("weeks", () => {
  const week = ["12", "13", "14", "15", "16", "17", "18"].map((d) => day(`2026-10-${d}`, 0))
  it("selects today in the current week and Sunday in past weeks", () => {
    expect(defaultSelected("2026-10-12", week, "2026-10-16")).toBe("2026-10-16")
    expect(defaultSelected("2026-10-12", week, "2026-10-25")).toBe("2026-10-18")
  })

  it("labels the week", () => {
    expect(weekLabel("2026-10-12", "2026-10-16", "2026-10-18")).toBe("This week")
    expect(weekLabel("2026-10-06", "2026-10-16", "2026-10-12")).toBe("Oct 6 to Oct 12")
  })
})

describe("weight change", () => {
  it("phrases the change over the range", () => {
    expect(rangeChangeText(-1.4 / LB_PER_KG, "imperial", 30)).toBe("Down 1.4 lb in 30 days")
    expect(rangeChangeText(0.6 / LB_PER_KG, "imperial", 30)).toBe("Up 0.6 lb in 30 days")
    expect(rangeChangeText(0.1 / LB_PER_KG, "imperial", 30)).toBe("No change in 30 days")
    expect(rangeChangeText(-0.5, "metric", 7)).toBe("Down 0.5 kg in 7 days")
  })

  it("compares with the trend before the range, else the first in range", () => {
    const points = [
      { date: "2026-10-01", kg: 82, trendKg: 82 },
      { date: "2026-10-10", kg: 80, trendKg: 81.5 },
    ]
    expect(rangeChangeKg({ rangeDays: 30, points, trendBeforeKg: 83, goalKg: null })).toBeCloseTo(-1.5)
    expect(rangeChangeKg({ rangeDays: 30, points, trendBeforeKg: null, goalKg: null })).toBeCloseTo(-0.5)
    expect(rangeChangeKg({ rangeDays: 30, points: points.slice(0, 1), trendBeforeKg: null, goalKg: null })).toBeNull()
  })

  it("pads the axis 2 lb or 1 kg", () => {
    expect(weightBounds([80, 81], "metric")).toEqual([79, 82])
    const [lo, hi] = weightBounds([80, 81], "imperial")
    expect((80 - lo) * LB_PER_KG).toBeCloseTo(2)
    expect((hi - 81) * LB_PER_KG).toBeCloseTo(2)
  })
})
