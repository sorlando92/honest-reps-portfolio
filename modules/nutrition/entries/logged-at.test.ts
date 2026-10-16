import { describe, expect, it } from "vitest"
import { DEFAULT_MEAL_ANCHORS, mealAnchors } from "./meals"
import { loggedAtFor } from "./logged-at"

const tz = "America/Chicago"
const now = new Date("2026-10-16T19:42:00Z") // 2:42 PM CDT, Oct 16

describe("loggedAtFor (Q52)", () => {
  it("is now on today", () => {
    expect(loggedAtFor("2026-10-16", "dinner", tz, DEFAULT_MEAL_ANCHORS, now)).toEqual(now)
  })

  it("uses the meal anchor on a past day", () => {
    expect(loggedAtFor("2026-10-14", "dinner", tz, DEFAULT_MEAL_ANCHORS, now).toISOString()).toBe("2026-10-14T23:30:00.000Z")
    expect(loggedAtFor("2026-10-14", "breakfast", tz, DEFAULT_MEAL_ANCHORS, now).toISOString()).toBe("2026-10-14T13:00:00.000Z")
  })

  it("uses the current clock time on a past day when no meal was chosen", () => {
    expect(loggedAtFor("2026-10-14", null, tz, DEFAULT_MEAL_ANCHORS, now).toISOString()).toBe("2026-10-14T19:42:00.000Z")
  })

  it("keeps local times across a daylight saving change", () => {
    // Nov 1 2026 is the first day of CST (UTC-6).
    expect(loggedAtFor("2026-11-01", "lunch", tz, DEFAULT_MEAL_ANCHORS, new Date("2026-11-05T18:00:00Z")).toISOString()).toBe("2026-11-01T18:30:00.000Z")
  })

  it("reads anchors from app_config with fallbacks", () => {
    expect(mealAnchors({ lunch: "13:00", dinner: "7pm" })).toEqual({ ...DEFAULT_MEAL_ANCHORS, lunch: "13:00" })
  })
})
