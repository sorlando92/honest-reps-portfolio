import { expect, test } from "@playwright/test"
import { admin, expectNoAxeViolations, expectTapTargets, signInWithCode, TEST_TARGETS } from "./helpers"

// PRD F1 target editing in Me at 375px: free users edit their own with the
// BMR floor; paid clients see their targets read only.

async function userId(email: string) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  return data.users.find((u) => u.email === email)!.id
}

/** Body data whose calorie floor is about 1,750 (BMR from Mifflin St Jeor at age 36). */
async function body(id: string) {
  await admin.from("profiles").update({ date_of_birth: "1990-01-01" }).eq("id", id)
  await admin.from("nutrition_profiles").upsert({ user_id: id, sex: "male", height_cm: 180, goal: "maintain", activity_level: "moderate" })
  await admin.from("weights").upsert({ user_id: id, date: "2026-01-01", weight_kg: 80 })
}

test("a free user edits targets; below the floor asks first", async ({ page }, info) => {
  const email = `e2e-targets-${info.project.name}-${Date.now()}@example.test`
  await signInWithCode(page, email)
  const id = await userId(email)
  await body(id)
  await page.goto("/me")
  const targets = page.getByRole("region", { name: "Targets" })
  await expect(targets.getByLabel("Calories (kcal)")).toHaveValue(String(TEST_TARGETS.calories))
  await expectNoAxeViolations(page)
  await expectTapTargets(page)

  await targets.getByLabel("Protein (g)").fill("180")
  await targets.getByRole("button", { name: "Save targets" }).click()
  await expect(targets.getByRole("status")).toHaveText("Saved.")

  await targets.getByLabel("Calories (kcal)").fill("1500")
  await targets.getByRole("button", { name: "Save targets" }).click()
  await expect(targets.getByRole("alert")).toContainText(/1,500 calories is below your estimated resting burn of 1,7\d0\./)
  await targets.getByRole("button", { name: "Save anyway" }).click()
  await expect(targets.getByRole("status")).toHaveText("Saved.")

  const { data } = await admin.from("targets").select("calories, protein_g, set_by").eq("user_id", id).order("effective_from", { ascending: false }).limit(1).single()
  expect(data).toEqual({ calories: 1500, protein_g: 180, set_by: "user" })

  // Today uses the new targets.
  await page.goto("/today")
  await expect(page.getByRole("region", { name: "Macros" }).getByRole("img", { name: "Calories, 0 of 1,500" })).toBeVisible()
})

test("the API refuses a below floor save without the confirmation", async ({ page }, info) => {
  const email = `e2e-targets-api-${info.project.name}-${Date.now()}@example.test`
  await signInWithCode(page, email)
  await body(await userId(email))
  const res = await page.request.post("/api/targets", { data: { calories: 1200, proteinG: 150, carbsG: 100, fatG: 40 } })
  expect(res.status()).toBe(409)
})

test("a paid client sees coach targets read only", async ({ page }, info) => {
  const email = `e2e-targets-paid-${info.project.name}-${Date.now()}@example.test`
  await signInWithCode(page, email)
  const id = await userId(email)
  await admin.from("profiles").update({ tier: "paid", billing_source: "comped" }).eq("id", id)
  // Accepted the state disclosure already (PRD F16), so the app does not ask first.
  await admin.from("consents").insert({ user_id: id, kind: "mo_disclosure", version: "draft-2026-10" })
  await admin.from("targets").insert({ user_id: id, calories: 2400, protein_g: 190, carbs_g: 250, fat_g: 75, set_by: "coach" })
  await page.goto("/me")
  const targets = page.getByRole("region", { name: "Targets" })
  await expect(targets).toContainText("2,400 kcal")
  await expect(targets).toContainText("Set by your coach.")
  await expect(targets.getByRole("textbox")).toHaveCount(0)
  const res = await page.request.post("/api/targets", { data: { calories: 2000, proteinG: 150, carbsG: 200, fatG: 60, belowFloorConfirmed: true } })
  expect(res.status()).toBe(403)
})
