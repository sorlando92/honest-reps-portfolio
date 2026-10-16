import { describe, expect, it } from "vitest"
import { changePhrase, ewma, formatWeight, fromDisplay, trendAlpha, trendChange, LB_PER_KG } from "./trend"

describe("ewma", () => {
  it("starts at the first weigh-in and moves alpha of the way to each new one", () => {
    const points = ewma([
      { date: "2026-10-03", kg: 82 },
      { date: "2026-10-01", kg: 80 },
      { date: "2026-10-02", kg: 81 },
    ])
    expect(points.map((p) => p.date)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"])
    expect(points[0].trendKg).toBe(80)
    expect(points[1].trendKg).toBeCloseTo(80.1)
    expect(points[2].trendKg).toBeCloseTo(80.29)
  })

  it("reads alpha from app_config with a safe fallback", () => {
    expect(trendAlpha({ method: "ewma", alpha: 0.2 })).toBe(0.2)
    expect(trendAlpha({ alpha: 3 })).toBe(0.1)
    expect(trendAlpha(null)).toBe(0.1)
  })
})

describe("trendChange", () => {
  const points = ewma([
    { date: "2026-10-01", kg: 82 },
    { date: "2026-10-09", kg: 80 },
    { date: "2026-10-16", kg: 79 },
  ])

  it("compares with the trend a week earlier", () => {
    const result = trendChange(points, "2026-10-16", 7)!
    expect(result.trendKg).toBeCloseTo(points[2].trendKg)
    expect(result.changeKg).toBeCloseTo(points[2].trendKg - points[1].trendKg)
  })

  it("has no change without an earlier trend, and nothing without weigh-ins", () => {
    expect(trendChange(points, "2026-10-01", 7)!.changeKg).toBeNull()
    expect(trendChange(points, "2026-09-01", 7)).toBeNull()
  })
})

describe("display", () => {
  it("formats and converts units", () => {
    expect(formatWeight(82.736, "imperial")).toBe("182.4 lb")
    expect(formatWeight(82.736, "metric")).toBe("82.7 kg")
    expect(fromDisplay(182.4, "imperial")).toBeCloseTo(182.4 / LB_PER_KG)
  })

  it("says down, up or no change", () => {
    expect(changePhrase(-0.6 / LB_PER_KG, "imperial", "this week")).toBe("down 0.6 this week")
    expect(changePhrase(0.6 / LB_PER_KG, "imperial", "in 30 days")).toBe("up 0.6 in 30 days")
    expect(changePhrase(0.1 / LB_PER_KG, "imperial", "this week")).toBe("no change this week")
    expect(changePhrase(-0.05, "metric", "this week")).toBe("no change this week")
  })
})
