import { describe, expect, it } from "vitest"
import { mealFor, mealWindows } from "./meals"

const CHICAGO = "America/Chicago"
// Local Chicago time on Oct 14 (UTC minus 5 hours).
const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 9, 14, hour + 5, minute))

describe("mealFor", () => {
  it("files by the local time with the spec's windows", () => {
    expect(mealFor(at(3, 59), CHICAGO)).toBe("snack")
    expect(mealFor(at(4), CHICAGO)).toBe("breakfast")
    expect(mealFor(at(10, 59), CHICAGO)).toBe("breakfast")
    expect(mealFor(at(11), CHICAGO)).toBe("lunch")
    expect(mealFor(at(15, 59), CHICAGO)).toBe("lunch")
    expect(mealFor(at(16), CHICAGO)).toBe("dinner")
    expect(mealFor(at(21, 59), CHICAGO)).toBe("dinner")
    expect(mealFor(at(22), CHICAGO)).toBe("snack")
  })

  it("uses the user's timezone, not UTC: 11:30 PM Central is a snack", () => {
    expect(mealFor("2026-10-15T04:30:00Z", CHICAGO)).toBe("snack")
    expect(mealFor("2026-10-15T04:30:00Z", "UTC")).toBe("breakfast")
  })

  it("follows windows from app_config", () => {
    const early = mealWindows({ breakfast: [5, 10], lunch: [10, 14], dinner: [17, 21] })
    expect(mealFor(at(10, 30), CHICAGO, early)).toBe("lunch")
    expect(mealFor(at(15), CHICAGO, early)).toBe("snack")
  })
})

describe("mealWindows", () => {
  it("falls back to the defaults for missing or malformed values", () => {
    expect(mealWindows(null)).toEqual({ breakfast: [4, 11], lunch: [11, 16], dinner: [16, 22] })
    expect(mealWindows({ breakfast: [5, 10], lunch: "noon", dinner: [16, 99] })).toEqual({ breakfast: [5, 10], lunch: [11, 16], dinner: [16, 22] })
  })
})
