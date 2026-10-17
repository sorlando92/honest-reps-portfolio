import { expect, test } from "@playwright/test"
import { coachEmail, expectNoAxeViolations, expectTapTargets, signInWithCode } from "./helpers"

const MEMBER_TABS = ["Progress", "Today", "Coach", "More"]

test("signed out visitors land on sign in", async ({ page }) => {
  await page.goto("/today")
  await expect(page).toHaveURL(/\/sign-in$/)
  await expect(page.getByText("Your coach can see what you log so he can help.")).toBeVisible()
  await expectNoAxeViolations(page)
  await expectTapTargets(page)
})

test("the manifest is installable", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest")
  expect(res.ok()).toBe(true)
  const manifest = await res.json()
  expect(manifest.display).toBe("standalone")
  expect(manifest.name).toBeTruthy()
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]))
  for (const size of [180, 192, 512]) {
    const icon = await request.get(`/pwa-icon/${size}`)
    expect(icon.headers()["content-type"]).toContain("image/png")
  }
})

test("a new member signs in with the emailed code and sees the 4 tabs", async ({ page }, info) => {
  const email = `e2e-${info.project.name}-${Date.now()}@example.test`
  await signInWithCode(page, email)

  const nav = page.getByRole("navigation", { name: "Main" })
  for (const tab of MEMBER_TABS) {
    await expect(nav.getByRole("tab", { name: tab })).toBeVisible()
  }
  await expect(nav.getByRole("tab", { name: "Clients" })).toHaveCount(0)

  for (const tab of MEMBER_TABS) {
    await nav.getByRole("tab", { name: tab }).click()
    // Progress greets the user (NAV_SPEC 5); Today's title is "Today".
    await expect(page.getByRole("heading", { level: 1, name: tab === "Progress" ? "Hi" : tab === "Today" ? /^Today, / : tab })).toBeVisible()
    await expect(nav.getByRole("tab", { name: tab })).toHaveAttribute("aria-current", "page")
    await expectNoAxeViolations(page)
    await expectTapTargets(page)
    await page.screenshot({ path: info.outputPath(`${tab.toLowerCase()}.png`), fullPage: true })
  }

  await page.goto("/clients")
  await expect(page.getByRole("heading", { name: "Clients" })).toHaveCount(0)
})

test("the coach gets Clients in place of Coach", async ({ page }) => {
  await signInWithCode(page, coachEmail)
  const nav = page.getByRole("navigation", { name: "Main" })
  await expect(nav.getByRole("tab")).toHaveText(["Progress", "Today", "Clients", "More"])
  await nav.getByRole("tab", { name: "Clients" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Clients" })).toBeVisible()
  await expectNoAxeViolations(page)

  await page.goto("/coach")
  await expect(page).toHaveURL(/\/clients$/)
})

test("signing out returns to sign in", async ({ page }, info) => {
  await signInWithCode(page, `e2e-out-${info.project.name}-${Date.now()}@example.test`)
  await page.getByRole("navigation", { name: "Main" }).getByRole("tab", { name: "More" }).click()
  await page.getByRole("button", { name: "Sign out" }).click()
  await expect(page).toHaveURL(/\/sign-in$/)
})
