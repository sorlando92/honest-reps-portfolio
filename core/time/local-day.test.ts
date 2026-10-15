import { describe, expect, it } from "vitest"
import { addDays, dayBounds, isValidTimezone, localDate, localToday } from "./local-day"

const CHICAGO = "America/Chicago"
const hours = (b: { start: Date; end: Date }) => (b.end.getTime() - b.start.getTime()) / 3_600_000

describe("localDate", () => {
  it("puts a log at 11:30 PM Central on that local day, not the UTC day", () => {
    // 11:30 PM CDT on Oct 14 is 04:30 UTC on Oct 15.
    expect(localDate("2026-10-15T04:30:00Z", CHICAGO)).toBe("2026-10-14")
    // 11:30 PM CST on Jan 14 is 05:30 UTC on Jan 15.
    expect(localDate("2026-01-15T05:30:00Z", CHICAGO)).toBe("2026-01-14")
  })

  it("rolls over at local midnight", () => {
    expect(localDate("2026-10-15T04:59:59Z", CHICAGO)).toBe("2026-10-14")
    expect(localDate("2026-10-15T05:00:00Z", CHICAGO)).toBe("2026-10-15")
  })

  it("handles half hour offsets", () => {
    expect(localDate("2026-10-14T18:29:00Z", "Asia/Kolkata")).toBe("2026-10-14")
    expect(localDate("2026-10-14T18:30:00Z", "Asia/Kolkata")).toBe("2026-10-15")
  })

  it("gives today in the timezone, not the machine's", () => {
    expect(localToday(CHICAGO, new Date("2026-10-15T04:30:00Z"))).toBe("2026-10-14")
    expect(localToday("UTC", new Date("2026-10-15T04:30:00Z"))).toBe("2026-10-15")
  })
})

describe("dayBounds", () => {
  it("covers local midnight to midnight in Central time", () => {
    const b = dayBounds("2026-10-14", CHICAGO)
    expect(b.start.toISOString()).toBe("2026-10-14T05:00:00.000Z")
    expect(b.end.toISOString()).toBe("2026-10-15T05:00:00.000Z")
  })

  it("contains the 11:30 PM log on its local day only", () => {
    const log = new Date("2026-10-15T04:30:00Z").getTime()
    const day = dayBounds("2026-10-14", CHICAGO)
    const next = dayBounds("2026-10-15", CHICAGO)
    expect(log >= day.start.getTime() && log < day.end.getTime()).toBe(true)
    expect(log >= next.start.getTime() && log < next.end.getTime()).toBe(false)
  })

  it("is 25 hours when daylight saving time ends and 23 when it starts", () => {
    expect(hours(dayBounds("2026-11-01", CHICAGO))).toBe(25)
    expect(hours(dayBounds("2026-03-08", CHICAGO))).toBe(23)
    expect(hours(dayBounds("2026-10-14", CHICAGO))).toBe(24)
  })

  it("matches UTC for UTC", () => {
    expect(dayBounds("2026-10-14", "UTC").start.toISOString()).toBe("2026-10-14T00:00:00.000Z")
  })
})

describe("addDays and isValidTimezone", () => {
  it("crosses months and years", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
  })

  it("accepts IANA names and rejects others", () => {
    expect(isValidTimezone(CHICAGO)).toBe(true)
    expect(isValidTimezone("Mars/Olympus")).toBe(false)
  })
})
