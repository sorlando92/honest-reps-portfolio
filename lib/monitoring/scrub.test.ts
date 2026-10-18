import { describe, expect, it } from "vitest"
import type { ErrorEvent } from "@sentry/nextjs"
import { scrubBreadcrumb, scrubEvent, scrubText, stripQuery } from "./scrub"

describe("error monitoring scrub", () => {
  it("keeps only the user id", () => {
    const event = scrubEvent({
      type: undefined,
      user: { id: "u1", email: "a@b.com", ip_address: "1.2.3.4", username: "sean" },
    } as ErrorEvent)
    expect(event.user).toEqual({ id: "u1" })
  })

  it("drops request bodies, headers, cookies and query strings", () => {
    const event = scrubEvent({
      type: undefined,
      request: {
        method: "POST",
        url: "https://app.honestreps.app/api/foods/search?q=ascent%20whey",
        data: { text: "2 eggs and toast" },
        headers: { cookie: "sb=1" },
        cookies: { sb: "1" },
        query_string: "q=ascent",
      },
      extra: { weight: 82 },
    } as ErrorEvent)
    expect(event.request).toEqual({ method: "POST", url: "https://app.honestreps.app/api/foods/search" })
    expect(event.extra).toBeUndefined()
  })

  it("redacts emails and Postgres row values in messages", () => {
    expect(scrubText("no user sean@example.com")).toBe("no user [email]")
    expect(scrubText('duplicate key value violates unique constraint "x" Key (gtin)=(00815863022027) already exists')).toBe(
      'duplicate key value violates unique constraint "x" Key (gtin)=([redacted]) already exists'
    )
    expect(scrubText("Failing row contains (1, chicken breast, 200).")).toBe("Failing row contains ([redacted]).")
  })

  it("drops console and UI breadcrumbs and strips URLs", () => {
    expect(scrubBreadcrumb({ category: "console", message: "2 eggs" })).toBeNull()
    expect(scrubBreadcrumb({ category: "ui.input", message: "input#log" })).toBeNull()
    const crumb = scrubBreadcrumb({
      category: "fetch",
      data: { url: "/api/foods/search?q=eggs", method: "GET", status_code: 500, request_body: "x" },
    })
    expect(crumb?.data).toEqual({ url: "/api/foods/search", method: "GET", status_code: 500 })
    expect(scrubBreadcrumb({ category: "navigation", data: { from: "/today?date=2026-10-01", to: "/progress" } })?.data).toEqual({
      from: "/today",
      to: "/progress",
    })
  })

  it("strips fragments as well as queries", () => {
    expect(stripQuery("/a#b")).toBe("/a")
    expect(stripQuery("/a")).toBe("/a")
  })
})
