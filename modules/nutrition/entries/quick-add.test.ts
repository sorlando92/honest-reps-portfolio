import { describe, expect, it } from "vitest"
import { frequentFoods, timeOfDay, type ItemHistoryRow } from "./quick-add"

const CHICAGO = "America/Chicago"

const row = (name: string, loggedAt: string, extra: Partial<ItemHistoryRow> = {}): ItemHistoryRow => ({
  name,
  food_item_id: `id-${name}`,
  amount: 1,
  unit: "serving",
  grams: 100,
  amount_source: "estimated",
  state: null,
  calories: 100,
  protein_g: 10,
  carbs_g: 10,
  fat_g: 1,
  logged_at: loggedAt,
  ...extra,
})

// Local Chicago times in October (UTC minus 5 hours).
const at = (day: number, hour: number) => new Date(Date.UTC(2026, 9, day, hour + 5)).toISOString()

describe("timeOfDay", () => {
  it("buckets by the user's local hour", () => {
    expect(timeOfDay(at(14, 7), CHICAGO)).toBe("morning")
    expect(timeOfDay(at(14, 12), CHICAGO)).toBe("midday")
    expect(timeOfDay(at(14, 19), CHICAGO)).toBe("evening")
    expect(timeOfDay(at(14, 23), CHICAGO)).toBe("late")
  })
})

describe("frequentFoods", () => {
  const history = [
    row("oatmeal", at(10, 7)),
    row("oatmeal", at(11, 7)),
    row("oatmeal", at(12, 7)),
    row("chicken breast", at(10, 12), { amount_source: "weighed", grams: 170, calories: 281 }),
    row("chicken breast", at(11, 12)),
    row("chicken breast", at(12, 19), { amount_source: "weighed", grams: 200, calories: 330 }),
    row("chicken breast", at(13, 19), { grams: 120, calories: 198 }),
    row("protein shake", at(12, 7)),
  ]

  it("ranks foods eaten at this time of day first, then by count overall", () => {
    const morning = frequentFoods(history, CHICAGO, new Date(at(14, 8)), 6)
    expect(morning.map((c) => c.title)).toEqual(["oatmeal", "protein shake", "chicken breast"])
    const evening = frequentFoods(history, CHICAGO, new Date(at(14, 18)), 6)
    expect(evening[0].title).toBe("chicken breast")
  })

  it("logs a food at its last weighed amount, not its last amount", () => {
    const chicken = frequentFoods(history, CHICAGO, new Date(at(14, 18)), 1)[0]
    expect(chicken.items[0]).toMatchObject({ grams: 200, calories: 330, amountSource: "weighed", flagReason: null })
    expect(chicken).toMatchObject({ kind: "frequent", calories: 330 })
  })

  it("respects the limit and handles foods without a database match by name", () => {
    const named = [row("Homemade Chili", at(12, 19), { food_item_id: null }), row("homemade chili ", at(13, 19), { food_item_id: null })]
    const chips = frequentFoods([...history, ...named], CHICAGO, new Date(at(14, 18)), 2)
    expect(chips).toHaveLength(2)
    expect(chips.map((c) => c.title)).toContain("homemade chili")
  })
})
