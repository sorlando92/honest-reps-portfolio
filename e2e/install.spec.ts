import { devices, expect, test, type BrowserContext } from "@playwright/test"
import { admin, expectNoAxeViolations, expectTapTargets, signInWithCode } from "./helpers"

// PRD F1 install step and push permission (Q62) at 375px. Headless Chromium
// has no push service, so the browser's subscribe call is stubbed with a fake
// https endpoint; the save goes through the real API and database.

test("Not now once; 3 days later one banner on Today; after that never again (Q62)", async ({ page, context }, info) => {
  await signInWithCode(page, `e2e-install-${info.project.name}-${Date.now()}@example.test`)
  await page.goto("/install")
  await expect(page.getByRole("heading", { name: /on your Home Screen$/ })).toBeVisible()
  // Android Chrome without a ready install dialog: the browser menu steps.
  await expect(page.getByText("Choose Install app or Add to Home screen.")).toBeVisible()
  await expectNoAxeViolations(page)
  await expectTapTargets(page)
  await page.getByRole("button", { name: "Not now" }).click()
  await page.waitForURL("**/today")

  // Next app open: no install screen and, before 3 days, no banner.
  const reopened = await context.newPage()
  await reopened.goto("/today")
  await expect(reopened.getByRole("heading", { name: "Breakfast", level: 2 })).toBeVisible()
  await expect(reopened).toHaveURL(/\/today$/)
  await expect(reopened.getByRole("region", { name: "Install" })).toHaveCount(0)

  // 3 days after the dismissal: one banner.
  await reopened.evaluate(() => localStorage.setItem("hr:install-dismissed-at", String(Date.now() - 3 * 86_400_000 - 60_000)))
  await reopened.reload()
  const banner = reopened.getByRole("region", { name: "Install" })
  await expect(banner).toContainText("to your Home Screen so reminders can reach you.")
  await expectNoAxeViolations(reopened)
  await expectTapTargets(reopened)
  await banner.getByRole("button", { name: "Dismiss" }).click()
  await expect(banner).toHaveCount(0)

  const third = await context.newPage()
  await third.goto("/today")
  await expect(third.getByRole("heading", { name: "Breakfast", level: 2 })).toBeVisible()
  await expect(third.getByRole("region", { name: "Install" })).toHaveCount(0)
})

test("Me opens the install screen, and Back returns to Me without counting a dismissal", async ({ page }, info) => {
  await signInWithCode(page, `e2e-install-me-${info.project.name}-${Date.now()}@example.test`)
  await page.goto("/me")
  await page.getByRole("link", { name: "Add to Home Screen and turn on reminders" }).click()
  await page.waitForURL("**/install?from=me")
  await page.getByRole("button", { name: "Back" }).click()
  await page.waitForURL(/\/me$/)
  expect(await page.evaluate(() => localStorage.getItem("hr:install-dismissed-at"))).toBeNull()
})

/**
 * Stubs the browser push service: headless Chromium reports notifications as
 * denied and has no push service, so act like a phone that asks and answers.
 * The service worker is stubbed too, so the test never depends on it
 * activating. `hang` makes subscribing never answer.
 */
async function stubPush(context: BrowserContext, endpoint: string, hang = false) {
  await context.addInitScript(
    ({ endpoint, hang }) => {
      let permission: NotificationPermission = "default"
      Object.defineProperty(Notification, "permission", { get: () => permission })
      Notification.requestPermission = async () => (permission = "granted")
      const fake = { endpoint, keys: { p256dh: "BPk3", auth: "c2VjcmV0" } }
      const pushManager = {
        getSubscription: async () => null,
        subscribe: () => (hang ? new Promise(() => {}) : Promise.resolve({ ...fake, toJSON: () => fake })),
      }
      if ("serviceWorker" in navigator) {
        Object.defineProperty(navigator.serviceWorker, "ready", { get: () => Promise.resolve({ pushManager }) })
      }
    },
    { endpoint, hang }
  )
}

test("turning on reminders saves this device's subscription", async ({ page, context }, info) => {
  const email = `e2e-push-${info.project.name}-${Date.now()}@example.test`
  const endpoint = `https://push.example.test/send/${info.project.name}-${Date.now()}`
  await stubPush(context, endpoint)
  await signInWithCode(page, email)
  await page.goto("/install")
  await page.getByRole("button", { name: "Turn on reminders" }).click()
  await expect(page.getByText("Reminders are on.")).toBeVisible()
  await page.getByRole("button", { name: "Continue" }).click()
  await page.waitForURL("**/today")

  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const id = data.users.find((u) => u.email === email)!.id
  const [{ data: subs }, { data: events }] = await Promise.all([
    admin.from("push_subscriptions").select("endpoint").eq("user_id", id),
    admin.from("events").select("name").eq("user_id", id).eq("name", "push_enabled"),
  ])
  expect(subs).toEqual([{ endpoint }])
  expect(events).toHaveLength(1)
})

test("a push service that never answers gives up after 10 seconds", async ({ page, context }, info) => {
  await stubPush(context, "https://push.example.test/never", true)
  await signInWithCode(page, `e2e-push-hang-${info.project.name}-${Date.now()}@example.test`)
  await page.goto("/install")
  await page.getByRole("button", { name: "Turn on reminders" }).click()
  await expect(page.getByRole("button", { name: "Turning on" })).toBeDisabled()
  await expect(page.getByRole("alert").filter({ hasText: "Reminders could not be turned on. Try again." })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole("button", { name: "Turn on reminders" })).toBeEnabled()
})

test.describe("on iPhone in Safari", () => {
  test.use({ userAgent: devices["iPhone 14"].userAgent })

  test("shows the Share and Add to Home Screen steps and says reminders need the Home Screen", async ({ page }, info) => {
    await signInWithCode(page, `e2e-ios-${info.project.name}-${Date.now()}@example.test`)
    await page.goto("/install")
    await expect(page.getByText("Tap Share in the Safari toolbar.")).toBeVisible()
    await expect(page.getByText("Choose Add to Home Screen, then Add.")).toBeVisible()
    await expect(page.getByText(/^On iPhone, reminders only work once .+ is on your Home Screen\.$/)).toBeVisible()
    await expect(page.getByRole("button", { name: "Turn on reminders" })).toHaveCount(0)
    await expectNoAxeViolations(page)
  })
})
