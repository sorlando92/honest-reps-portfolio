import { expect, test, type Page } from "@playwright/test"
import { expectNoAxeViolations, expectTapTargets, signInWithCode } from "./helpers"

// Food search, Add item and manual entry at 375px (PRD F2). /api/foods/search
// and /api/parse are stubbed so the tests never call USDA or the model; the
// stubbed foods have no food_items rows, so they save with no food reference.
const chicken = {
  foodItemId: "00000000-0000-4000-8000-000000000001",
  source: "usda",
  sourceId: "171477",
  name: "Chicken, broilers or fryers, breast, meat only, cooked, roasted",
  brand: null,
  dataType: "SR Legacy",
  state: "cooked",
  per100g: { kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 },
  serving: null,
}
const nuggets = {
  foodItemId: "00000000-0000-4000-8000-000000000002",
  source: "custom",
  sourceId: "chick-fil-a:Chick-fil-A Nuggets",
  name: "Chick-fil-A Nuggets",
  brand: "Chick-fil-A",
  dataType: "Curated",
  state: null,
  per100g: { kcal: 221, protein_g: 23.9, carbs_g: 9.7, fat_g: 9.7 },
  serving: { label: "8 ct", grams: 113, kcal: 250, protein_g: 27, carbs_g: 11, fat_g: 11 },
}

async function stubSearch(page: Page) {
  await page.route("**/api/foods/search?*", (route) => {
    const q = new URL(route.request().url()).searchParams.get("q") ?? ""
    route.fulfill({ json: { results: /nugget/i.test(q) ? [nuggets] : /chicken/i.test(q) ? [chicken] : [] } })
  })
  // Remove the stubbed food ids before saving; they are not real rows.
  await page.route("**/api/entries", async (route) => {
    const body = route.request().postDataJSON()
    for (const item of body.items) item.foodItemId = null
    await route.continue({ postData: JSON.stringify(body) })
  })
}

test("search a food from the log bar, weigh it, log it", async ({ page }, info) => {
  await signInWithCode(page, `e2e-search-${info.project.name}-${Date.now()}@example.test`)
  await stubSearch(page)

  await page.getByRole("button", { name: "Search foods" }).click()
  const sheet = page.getByRole("dialog", { name: "Add food" })
  await sheet.getByLabel("Search foods").fill("chicken breast")
  await sheet.getByRole("button", { name: "Search", exact: true }).click()
  await expectNoAxeViolations(page)
  await expectTapTargets(page)
  await page.screenshot({ path: info.outputPath("search.png"), fullPage: true })
  await sheet.getByRole("button", { name: /Chicken, broilers/ }).click()

  // A searched food starts at 100 g, estimated, until it is weighed.
  const card = page.getByRole("dialog", { name: "Your meal" })
  await expect(card.getByText("Estimated")).toBeVisible()
  await card.getByRole("radio", { name: "g" }).click()
  await card.getByRole("spinbutton").fill("150")
  await expect(card.getByText("Estimated")).toHaveCount(0)
  await expect(card.getByText("248 cal · 46.5 g protein", { exact: true })).toBeVisible()
  await card.getByRole("button", { name: "Log it" }).click()

  const timeline = page.getByRole("list", { name: "Today's entries" })
  await expect(timeline).toContainText("Chicken, broilers or fryers")
  await expect(timeline).toContainText("248")
})

test("add a curated item and a food entered by hand to a described meal", async ({ page }, info) => {
  await signInWithCode(page, `e2e-add-${info.project.name}-${Date.now()}@example.test`)
  await stubSearch(page)
  await page.route("**/api/parse", (route) =>
    route.fulfill({
      json: {
        aiCallId: null,
        fallback: false,
        unparsedText: "",
        items: [
          {
            name: "chicken",
            brand: null,
            quantity: 6,
            unit: "oz",
            grams: 170,
            amountSource: "weighed",
            state: "cooked",
            confidence: 0.95,
            match: { source: "usda", sourceId: "9", name: "Chicken tenders, breaded", brand: null, dataType: "SR Legacy", state: null, per100g: { kcal: 263, protein_g: 18, carbs_g: 15, fat_g: 14 } },
            matchScore: 0.3,
            calories: 447,
            proteinG: 30.6,
            carbsG: 25.5,
            fatG: 23.8,
            flagged: true,
            flagReason: "match",
            alternatives: [],
            foodItemId: null,
          },
        ],
      },
    })
  )
  await page.getByLabel("What did you eat?").fill("6 oz chicken")
  await page.getByRole("button", { name: "Log meal" }).click()
  const card = page.getByRole("dialog", { name: "Your meal" })
  await expect(card.getByText("Check this")).toBeVisible()

  // Change food: searching from the row picks a better match and keeps 170 g.
  await card.getByRole("button", { name: "Change food for chicken" }).click()
  const change = page.getByRole("dialog", { name: "Change food" })
  await expect(change.getByLabel("Search foods")).toHaveValue("chicken")
  await change.getByRole("button", { name: "Search", exact: true }).click()
  await change.getByRole("button", { name: /Chicken, broilers/ }).click()
  await expect(card.getByText("Check this")).toHaveCount(0)
  await expect(card.getByText("281 cal · 52.7 g protein", { exact: true })).toBeVisible()

  // Add item: a curated chain item at its published serving.
  await card.getByRole("button", { name: "Add item" }).click()
  const add = page.getByRole("dialog", { name: "Add food" })
  await add.getByLabel("Search foods").fill("chick fil a nuggets")
  await add.getByRole("button", { name: "Search", exact: true }).click()
  await add.getByRole("button", { name: /Chick-fil-A Nuggets/ }).click()
  await expect(card.getByText("531 cal · 79.7 g protein", { exact: true })).toBeVisible()
  // Label items step in their published serving (PM 2026-10-15): half a serving more, then back.
  await expect(card.getByLabel("Servings")).toHaveValue("1")
  await expect(card.getByText(/^8 ct, /)).toBeVisible()
  await card.getByRole("button", { name: "More Chick-fil-A Nuggets" }).click()
  await expect(card.getByText("656 cal · 93.2 g protein", { exact: true })).toBeVisible()
  await card.getByRole("button", { name: "Less Chick-fil-A Nuggets" }).click()
  await expect(card.getByText("531 cal · 79.7 g protein", { exact: true })).toBeVisible()

  // Add item, entered by hand.
  await card.getByRole("button", { name: "Add item" }).click()
  await add.getByRole("button", { name: "Enter it yourself" }).click()
  await add.getByLabel("Food", { exact: true }).fill("protein bar")
  await add.getByLabel("Weight (oz)").fill("2")
  await add.getByLabel("Calories").fill("210")
  await add.getByLabel("Protein (g)").fill("20")
  await expectNoAxeViolations(page)
  await expectTapTargets(page)
  await page.screenshot({ path: info.outputPath("manual.png"), fullPage: true })
  await add.getByRole("button", { name: "Add", exact: true }).click()
  await expect(card.getByText("741 cal · 99.7 g protein", { exact: true })).toBeVisible()

  await card.getByRole("button", { name: "Log it" }).click()
  const timeline = page.getByRole("list", { name: "Today's entries" })
  // The stub has no ai_calls row, so there is no raw input and the title is the item names.
  await expect(timeline).toContainText("chicken, Chick-fil-A Nuggets, protein bar")
  await expect(timeline).toContainText("741")
})

test("when parsing fails, search opens with what was typed", async ({ page }, info) => {
  await signInWithCode(page, `e2e-fallback-${info.project.name}-${Date.now()}@example.test`)
  await stubSearch(page)
  await page.route("**/api/parse", (route) => route.fulfill({ json: { aiCallId: null, fallback: true, unparsedText: "chicken thing", items: [] } }))
  await page.getByLabel("What did you eat?").fill("chicken thing")
  await page.getByRole("button", { name: "Log meal" }).click()
  const sheet = page.getByRole("dialog", { name: "Add food" })
  await expect(sheet.getByLabel("Search foods")).toHaveValue("chicken thing")
})

test("Raw, Cooked or Dry recalculates from the food in that state", async ({ page }, info) => {
  await signInWithCode(page, `e2e-state-${info.project.name}-${Date.now()}@example.test`)
  await stubSearch(page)
  await page.route("**/api/foods/state?*", (route) => {
    const state = new URL(route.request().url()).searchParams.get("state")
    route.fulfill({
      json: {
        result:
          state === "dry"
            ? { ...chicken, sourceId: "169756", name: "Rice, white, long-grain, regular, raw, enriched", state: "dry", per100g: { kcal: 365, protein_g: 7.1, carbs_g: 80, fat_g: 0.7 } }
            : null,
      },
    })
  })
  await page.route("**/api/foods/search?*", (route) =>
    route.fulfill({ json: { results: [{ ...chicken, sourceId: "168878", name: "Rice, white, long-grain, regular, cooked", per100g: { kcal: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3 }, portion: { label: "1 cup", grams: 158 } }] } })
  )
  await page.getByRole("button", { name: "Search foods" }).click()
  const add = page.getByRole("dialog", { name: "Add food" })
  await add.getByLabel("Search foods").fill("white rice")
  await add.getByRole("button", { name: "Search", exact: true }).click()
  await add.getByRole("button", { name: /Rice, white/ }).click()

  // Starts at the common portion: 1 cup, 158 g cooked.
  const card = page.getByRole("dialog", { name: "Your meal" })
  await expect(card.getByText("205 cal · 4.3 g protein", { exact: true })).toBeVisible()
  const toggle = card.getByRole("radiogroup", { name: /Raw, cooked or dry/ })
  await expect(toggle.getByRole("radio", { name: "Cooked" })).toHaveAttribute("aria-checked", "true")
  await expectTapTargets(page)

  await toggle.getByRole("radio", { name: "Dry" }).click()
  await expect(toggle.getByRole("radio", { name: "Dry" })).toHaveAttribute("aria-checked", "true")
  await expect(card.getByText("577 cal · 11.2 g protein", { exact: true })).toBeVisible()

  // No raw entry: the row stays as it was and says so.
  await toggle.getByRole("radio", { name: "Raw" }).click()
  await expect(card.getByText("No raw entry found. Kept as it was.")).toBeVisible()
  await expect(toggle.getByRole("radio", { name: "Dry" })).toHaveAttribute("aria-checked", "true")
})

test("the log bar shows search and barcode until the user types, then send", async ({ page }, info) => {
  await signInWithCode(page, `e2e-bar-${info.project.name}-${Date.now()}@example.test`)
  const bar = page.locator("form").filter({ has: page.getByLabel("What did you eat?") })
  await expect(bar.getByRole("button")).toHaveCount(2)
  await expect(bar.getByRole("button", { name: "Search foods" })).toBeVisible()
  await expect(bar.getByRole("button", { name: "Scan a barcode" })).toBeVisible()
  await page.getByLabel("What did you eat?").fill("2 eggs")
  await expect(bar.getByRole("button")).toHaveCount(1)
  await expect(bar.getByRole("button", { name: "Log meal" })).toBeVisible()
})

test("a typed barcode logs the product by the serving, with attribution", async ({ page }, info) => {
  await signInWithCode(page, `e2e-barcode-${info.project.name}-${Date.now()}@example.test`)
  await stubSearch(page)
  await page.route("**/api/foods/barcode/*", (route) => {
    const code = route.request().url().split("/").pop()
    route.fulfill({
      json: {
        result:
          code === "0894700010045"
            ? {
                foodItemId: "00000000-0000-4000-8000-000000000003",
                source: "off",
                sourceId: code,
                name: "Greek Yogurt Plain",
                brand: "Fage",
                dataType: "Open Food Facts",
                state: null,
                per100g: { kcal: 97, protein_g: 9, carbs_g: 3.9, fat_g: 5 },
                serving: { label: "1 container (170 g)", grams: 170, kcal: 165, protein_g: 15.3, carbs_g: 6.6, fat_g: 8.5 },
                portion: null,
              }
            : null,
      },
    })
  })

  await page.getByRole("button", { name: "Scan a barcode" }).click()
  const scan = page.getByRole("dialog", { name: "Scan a barcode" })
  // Headless browsers have no camera: the sheet says so and the number works.
  await expect(scan.getByText("The camera is not available. Type the number under the barcode instead.")).toBeVisible()
  await expectNoAxeViolations(page)
  await expectTapTargets(page)

  await scan.getByLabel("Barcode number").fill("1234 5678 9")
  await scan.getByRole("button", { name: "Look up" }).click()
  await expect(scan.getByText("We do not have that product yet. Search for it or enter it yourself.")).toBeVisible()
  await scan.getByLabel("Barcode number").fill("0894700010045")
  await scan.getByRole("button", { name: "Look up" }).click()

  const card = page.getByRole("dialog", { name: "Your meal" })
  await expect(card.getByLabel("Servings")).toHaveValue("1")
  await expect(card.getByText("165 cal · 15.3 g protein", { exact: true })).toBeVisible()
  await expect(card.getByRole("link", { name: "Open Food Facts" })).toHaveAttribute("href", "https://openfoodfacts.org")
  await page.screenshot({ path: info.outputPath("barcode.png"), fullPage: true })
  await card.getByRole("button", { name: "Log it" }).click()
  await expect(page.getByRole("list", { name: "Today's entries" })).toContainText("Greek Yogurt Plain")
})
