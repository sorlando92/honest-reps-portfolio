import { expect, test, type Browser, type Page } from "@playwright/test"
import { admin, coachEmail, expectNoAxeViolations, expectTapTargets, signInWithCode, userClient, userIdByEmail } from "./helpers"

// Per-client AI access (Sean, 2026-10-20). The AI routes answer 403 until the
// assigned coach turns AI on; only that coach can. Requests with AI on send a
// body the route refuses after the AI check (400), so no test calls the model.

const AI_OFF = "AI logging is off. Your coach will turn it on."
// A 1 by 1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64")

/** POSTs a real request to each AI route as the signed in page. */
async function callAiRoutes(page: Page, { valid }: { valid: boolean }) {
  const parse = await page.request.post("/api/parse", { data: valid ? { text: "2 eggs and toast", localTime: "08:00" } : { text: "" } })
  const label = await page.request.post("/api/foods/label", {
    multipart: valid ? { photo: { name: "label.png", mimeType: "image/png", buffer: PNG } } : { photo: { name: "label.txt", mimeType: "text/plain", buffer: Buffer.from("not a photo") } },
  })
  return { parse, label }
}

async function newClient(page: Page, project: string, ai: boolean) {
  const stamp = `${project}-${Date.now()}`
  const email = `e2e-ai-${stamp}@example.test`
  await signInWithCode(page, email, { ai })
  const id = await userIdByEmail(email)
  const name = `Ai Tester ${stamp}`
  await admin.from("profiles").update({ display_name: name }).eq("id", id)
  return { email, id, name }
}

async function coachPage(browser: Browser, colorScheme: "light" | "dark" | "no-preference" | null | undefined, email = coachEmail) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, colorScheme: colorScheme ?? "light" })
  const page = await context.newPage()
  await signInWithCode(page, email)
  return page
}

test("with AI off every AI route answers 403 and Today offers search instead", async ({ page }, info) => {
  await newClient(page, info.project.name, false)

  const { parse, label } = await callAiRoutes(page, { valid: true })
  expect(parse.status()).toBe(403)
  expect(await parse.json()).toMatchObject({ error: "ai_disabled" })
  expect(label.status()).toBe(403)
  expect(await label.json()).toMatchObject({ error: "ai_disabled" })

  // No AI entry points; send searches instead of parsing.
  let parseCalls = 0
  await page.route("**/api/parse", (route) => {
    parseCalls++
    return route.continue()
  })
  const field = page.getByRole("textbox", { name: /What did you eat/ })
  await field.fill("banana")
  await expect(page.getByText(AI_OFF)).toBeVisible()
  await expect(page.getByRole("button", { name: /Describe with AI/ })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Scan the label" })).toHaveCount(0)
  await page.getByRole("button", { name: "Search for this food" }).click()
  await expect(page.getByRole("dialog", { name: "Add food" })).toBeVisible()
  expect(parseCalls).toBe(0)
})

test("the coach turns AI on and the client can use it", { tag: "@a11y" }, async ({ page, browser }, info) => {
  const client = await newClient(page, info.project.name, false)
  const coach = await coachPage(browser, info.project.use.colorScheme)
  const coachId = await userIdByEmail(coachEmail)

  await coach.goto("/clients")
  const toggle = coach.getByRole("switch", { name: `AI logging for ${client.name}` })
  await expect(toggle).toHaveAttribute("aria-checked", "false")
  await expectNoAxeViolations(coach)
  await expectTapTargets(coach)
  await toggle.click()
  await expect(toggle).toHaveAttribute("aria-checked", "true")

  const { data: row } = await admin.from("profiles").select("ai_enabled, ai_enabled_changed_by, ai_enabled_changed_at").eq("id", client.id).single()
  expect(row).toMatchObject({ ai_enabled: true, ai_enabled_changed_by: coachId })
  expect(Date.now() - Date.parse(row!.ai_enabled_changed_at as string)).toBeLessThan(60_000)

  // Past the AI check: each route now refuses the body instead (400), before the rate limiter and the model.
  const { parse, label } = await callAiRoutes(page, { valid: false })
  expect(parse.status()).toBe(400)
  expect(label.status()).toBe(400)

  await page.reload()
  await page.getByRole("textbox", { name: /What did you eat/ }).fill("banana")
  await expect(page.getByRole("button", { name: /Describe with AI/ })).toBeVisible()
  await expect(page.getByText(AI_OFF)).toHaveCount(0)

  // And back off.
  await toggle.click()
  await expect(toggle).toHaveAttribute("aria-checked", "false")
  expect((await callAiRoutes(page, { valid: true })).parse.status()).toBe(403)
  await coach.context().close()
})

test("a client cannot turn AI on for themselves", async ({ page }, info) => {
  const client = await newClient(page, info.project.name, false)

  // Straight to the database under RLS: ai_enabled has no update grant.
  const db = await userClient(client.email)
  const write = await db.from("profiles").update({ ai_enabled: true }).eq("id", client.id)
  expect(write.error?.code).toBe("42501")

  // Through the app: the toggle route is coach only.
  const res = await page.request.post(`/api/clients/${client.id}/ai`, { data: { enabled: true } })
  expect(res.status()).toBe(403)

  const { data } = await admin.from("profiles").select("ai_enabled").eq("id", client.id).single()
  expect(data?.ai_enabled).toBe(false)
  expect((await callAiRoutes(page, { valid: true })).parse.status()).toBe(403)
})

test("a coach cannot change AI for another coach's client", async ({ page, browser }, info) => {
  const client = await newClient(page, info.project.name, false)
  const otherEmail = `e2e-ai-coach-${info.project.name}-${Date.now()}@example.test`
  const other = await coachPage(browser, info.project.use.colorScheme, otherEmail)
  await admin.from("profiles").update({ role: "coach", coach_id: null }).eq("id", await userIdByEmail(otherEmail))

  const res = await other.request.post(`/api/clients/${client.id}/ai`, { data: { enabled: true } })
  expect(res.status()).toBe(403)
  await other.goto("/clients")
  await expect(other.getByRole("switch", { name: `AI logging for ${client.name}` })).toHaveCount(0)

  const { data } = await admin.from("profiles").select("ai_enabled, ai_enabled_changed_by").eq("id", client.id).single()
  expect(data).toMatchObject({ ai_enabled: false, ai_enabled_changed_by: null })
  await other.context().close()
})
