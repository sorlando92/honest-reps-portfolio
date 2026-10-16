import { describe, expect, it } from "vitest"
import { daysBetween, fill, insightText, shortDate, weekDates, weekInsight, weekStart, type DayTotals } from "./week"

function day(date: string, over: Partial<DayTotals> = {}): DayTotals {
  return {
    date,
    logged: false,
    calories: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    items: 0,
    weighedItems: 0,
    target: { calories: 2100, proteinG: 158, carbsG: 200, fatG: 70 },
    adherent: false,
    proteinHit: false,
    weightKg: null,
    ...over,
  }
}

describe("weeks", () => {
  it("starts on Monday", () => {
    expect(weekStart("2026-10-16")).toBe("2026-10-12") // Friday
    expect(weekStart("2026-10-12")).toBe("2026-10-12") // Monday
    expect(weekStart("2026-10-18")).toBe("2026-10-12") // Sunday
    expect(weekStart("2026-11-01")).toBe("2026-10-26") // across a month
  })

  it("lists 7 dates and counts days", () => {
    expect(weekDates("2026-10-26")).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"])
    expect(daysBetween("2026-10-16", "2026-10-12")).toBe(-4)
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2)
  })

  it("formats short dates", () => {
    expect(shortDate("2026-10-15")).toBe("Thu, Oct 15")
  })
})

describe("weekInsight", () => {
  const week = weekDates("2026-10-12").map((date, i) =>
    day(date, i < 6 ? { logged: true, adherent: i !== 2 && i !== 4, proteinHit: i !== 3 } : {})
  )

  it("counts Monday through the selected day", () => {
    const insight = weekInsight(week, "2026-10-17")!
    expect(insight).toEqual({ elapsed: 6, logged: 6, onTarget: 4, proteinDays: 5 })
    expect(insightText(insight)).toBe("This week: 4 of 6 days on target. Protein 5 of 6.")
    expect(weekInsight(week, "2026-10-13")).toEqual({ elapsed: 2, logged: 2, onTarget: 2, proteinDays: 2 })
  })

  it("is hidden until something is logged", () => {
    expect(weekInsight(weekDates("2026-10-12").map((d) => day(d)), "2026-10-18")).toBeNull()
  })

  it("leaves out on target counts before targets exist (Q59)", () => {
    const noTargets = week.map((d) => ({ ...d, target: null, adherent: null, proteinHit: null }))
    const insight = weekInsight(noTargets, "2026-10-14")!
    expect(insight.onTarget).toBeNull()
    expect(insightText(insight)).toBe("This week: 3 of 3 days logged.")
  })
})

describe("fill", () => {
  it("caps at full and is empty without a target", () => {
    expect(fill(1050, 2100)).toBe(0.5)
    expect(fill(2500, 2100)).toBe(1)
    expect(fill(500, null)).toBe(0)
  })
})
