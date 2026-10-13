import { expect, test, type Page } from "@playwright/test"
import { expectNoAxeViolations, expectTapTargets, signInWithCode } from "./helpers"

// The log loop at 375px (PRD F2, QUESTIONS.md Q34). /api/parse is replaced
// with a fixed draft so the test never calls the model or USDA; saving goes
// through the real /api/entries and database.
const per = (kcal: number, protein: number, carbs: number, fat: number) => ({ kcal, protein_g: protein, carbs_g: carbs, fat_g: fat })
const food = (sourceId: string, name: string, per100g: ReturnType<typeof per>) => ({
  source: "usda",
  sourceId,
  name,
  brand: null,
  dataType: "SR Legacy",
  state: null,
  per100g,
  foodItemId: null,
})
const draft = {
  aiCallId: null,
  fallback: false,
  unparsedText: "",
  items: [
    {
      name: "white rice",
      brand: null,
      quantity: 1,
      unit: "cup",
      grams: 158,
      amountSource: "estimated",
      state: "cooked",
      confidence: 0.6,
      match: { ...food("1", "Rice, white, cooked", per(130, 2.7, 28, 0.3)), state: "cooked" },
      matchScore: 0.9,
      calories: 205,
      proteinG: 4.3,
      carbsG: 44.2,
      fatG: 0.5,
      flagged: true,
      flagReason: "amount",
      alternatives: [],
      foodItemId: null,
    },
    {
      name: "chicken",
      brand: null,
      quantity: 1,
      unit: "palm",
      grams: 100,
      amountSource: "hand",
      state: "cooked",
      confidence: 0.75,
      match: food("2", "Chicken breast tenders, breaded", per(263, 18, 15, 14)),
      matchScore: 0.3,
      calories: 263,
      proteinG: 18,
      carbsG: 15,
      fatG: 14,
      flagged: true,
      flagReason: "match",
      alternatives: [food("3", "Chicken, broilers or fryers, breast, meat only, cooked, roasted", per(165, 31, 0, 3.6))],
      foodItemId: null,
    },
  ],
}

async function stubParse(page: Page) {
  await page.route("**/api/parse", (route) => route.fulfill({ json: draft }))
}

async function describeMeal(page: Page) {
  await page.getByLabel("What did you eat?").fill("a cup of rice and a palm of chicken")
  await page.getByRole("button", { name: "Log meal" }).click()
  return page.getByRole("dialog", { name: "Your meal" })
}

test("describe a meal, fix it on the card, log it", async ({ page }, info) => {
  await signInWithCode(page, `e2e-log-${info.project.name}-${Date.now()}@example.test`)
  await stubParse(page)
  const card = await describeMeal(page)

  await expect(card).toBeVisible()
  // One signal per row, by cause (Q34).
  await expect(card.getByText("Estimated")).toBeVisible()
  await expect(card.getByText("Check this")).toBeVisible()
  await expectNoAxeViolations(page)
  await expectTapTargets(page)
  await page.screenshot({ path: info.outputPath("card.png"), fullPage: true })

  // Weigh it focuses the amount; typing a weight resolves Estimated.
  await card.getByRole("button", { name: "Weigh it" }).click()
  const riceAmount = card.getByRole("spinbutton").first()
  await expect(riceAmount).toBeFocused()
  await card.getByRole("radio", { name: "g" }).first().click()
  await riceAmount.fill("180")
  await expect(card.getByText("Estimated")).toHaveCount(0)

  // Picking the right food resolves Check this.
  await card.getByRole("button", { name: /meat only, cooked, roasted/ }).click()
  await expect(card.getByText("Check this")).toHaveCount(0)
  await expect(card.getByText("Hand portion")).toBeVisible()

  await card.getByRole("button", { name: "Log it" }).click()
  await expect(card).toHaveCount(0)
  const timeline = page.getByRole("list", { name: "Today's entries" })
  await expect(timeline).toContainText("white rice")
  await expect(timeline).toContainText("white rice, chicken")
  await page.screenshot({ path: info.outputPath("today.png"), fullPage: true })
})

test("an unconfirmed card comes back after reopening the app", async ({ page }, info) => {
  await signInWithCode(page, `e2e-draft-${info.project.name}-${Date.now()}@example.test`)
  await stubParse(page)
  const card = await describeMeal(page)
  await expect(card).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(card).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole("dialog", { name: "Your meal" })).toBeVisible()
  await page.getByRole("button", { name: "Discard" }).click()
  await page.reload()
  await expect(page.getByRole("dialog", { name: "Your meal" })).toHaveCount(0)
})
