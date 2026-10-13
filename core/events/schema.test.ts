import { describe, expect, it } from "vitest"
import { trackRequestSchema } from "./schema"
import { EVENT_NAMES, PRE_AUTH_EVENTS, SERVER_ONLY_EVENTS, isPreAuthEvent, isServerOnlyEvent } from "./names"

describe("trackRequestSchema", () => {
  it("accepts every PRD event name a client may send", () => {
    for (const name of EVENT_NAMES.filter((n) => !isServerOnlyEvent(n))) {
      expect(trackRequestSchema.safeParse({ name, props: {} }).success, name).toBe(true)
    }
  })

  it("rejects server only events", () => {
    for (const name of SERVER_ONLY_EVENTS) {
      expect(trackRequestSchema.safeParse({ name, props: {} }).success, name).toBe(false)
    }
  })

  it("rejects unknown event names", () => {
    expect(trackRequestSchema.safeParse({ name: "page_view" }).success).toBe(false)
  })

  it("defaults props to an empty object", () => {
    const parsed = trackRequestSchema.parse({ name: "signup_started" })
    expect(parsed.props).toEqual({})
  })

  it("rejects nested props and oversized payloads", () => {
    expect(trackRequestSchema.safeParse({ name: "food_logged", props: { a: { b: 1 } } }).success).toBe(false)
    const many = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, i]))
    expect(trackRequestSchema.safeParse({ name: "food_logged", props: many }).success).toBe(false)
  })
})

describe("pre auth events", () => {
  it("only allows signup_started and pwa_installed without a session", () => {
    expect([...PRE_AUTH_EVENTS].sort()).toEqual(["pwa_installed", "signup_started"])
    expect(isPreAuthEvent("food_logged")).toBe(false)
  })
})
