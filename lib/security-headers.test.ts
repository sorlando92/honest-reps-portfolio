import { describe, expect, it } from "vitest"
import { contentSecurityPolicy, securityHeaders, sentryReportUri } from "./security-headers"

describe("security headers", () => {
  it("builds Sentry's CSP report endpoint from the DSN", () => {
    expect(sentryReportUri("https://abc123@o42.ingest.us.sentry.io/7")).toBe("https://o42.ingest.us.sentry.io/api/7/security/?sentry_key=abc123")
    expect(sentryReportUri(undefined)).toBeNull()
    expect(sentryReportUri("not a url")).toBeNull()
  })

  it("lets the app load Supabase, Sentry and Open Food Facts, and reports to Sentry", () => {
    const csp = contentSecurityPolicy({ supabaseUrl: "https://ref.supabase.co", sentryDsn: "https://k@o1.ingest.sentry.io/2" })
    expect(csp).toContain("connect-src 'self' https://ref.supabase.co wss://ref.supabase.co https://o1.ingest.sentry.io")
    expect(csp).toContain("img-src 'self' data: blob: https://ref.supabase.co https://*.openfoodfacts.org")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("report-uri https://o1.ingest.sentry.io/api/2/security/?sentry_key=k")
    expect(csp).not.toContain("'unsafe-eval'")
  })

  it("leaves out what is not configured", () => {
    const csp = contentSecurityPolicy({})
    expect(csp).toContain("connect-src 'self';")
    expect(csp).not.toContain("report-uri")
    expect(contentSecurityPolicy({ dev: true })).toContain("'unsafe-eval'")
  })

  it("refuses framing for real and keeps the full policy report-only", () => {
    const h = Object.fromEntries(securityHeaders({}).map((x) => [x.key, x.value]))
    expect(h["X-Frame-Options"]).toBe("DENY")
    expect(h["Content-Security-Policy"]).toBe("frame-ancestors 'none'")
    expect(h["Content-Security-Policy-Report-Only"]).toContain("default-src 'self'")
    expect(h["Strict-Transport-Security"]).toBe("max-age=63072000; includeSubDomains")
    expect(h["X-Content-Type-Options"]).toBe("nosniff")
    expect(h["Permissions-Policy"]).toContain("camera=(self)")
  })
})
