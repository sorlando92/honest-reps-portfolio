import { expect, test, type Page } from "@playwright/test"
import { admin, expectNoAxeViolations, expectTapTargets, signInWithCode } from "./helpers"

// PRD F1 onboarding at 375px, through the real UI and database.
const next = (page: Page) => page.getByRole("button", { name: "Next" }).click()
const choose = (page: Page, group: string, option: string) => page.getByRole("radiogroup", { name: group }).getByRole("radio", { name: new RegExp(`^${option}`) }).click()

test("a new member answers onboarding and lands on Today with targets", async ({ page }, info) => {
  const email = `e2e-onboard-${info.project.name}-${Date.now()}@example.test`
  await signInWithCode(page, email, { onboarded: false })
  await expect(page).toHaveURL(/\/onboarding$/)
  // Nothing else in the app is reachable before onboarding.
  await page.goto("/today")
  await expect(page).toHaveURL(/\/onboarding$/)

  await expect(page.getByRole("heading", { name: "Pounds or kilograms?" })).toBeVisible()
  await expectNoAxeViolations(page)
  await expectTapTargets(page)
  await next(page)
  await choose(page, "Goal", "Lose fat")
  await next(page)
  await choose(page, "Sex", "Male")
  await next(page)
  await page.getByLabel("Date of birth").fill("1991-03-02")
  await next(page)
  await page.getByLabel("Feet").fill("5")
  await page.getByLabel("Inches").fill("11")
  await next(page)
  await page.getByLabel("Current weight (lb)").fill("198")
  await page.getByLabel("Goal weight (lb), optional").fill("181")
  await next(page)
  await choose(page, "Activity", "Moderate")
  await next(page)

  // No scale yet: one skippable screen with the hand portion guide.
  await choose(page, "Food scale", "Not yet")
  await next(page)
  await expect(page.getByRole("heading", { name: "A food scale is the biggest upgrade to your accuracy." })).toBeVisible()
  await expect(page.getByRole("list", { name: "Hand portions" }).getByRole("listitem")).toHaveCount(4)
  await page.getByRole("button", { name: "Got it" }).click()

  await choose(page, "Medical condition", "Yes")
  await expect(page.getByText("Talk with your doctor before changing your diet. Your coach will be notified.")).toBeVisible()
  await next(page)

  const nextButton = page.getByRole("button", { name: "Next" })
  await expect(nextButton).toBeDisabled()
  await page.getByLabel("I understand this is general nutrition information, not medical advice.").check()
  await page.getByLabel("I accept the terms.").check()
  await page.getByLabel("I accept the privacy policy.").check()
  await expectTapTargets(page)
  await next(page)

  await expect(page.getByRole("heading", { name: "Your starting targets" })).toBeVisible()
  await expect(page.getByText("Protein", { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath("targets.png"), fullPage: true })
  await page.getByRole("button", { name: "Start logging" }).click()
  await page.waitForURL("**/today")
  await expect(page.getByRole("heading", { name: "Breakfast", level: 2 })).toBeVisible()

  // Saved: formula targets, the first weigh-in (Q56), consents (Q55), the medical flag.
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const id = users.users.find((u) => u.email === email)!.id
  const [{ data: profile }, { data: targets }, { data: weights }, { data: consents }, { data: nutrition }] = await Promise.all([
    admin.from("profiles").select("units, date_of_birth, medical_flag, onboarding_completed_at").eq("id", id).single(),
    admin.from("targets").select("calories, protein_g, carbs_g, fat_g, set_by").eq("user_id", id),
    admin.from("weights").select("weight_kg").eq("user_id", id),
    admin.from("consents").select("kind, version").eq("user_id", id).order("kind"),
    admin.from("nutrition_profiles").select("goal, sex, has_scale, activity_level").eq("user_id", id).single(),
  ])
  expect(profile).toMatchObject({ units: "imperial", date_of_birth: "1991-03-02", medical_flag: true })
  expect(profile?.onboarding_completed_at).not.toBeNull()
  expect(targets).toHaveLength(1)
  expect(targets![0]).toMatchObject({ set_by: "formula", protein_g: 181 })
  expect(weights).toEqual([{ weight_kg: 89.81 }])
  expect(consents).toEqual([
    { kind: "coach_visibility", version: "2026-10-12" },
    { kind: "disclaimer", version: "draft-2026-10" },
    { kind: "privacy", version: "draft-2026-10" },
    { kind: "terms", version: "draft-2026-10" },
  ])
  expect(nutrition).toEqual({ goal: "lose_fat", sex: "male", has_scale: false, activity_level: "moderate" })

  // Finished users are not sent back.
  await page.goto("/onboarding")
  await expect(page).toHaveURL(/\/today$/)
})

test("under 18 stops at the date of birth and saves nothing", async ({ page }, info) => {
  await signInWithCode(page, `e2e-minor-${info.project.name}-${Date.now()}@example.test`, { onboarded: false })
  await next(page)
  await choose(page, "Goal", "Maintain")
  await next(page)
  await choose(page, "Sex", "Female")
  await next(page)
  const year = new Date().getFullYear() - 16
  await page.getByLabel("Date of birth").fill(`${year}-06-01`)
  await next(page)
  await expect(page.getByRole("heading", { name: "Honest Reps is for adults 18 and over for now." })).toBeVisible()
  await page.getByRole("button", { name: "Sign out" }).click()
  await page.waitForURL("**/sign-in")
})

/** Answers every onboarding question up to the targets screen. */
async function answerAll(page: Page) {
  await next(page)
  await choose(page, "Goal", "Build muscle")
  await next(page)
  await choose(page, "Sex", "Female")
  await next(page)
  await page.getByLabel("Date of birth").fill("1988-08-08")
  await next(page)
  await page.getByLabel("Feet").fill("5")
  await page.getByLabel("Inches").fill("6")
  await next(page)
  await page.getByLabel("Current weight (lb)").fill("150")
  await next(page)
  await choose(page, "Activity", "Light")
  await next(page)
  await choose(page, "Food scale", "Yes")
  await next(page)
  await choose(page, "Medical condition", "No")
  await next(page)
  await page.getByLabel("I understand this is general nutrition information, not medical advice.").check()
  await page.getByLabel("I accept the terms.").check()
  await page.getByLabel("I accept the privacy policy.").check()
  await next(page)
  // PRD F1: the targets are on screen before Start logging.
  await expect(page.getByRole("heading", { name: "Your starting targets" })).toBeVisible()
  for (const label of ["Protein", "Carbs", "Fat", "Calories"]) await expect(page.getByText(label, { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Start logging" })).toBeEnabled()
}

async function userId(email: string) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  return data.users.find((u) => u.email === email)!.id
}

async function saved(id: string) {
  const [targets, weights, consents] = await Promise.all([
    admin.from("targets").select("id", { count: "exact", head: true }).eq("user_id", id),
    admin.from("weights").select("id", { count: "exact", head: true }).eq("user_id", id),
    admin.from("consents").select("id", { count: "exact", head: true }).eq("user_id", id).neq("kind", "coach_visibility"),
  ])
  return { targets: targets.count, weights: weights.count, consents: consents.count }
}

test("a coach account with no coach of its own onboards itself (bug 2026-10-16)", async ({ page }, info) => {
  const email = `e2e-coachself-${info.project.name}-${Date.now()}@example.test`
  await signInWithCode(page, email, { onboarded: false })
  const id = await userId(email)
  await admin.from("profiles").update({ role: "coach", coach_id: null }).eq("id", id)
  await page.reload()
  await answerAll(page)
  await page.getByRole("button", { name: "Start logging" }).click()
  await page.waitForURL("**/today")
  expect(await saved(id)).toEqual({ targets: 1, weights: 1, consents: 3 })
})

test("a member with no coach gets targets from the default coach's settings", async ({ page }, info) => {
  const email = `e2e-nocoach-${info.project.name}-${Date.now()}@example.test`
  await signInWithCode(page, email, { onboarded: false })
  const id = await userId(email)
  await admin.from("profiles").update({ coach_id: null }).eq("id", id)
  await page.reload()
  await answerAll(page)
  await page.getByRole("button", { name: "Start logging" }).click()
  await page.waitForURL("**/today")
  expect(await saved(id)).toEqual({ targets: 1, weights: 1, consents: 3 })
})

test("a save that fails can be retried and nothing is saved twice", async ({ page }, info) => {
  const email = `e2e-retry-${info.project.name}-${Date.now()}@example.test`
  await signInWithCode(page, email, { onboarded: false })
  await answerAll(page)

  // The first save never reaches the server.
  let blocked = false
  await page.route("**/onboarding", async (route) => {
    if (route.request().method() === "POST" && !blocked) {
      blocked = true
      return route.abort("internetdisconnected")
    }
    return route.continue()
  })
  await page.getByRole("button", { name: "Start logging" }).click()
  await expect(page.getByText("Could not reach Honest Reps. Check your connection and try again. Nothing is saved twice.")).toBeVisible()

  await page.getByRole("button", { name: "Start logging" }).click()
  await page.waitForURL("**/today")
  expect(await saved(await userId(email))).toEqual({ targets: 1, weights: 1, consents: 3 })
})
