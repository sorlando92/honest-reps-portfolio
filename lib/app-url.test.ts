import { describe, expect, it } from "vitest"
import { appBaseUrl } from "./app-url"

describe("appBaseUrl", () => {
  it("prefers APP_URL, then the preview's VERCEL_URL, then production", () => {
    expect(appBaseUrl({ APP_URL: "https://app.honestreps.app/", VERCEL_URL: "x.vercel.app" })).toBe("https://app.honestreps.app")
    expect(appBaseUrl({ VERCEL_URL: "honest-reps-abc123-honest-reps.vercel.app" })).toBe("https://honest-reps-abc123-honest-reps.vercel.app")
    expect(appBaseUrl({})).toBe("https://app.honestreps.app")
  })
})
