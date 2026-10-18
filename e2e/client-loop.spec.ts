import { createHash, randomBytes } from "node:crypto"
import { expect, test, type Browser, type Page } from "@playwright/test"
import { admin, expectNoAxeViolations, expectTapTargets, markOnboarded, signInWithCode } from "./helpers"

// MVP step 4 client loop at 375px, light and dark: coach invite (Q69, Q75),
// State disclosure (Q73), weekly check-in (Q72), coach reply (Q74).

test.use({ timezoneId: "UTC", permissions: ["clipboard-read", "clipboard-write"] })

const run = () => `${Date.now()}-${randomBytes(2).toString("hex")}`
const hash = (t: string) => createHash("sha256").update(t).digest("hex")

async function userId(email: string): Promise<string> {
  for (let page = 1; ; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (found) return found.id
    if (data.users.length < 1000) throw new Error(`No user ${email}`)
  }
}

/** A coach of their own, with the seeded check-in steps and a check-in open today (UTC). */
async function newCoach(page: Page, tag: string) {
  const email = `e2e-coach-${tag}@example.test`
  await signInWithCode(page, email)
  const id = await userId(email)
  const dow = new Date().getUTCDay()
  await admin.from("profiles").update({ role: "coach", coach_id: null, timezone: "UTC", display_name: "Sean Coach" }).eq("id", id)
  const settings = await admin.from("coach_settings").insert({
    coach_id: id,
    checkin_day: dow,
    review_day: (dow + 2) % 7,
    weekly_cycle: { checkin_opens_at: "00:00", overdue_after_hours: 47 },
    reminder_defaults: { checkin_reminder: "08:00", checkin_followup: "19:00" },
    disclosure_title: "About your coaching",
    disclosure_text: "Sean Orlando provides general nutrition coaching. This is not medical nutrition therapy.\n\nSean is not a dietitian licensed by the state.",
  })
  if (settings.error) throw settings.error
  const questions = await admin.from("checkin_questions").insert(
    // One batch: every row needs every column, or PostgREST sends null.
    ([
    { coach_id: id, position: 1, type: "weight", prompt: "This week's weight" },
    { coach_id: id, position: 2, type: "photos", prompt: "Progress photos. Optional. Front, side and back in the same spot and light each week.", optional: true },
    { coach_id: id, position: 3, type: "scale", prompt: "Energy this week", low_label: "Drained", high_label: "Strong", report_tag: "energy" },
    { coach_id: id, position: 4, type: "text", prompt: "How did training feel? Any wins or rough days?", report_tag: "performance" },
    { coach_id: id, position: 5, type: "text", prompt: "Anything you want me to know?", optional: true },
    ] as Record<string, unknown>[]).map((q) => ({ optional: false, low_label: null, high_label: null, report_tag: null, ...q }))
  )
  if (questions.error) throw questions.error
  return { id, email }
}

async function issueInvite(page: Page, email: string): Promise<string> {
  await page.goto("/clients")
  const form = page.getByRole("region", { name: "Invite a client" })
  await form.getByLabel("Email").fill(email)
  await form.getByLabel("First name (optional)").fill("Jo")
  await form.getByRole("radio", { name: "Comped" }).check()
  await form.getByRole("button", { name: "Send invite" }).click()
  // No RESEND_API_KEY in e2e: the screen offers the link instead.
  await expect(form.getByRole("status")).toContainText("Copy the link and send it yourself.")
  await form.getByRole("button", { name: "Copy link" }).click()
  return page.evaluate(() => navigator.clipboard.readText())
}

async function newPage(browser: Browser, colorScheme: "light" | "dark" | "no-preference" | null | undefined) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, colorScheme: colorScheme ?? "light", timezoneId: "UTC" })
  return context.newPage()
}

test("invite, disclosure, check-in, coach reply", async ({ page, browser }, info) => {
  test.setTimeout(180_000)
  const tag = `${info.project.name}-${run()}`
  const coach = await newCoach(page, tag)
  const link = await issueInvite(page, `invited-${tag}@example.test`)
  expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{43}$/)
  await expectNoAxeViolations(page)
  await expectTapTargets(page)

  // The client opens the link signed out and signs in with a different email.
  const client = await newPage(browser, info.project.use.colorScheme)
  const clientEmail = `client-${tag}@example.test`
  await client.goto(new URL(link).pathname)
  await client.waitForURL("**/sign-in")
  // A new account: the invite is claimed on sign in, then onboarding (skipped here), then the disclosure.
  await signInWithCode(client, clientEmail, { onboarded: false })
  await markOnboarded(clientEmail)
  await client.goto("/today")
  const clientId = await userId(clientEmail)
  const { data: profile } = await admin.from("profiles").select("coach_id, tier, billing_source").eq("id", clientId).single()
  expect(profile).toEqual({ coach_id: coach.id, tier: "paid", billing_source: "comped" })
  const { data: invite } = await admin.from("invites").select("claimed_email").eq("claimed_by", clientId).single()
  expect(invite?.claimed_email).toBe(clientEmail)

  // State disclosure before anything else.
  await client.waitForURL("**/disclosure")
  await expect(client.getByRole("heading", { name: "About your coaching" })).toBeVisible()
  await expect(client.getByText("Sean is not a dietitian licensed by the state.")).toBeVisible()
  await expectNoAxeViolations(client)
  await expectTapTargets(client)
  // Required: sending without the tick saves nothing.
  await client.getByRole("button", { name: "Accept and continue" }).click()
  await expect(client).toHaveURL(/\/disclosure$/)
  await client.getByLabel("I have read and understand this.").check()
  await client.getByRole("button", { name: "Accept and continue" }).click()
  await client.waitForURL("**/today")
  const { count: accepted } = await admin.from("consents").select("id", { count: "exact", head: true }).eq("user_id", clientId).eq("kind", "mo_disclosure")
  expect(accepted).toBe(1)

  // The check-in card, then one question per screen.
  const card = client.getByRole("region", { name: "Weekly check-in" })
  await expect(card).toContainText("Takes under a minute.")
  await card.getByRole("link", { name: "Start check-in" }).click()
  await client.waitForURL("**/checkin")
  await expect(client.getByRole("heading", { name: "This week's weight" })).toBeFocused()
  await expect(client.getByRole("list", { name: "Step 1 of 5" })).toBeAttached()
  await client.getByLabel("Weight in pounds").fill("181.4")
  await client.getByRole("button", { name: "Next" }).click()

  await expect(client.getByRole("heading", { name: /Progress photos/ })).toBeVisible()
  await expect(client.getByRole("button", { name: "Skip" })).toBeVisible()
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64")
  await client.locator('input[type="file"]').setInputFiles({ name: "front.png", mimeType: "image/png", buffer: png })
  await expect(client.getByText("Saved", { exact: true })).toBeVisible()
  await expectNoAxeViolations(client)
  await expectTapTargets(client)
  await client.getByRole("button", { name: "Next" }).click()

  await expect(client.getByRole("heading", { name: "Energy this week" })).toBeVisible()
  await expect(client.getByRole("button", { name: "Next" })).toBeDisabled()
  await client.getByRole("radio", { name: "4" }).click()
  await expect(client.getByRole("radio", { name: "4" })).toHaveAttribute("aria-checked", "true")
  await expectNoAxeViolations(client)
  await expectTapTargets(client)
  await client.getByRole("button", { name: "Next" }).click()

  await client.getByLabel("How did training feel? Any wins or rough days?").fill("Squats felt strong.")
  await client.getByRole("button", { name: "Next" }).click()
  await expect(client.getByText("Optional")).toBeVisible()
  await client.getByRole("button", { name: "Submit" }).click()
  await expect(client.getByRole("heading", { name: "Check-in sent." })).toBeVisible()

  const { data: checkin } = await admin.from("checkins").select("id, weight_kg, on_time, answers").eq("user_id", clientId).single()
  expect(Number(checkin?.weight_kg)).toBeCloseTo(82.28, 1)
  expect(checkin?.on_time).toBe(true)
  expect(Object.values(checkin?.answers ?? {})).toEqual(expect.arrayContaining([4, "Squats felt strong."]))
  const { data: events } = await admin.from("events").select("name, props").eq("user_id", clientId).in("name", ["checkin_started", "checkin_submitted"])
  expect(events?.map((e) => e.name).sort()).toEqual(["checkin_started", "checkin_submitted"])
  expect(events?.find((e) => e.name === "checkin_submitted")?.props).toMatchObject({ on_time: true })
  await client.goto("/today")
  await expect(client.getByRole("region", { name: "Weekly check-in" })).toHaveCount(0)

  // The coach reads it and replies.
  await page.goto("/clients")
  await page.getByRole("region", { name: "Check-ins this week" }).getByRole("link", { name: /Client/ }).click()
  await expect(page.getByText("181.4 lb")).toBeVisible()
  await expect(page.getByText("4 of 5 (Drained to Strong)")).toBeVisible()
  await expect(page.getByRole("img", { name: "Progress photo 1" })).toBeVisible()
  await expectNoAxeViolations(page)
  await expectTapTargets(page)
  await page.getByLabel("Reply to Client").fill("Good week. Keep protein steady through the weekend.")
  // Close the keyboard and scroll to the end, as a coach would: the floating bars come back over the bottom of the page.
  await page.getByLabel("Reply to Client").blur()
  await expect(page.locator("html")).not.toHaveAttribute("data-keyboard", "open")
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.getByRole("button", { name: "Send reply" }).click()
  await expect(page.getByRole("status").filter({ hasText: "Reply sent." })).toBeVisible()
  const { data: sent } = await admin.from("events").select("props").eq("user_id", coach.id).eq("name", "message_sent")
  expect(sent?.[0]?.props).toMatchObject({ role: "coach" })

  // The client sees the reply on Today and reads it on Coach.
  await client.goto("/today")
  await client.getByRole("link", { name: /Your coach replied/ }).click()
  await client.waitForURL("**/coach")
  await expect(client.getByText("Good week. Keep protein steady through the weekend.")).toBeVisible()
  await expectNoAxeViolations(client)
  await expectTapTargets(client)
  await expect.poll(async () => (await admin.from("messages").select("read_at").eq("thread_user_id", clientId).single()).data?.read_at).toBeTruthy()

  // A used link: Today for the person who used it, the used message for anyone else.
  await client.goto(new URL(link).pathname)
  await client.waitForURL("**/today")
  const stranger = await newPage(browser, info.project.use.colorScheme)
  await stranger.goto(new URL(link).pathname)
  await stranger.waitForURL("**/invite/status?s=used")
  await expect(stranger.getByRole("status")).toHaveText("This invite was already used.")
  await expectNoAxeViolations(stranger)
  await client.context().close()
  await stranger.context().close()
})

test("expired, resent, revoked and other-account invites", async ({ page, browser }, info) => {
  test.setTimeout(120_000)
  const tag = `${info.project.name}-${run()}`
  const coach = await newCoach(page, tag)

  const expiredToken = randomBytes(32).toString("base64url")
  await admin.from("invites").insert({ coach_id: coach.id, email: "x@example.test", billing_source: "external", token_hash: hash(expiredToken), expires_at: new Date(Date.now() - 1000).toISOString() })
  const visitor = await newPage(browser, info.project.use.colorScheme)
  await visitor.goto(`/invite/${expiredToken}`)
  await expect(visitor.getByRole("status")).toHaveText("This invite expired. Ask your coach for a new one.")
  await expectNoAxeViolations(visitor)
  await expectTapTargets(visitor)

  // Resend: a new link works, the old one is dead.
  const invited = `pending-${tag}@example.test`
  const first = await issueInvite(page, invited)
  const pending = page.getByRole("region", { name: "Invites" })
  await pending.getByRole("button", { name: `Resend invite to ${invited}` }).click()
  await pending.getByRole("button", { name: "Copy link" }).click()
  await expect(pending.getByRole("button", { name: "Link copied" })).toBeVisible()
  const second = await page.evaluate(() => navigator.clipboard.readText())
  expect(second).not.toBe(first)
  await visitor.goto(new URL(first).pathname)
  await expect(visitor.getByRole("status")).toHaveText("This invite expired. Ask your coach for a new one.")

  // Opened while signed in as someone else: sign out to accept it.
  const other = `other-${tag}@example.test`
  await signInWithCode(visitor, other)
  await visitor.goto(new URL(second).pathname)
  await expect(visitor.getByRole("status")).toHaveText("This invite was sent to another account. Sign out to accept it.")
  await expectNoAxeViolations(visitor)
  await expectTapTargets(visitor)
  const { data: before } = await admin.from("profiles").select("tier").eq("id", await userId(other)).single()
  expect(before?.tier).toBe("free")
  await visitor.getByRole("button", { name: "Sign out" }).click()
  await visitor.waitForURL("**/sign-in")

  // Revoke: gone from the list, and the link is dead.
  await page.goto("/clients")
  await page.getByRole("region", { name: "Invites" }).getByRole("button", { name: `Revoke invite to ${invited}` }).click()
  await expect(page.getByRole("region", { name: "Invites" }).getByText("Pending, comped")).toHaveCount(0)
  const fresh = await newPage(browser, info.project.use.colorScheme)
  await fresh.goto(new URL(second).pathname)
  await expect(fresh.getByRole("status")).toHaveText("This invite expired. Ask your coach for a new one.")
  await visitor.context().close()
  await fresh.context().close()
})

test("the reminder job refuses calls without the secret", async ({ request }) => {
  expect((await request.post("/api/jobs/checkin-reminders")).status()).toBe(401)
  expect((await request.post("/api/jobs/checkin-reminders", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401)
})
