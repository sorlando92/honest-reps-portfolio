import { expect, test, type Page } from "@playwright/test"
import { expectNoAxeViolations, expectTapTargets, signInWithCode } from "./helpers"

// Today v2 meal sections (docs/TODAY_SPEC.md 6) at 375px. /api/parse is
// stubbed; saving goes through the real API and database.
const parsed = {
  aiCallId: null,
  fallback: false,
  unparsedText: "",
  items: [
    {
      name: "turkey sandwich",
      brand: null,
      quantity: 1,
      unit: "piece",
      grams: 200,
      amountSource: "measured",
      state: null,
      confidence: 0.9,
      match: { source: "usda", sourceId: "7", name: "Turkey sandwich", brand: null, dataType: "Survey (FNDDS)", state: null, per100g: { kcal: 230, protein_g: 14, carbs_g: 24, fat_g: 8 } },
      matchScore: 0.9,
      calories: 460,
      proteinG: 28,
      carbsG: 48,
      fatG: 16,
      flagged: false,
      flagReason: null,
      alternatives: [],
      foodItemId: null,
    },
  ],
}

async function stubParse(page: Page) {
  await page.route("**/api/parse", (route) => route.fulfill({ json: parsed }))
}

const section = (page: Page, name: string) => page.getByRole("list", { name: `${name} entries` })

test("sections are always shown; + picks the meal and the card can change it", async ({ page }, info) => {
  await signInWithCode(page, `e2e-meals-${info.project.name}-${Date.now()}@example.test`)
  await stubParse(page)
  for (const name of ["Breakfast", "Lunch", "Dinner", "Snacks"]) {
    await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible()
  }

  await page.getByRole("button", { name: "Add to Lunch" }).click()
  const bar = page.getByLabel("What did you eat?")
  await expect(bar).toBeFocused()
  await expect(bar).toHaveAttribute("placeholder", "What did you have for lunch?")
  await bar.fill("turkey sandwich")
  await page.getByRole("button", { name: "Log meal" }).click()

  const card = page.getByRole("dialog", { name: "Your meal" })
  const meal = card.getByRole("radiogroup", { name: "Meal" })
  await expect(meal.getByRole("radio", { name: "Lunch" })).toHaveAttribute("aria-checked", "true")
  await expectNoAxeViolations(page)
  await expectTapTargets(page)
  await meal.getByRole("radio", { name: "Dinner" }).click()
  await card.getByRole("button", { name: "Log it" }).click()
  await expect(card).toHaveCount(0)

  await expect(section(page, "Dinner")).toContainText("turkey sandwich")
  await expect(page.getByRole("region", { name: "Dinner" })).toContainText("460 cal · 28 g protein")

  // Edit moves it to another meal.
  await section(page, "Dinner").locator("summary").click()
  await page.getByRole("button", { name: "Edit turkey sandwich" }).click()
  const editor = page.getByRole("dialog", { name: "Edit entry" })
  await editor.getByRole("radiogroup", { name: "Meal" }).getByRole("radio", { name: "Breakfast" }).click()
  await editor.getByRole("button", { name: "Save" }).click()
  await expect(section(page, "Breakfast")).toContainText("turkey sandwich")
  await expect(section(page, "Dinner")).toHaveCount(0)
  await page.screenshot({ path: info.outputPath("sections.png"), fullPage: true })
})

test("copy yesterday's lunch logs the same items today", async ({ page }, info) => {
  await signInWithCode(page, `e2e-copy-${info.project.name}-${Date.now()}@example.test`)
  // Yesterday's lunch, saved through the real API.
  const saved = await page.request.post("/api/entries", {
    data: {
      clientUuid: crypto.randomUUID(),
      loggedAt: new Date(Date.now() - 86_400_000).toISOString(),
      method: "manual",
      meal: "lunch",
      aiCallId: null,
      items: [{ ...toItem(parsed.items[0]) }],
    },
  })
  expect(saved.status()).toBe(201)
  await page.reload()
  await expect(section(page, "Lunch")).toHaveCount(0)

  await page.getByRole("button", { name: "More for Lunch" }).click()
  await expectNoAxeViolations(page)
  await page.getByRole("menuitem", { name: "Copy yesterday's lunch" }).click()
  await expect(page.getByText("Copied.")).toBeVisible()
  await expect(section(page, "Lunch")).toContainText("turkey sandwich")
  await expect(section(page, "Lunch")).toContainText("460")
})

function toItem(i: (typeof parsed.items)[number]) {
  return {
    name: i.name,
    foodItemId: null,
    amount: i.quantity,
    unit: i.unit,
    grams: i.grams,
    amountSource: i.amountSource,
    state: i.state,
    calories: i.calories,
    proteinG: i.proteinG,
    carbsG: i.carbsG,
    fatG: i.fatG,
    flagReason: null,
    confidence: null,
  }
}
