import { randomBytes } from "node:crypto"
import { expect, test, type Browser } from "@playwright/test"
import { admin, coachEmail, signInWithCode, userIdByEmail } from "./helpers"

// Security must-fix (audit 2026-10-20): invite-only signup (M1), response
// headers (M2) and push endpoints limited to browser push services (M3).
// example.test is on the local signup allowlist; outside.test is not.

const tag = () => `${Date.now()}-${randomBytes(2).toString("hex")}`

async function coachContext(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  await signInWithCode(page, coachEmail)
  return page
}

test("every response carries the security headers", async ({ request }) => {
  const res = await request.get("/sign-in")
  const h = res.headers()
  expect(h["x-frame-options"]).toBe("DENY")
  expect(h["content-security-policy"]).toBe("frame-ancestors 'none'")
  expect(h["content-security-policy-report-only"]).toContain("default-src 'self'")
  expect(h["x-content-type-options"]).toBe("nosniff")
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin")
  expect(h["permissions-policy"]).toContain("camera=(self)")
  expect(h["strict-transport-security"]).toContain("includeSubDomains")
})

test("an email without an invite cannot create an account", async ({ page }) => {
  const email = `e2e-stranger-${tag()}@outside.test`
  await page.goto("/sign-in")
  await page.getByLabel("Email").fill(email)
  await page.getByRole("button", { name: "Send code" }).click()
  await expect(page.getByText("Honest Reps is invite only. Use the email your coach sent the invite to, or ask your coach for an invite.")).toBeVisible()
  await expect(page.getByLabel("6 digit code")).toHaveCount(0)
  await expect(userIdByEmail(email)).rejects.toThrow()
})

test("an invited email signs up, joins the coach and gets AI logging", async ({ page, browser }, info) => {
  const email = `e2e-invited-${info.project.name}-${tag()}@outside.test`
  const coach = await coachContext(browser)
  const issued = await coach.request.post("/api/invites", { data: { email, firstName: null, billingSource: "comped" } })
  expect(issued.status()).toBe(200)
  const { link } = (await issued.json()) as { link: string }

  await page.goto(new URL(link).pathname)
  await page.waitForURL("**/sign-in")
  await signInWithCode(page, email, { onboarded: false, ai: false })

  const id = await userIdByEmail(email)
  const coachId = await userIdByEmail(coachEmail)
  const { data: profile } = await admin.from("profiles").select("coach_id, tier, ai_enabled, ai_enabled_changed_by").eq("id", id).single()
  expect(profile).toEqual({ coach_id: coachId, tier: "paid", ai_enabled: true, ai_enabled_changed_by: coachId })
  await coach.context().close()
})

test("push subscriptions must point at a browser push service", async ({ page }, info) => {
  await signInWithCode(page, `e2e-push-only-${info.project.name}-${tag()}@example.test`)
  const keys = { p256dh: "BPk3", auth: "c2VjcmV0" }
  for (const endpoint of ["https://evil.example/collect", "https://169.254.169.254/latest/meta-data", "https://fcm.googleapis.com.evil.example/send"]) {
    const res = await page.request.post("/api/push/subscribe", { data: { endpoint, keys } })
    expect(res.status(), endpoint).toBe(400)
  }
  const ok = await page.request.post("/api/push/subscribe", { data: { endpoint: `https://fcm.googleapis.com/fcm/send/e2e-${tag()}`, keys } })
  expect(ok.status()).toBe(200)
})
