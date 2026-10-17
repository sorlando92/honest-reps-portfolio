import { expect, test, type Page } from "@playwright/test"
import { expectNoAxeViolations, expectTapTargets, signInWithCode } from "./helpers"

// Food lookup at 375px (docs/FOOD_LOOKUP_SPEC.md, PRD F2): one bar for
// search and AI, search inside the card, barcode with confirmation, Not
// this, label scan and custom foods. /api/foods/search, /api/parse and the
// barcode lookups are stubbed where CI has no FDC import or network; custom
// foods and the user's own barcode lookups run for real.
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
  portion: null as { label: string; grams: number } | null,
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
  portion: null as { label: string; grams: number } | null,
}
const yogurt = {
  foodItemId: "00000000-0000-4000-8000-000000000003",
  source: "off",
  sourceId: "00894700010045",
  name: "Greek Yogurt Plain",
  brand: "Fage",
  dataType: "Open Food Facts",
  state: null,
  per100g: { kcal: 97, protein_g: 9, carbs_g: 3.9, fat_g: 5 },
  serving: { label: "1 container (170 g)", grams: 170, kcal: 165, protein_g: 15.3, carbs_g: 6.6, fat_g: 8.5 },
  portion: null as { label: string; grams: number } | null,
  barcode: "00894700010045",
  imageUrl: null,
}

type Food = typeof chicken | typeof nuggets | typeof yogurt
const hit = (section: "mine" | "brands" | "basic", food: Food, servingLabel: string, kcal: number) => ({
  ref: `item:${food.foodItemId}`,
  section,
  name: food.name,
  brand: food.brand,
  servingLabel,
  kcal,
  food,
})

const NO_RESULTS = { mine: [], brands: [], basic: [] }

async function stubSearch(page: Page, extra: (q: string) => object | null = () => null) {
  await page.route("**/api/foods/search?*", (route) => {
    const q = new URL(route.request().url()).searchParams.get("q") ?? ""
    const sections = extra(q) ?? (/nugget/i.test(q)
      ? { ...NO_RESULTS, brands: [hit("brands", nuggets, "8 ct (113 g)", 250)] }
      : /chicken/i.test(q)
        ? { ...NO_RESULTS, basic: [hit("basic", chicken, "100 g", 165)] }
        : /yogurt|fage/i.test(q)
          ? { ...NO_RESULTS, brands: [hit("brands", { ...yogurt, foodItemId: "00000000-0000-4000-8000-000000000004", name: "Total 2% Greek Yogurt" }, "1 container (170 g)", 150)] }
          : NO_RESULTS)
    route.fulfill({ json: { sections } })
  })
  // Remove the stubbed food ids before saving; they are not real rows.
  await page.route("**/api/entries", async (route) => {
    const body = route.request().postDataJSON()
    for (const item of body.items) if (item.foodItemId?.startsWith("00000000-")) item.foodItemId = null
    if (body.scanId?.startsWith("00000000-")) body.scanId = null
    await route.continue({ postData: JSON.stringify(body) })
  })
}

/** Fails the test if the model is called (acceptance 2: tapping a result never calls it). */
async function forbidParse(page: Page) {
  const calls: string[] = []
  await page.route("**/api/parse", (route) => {
    calls.push(route.request().url())
    route.fulfill({ status: 500, json: {} })
  })
  return calls
}

test("typing in the log bar shows results; a tapped result opens the card without the model", async ({ page }, info) => {
  await signInWithCode(page, `e2e-search-${info.project.name}-${Date.now()}@example.test`)
  await stubSearch(page)
  const parses = await forbidParse(page)

  await page.getByLabel("What did you eat?").fill("chicken breast")
  const results = page.getByRole("region", { name: "Food search results" })
  await expect(results.getByRole("button", { name: "Describe with AI: chicken breast" })).toBeVisible()
  await expect(results.getByRole("heading", { name: "Basic foods" })).toBeVisible()
  await expectNoAxeViolations(page)
  await expectTapTargets(page)
  await page.screenshot({ path: info.outputPath("search.png"), fullPage: true })
  await results.getByRole("button", { name: /Chicken, broilers/ }).click()

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
  expect(parses).toEqual([])
})

test("Enter and Describe with AI always run AI parsing", async ({ page }, info) => {
  await signInWithCode(page, `e2e-ai-row-${info.project.name}-${Date.now()}@example.test`)
  await stubSearch(page)
  const texts: string[] = []
  await page.route("**/api/parse", (route) => {
    texts.push(route.request().postDataJSON().text)
    route.fulfill({ json: { aiCallId: null, fallback: true, unparsedText: "", items: [] } })
  })
  const field = page.getByLabel("What did you eat?")
  await field.fill("chicken and rice")
  await expect(page.getByRole("button", { name: "Describe with AI: chicken and rice" })).toBeVisible()
  await field.press("Enter")
  await expect.poll(() => texts).toEqual(["chicken and rice"])
  await page.getByRole("button", { name: "Cancel" }).click()

  await field.fill("two eggs")
  await page.getByRole("button", { name: "Describe with AI: two eggs" }).click()
  await expect.poll(() => texts).toEqual(["chicken and rice", "two eggs"])
})

test("no match offers AI, the label and entering it yourself", async ({ page }, info) => {
  await signInWithCode(page, `e2e-nomatch-${info.project.name}-${Date.now()}@example.test`)
  await stubSearch(page)
  await page.getByLabel("What did you eat?").fill("zzqx")
  const results = page.getByRole("region", { name: "Food search results" })
  await expect(results.getByText("No match for ‘zzqx’. Describe it with AI, scan the label, or enter it yourself.")).toBeVisible()
  await expect(results.getByRole("button", { name: "Describe it with AI" })).toBeVisible()
  await expect(results.getByRole("button", { name: "Scan the label" })).toBeVisible()
  await expectNoAxeViolations(page)
  await results.getByRole("button", { name: "Enter it yourself" }).click()
  await expect(page.getByRole("dialog", { name: "Add food" }).getByLabel("Food", { exact: true })).toHaveValue("zzqx")
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

  // Change food: results appear as the search opens and keep 170 g.
  await card.getByRole("button", { name: "Change food for chicken" }).click()
  const change = page.getByRole("dialog", { name: "Change food" })
  await expect(change.getByLabel("Search foods")).toHaveValue("chicken")
  await change.getByRole("button", { name: /Chicken, broilers/ }).click()
  await expect(card.getByText("Check this")).toHaveCount(0)
  await expect(card.getByText("281 cal · 52.7 g protein", { exact: true })).toBeVisible()

  // Add item: a curated chain item at its published serving.
  await card.getByRole("button", { name: "Add item" }).click()
  const add = page.getByRole("dialog", { name: "Add food" })
  await add.getByLabel("Search foods").fill("chick fil a nuggets")
  await add.getByRole("button", { name: /Chick-fil-A Nuggets/ }).click()
  await expect(card.getByText("531 cal · 79.7 g protein", { exact: true })).toBeVisible()
  await expect(card.getByLabel("Servings")).toHaveValue("1")
  await expect(card.getByText(/^8 ct, /)).toBeVisible()
  await card.getByRole("button", { name: "More Chick-fil-A Nuggets" }).click()
  await expect(card.getByText("656 cal · 93.2 g protein", { exact: true })).toBeVisible()
  await card.getByRole("button", { name: "Less Chick-fil-A Nuggets" }).click()
  await expect(card.getByText("531 cal · 79.7 g protein", { exact: true })).toBeVisible()

  // Add item, entered by hand: saved as a custom food (FOOD_LOOKUP_SPEC 4), one serving on the card.
  await card.getByRole("button", { name: "Add item" }).click()
  await add.getByRole("button", { name: "Enter it yourself" }).last().click()
  await add.getByLabel("Food", { exact: true }).fill("protein bar")
  await add.getByLabel("Serving size").fill("2")
  await add.getByLabel("Unit").selectOption("oz")
  await add.getByLabel("Calories").fill("210")
  await add.getByLabel("Protein (g)").fill("20")
  await add.getByLabel("Carbs (g)").fill("22")
  await add.getByLabel("Fat (g)").fill("7")
  await expectNoAxeViolations(page)
  await expectTapTargets(page)
  await page.screenshot({ path: info.outputPath("manual.png"), fullPage: true })
  await add.getByRole("button", { name: "Save and add" }).click()
  await expect(card.getByText("741 cal · 99.7 g protein", { exact: true })).toBeVisible()

  await card.getByRole("button", { name: "Log it" }).click()
  const timeline = page.getByRole("list", { name: "Today's entries" })
  await expect(timeline).toContainText("chicken, Chick-fil-A Nuggets, protein bar")
  await expect(timeline).toContainText("741")

  // The custom food is in More, My foods.
  await page.goto("/more/foods")
  await expect(page.getByText("protein bar", { exact: true })).toBeVisible()
  await expect(page.getByText("2 oz (57 g), 210 cal")).toBeVisible()
})

test("when parsing fails, search opens with what was typed", async ({ page }, info) => {
  await signInWithCode(page, `e2e-fallback-${info.project.name}-${Date.now()}@example.test`)
  await stubSearch(page)
  await page.route("**/api/parse", (route) => route.fulfill({ json: { aiCallId: null, fallback: true, unparsedText: "chicken thing", items: [] } }))
  await page.getByLabel("What did you eat?").fill("chicken thing")
  await page.getByRole("button", { name: "Log meal" }).click()
  const sheet = page.getByRole("dialog", { name: "Add food" })
  await expect(sheet.getByLabel("Search foods")).toHaveValue("chicken thing")
  await expect(sheet.getByRole("button", { name: /Chicken, broilers/ })).toBeVisible()
})

test("Raw, Cooked or Dry recalculates from the food in that state", async ({ page }, info) => {
  await signInWithCode(page, `e2e-state-${info.project.name}-${Date.now()}@example.test`)
  const rice = { ...chicken, sourceId: "168878", name: "Rice, white, long-grain, regular, cooked", per100g: { kcal: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3 }, portion: { label: "1 cup", grams: 158 } }
  await stubSearch(page, (q) => (/rice/i.test(q) ? { ...NO_RESULTS, basic: [hit("basic", rice, "1 cup (158 g)", 205)] } : null))
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
  await page.getByLabel("What did you eat?").fill("white rice")
  await page.getByRole("region", { name: "Food search results" }).getByRole("button", { name: /Rice, white/ }).click()

  // Starts at the common portion: 1 cup, 158 g cooked.
  const card = page.getByRole("dialog", { name: "Your meal" })
  await expect(card.getByText("205 cal · 4.3 g protein", { exact: true })).toBeVisible()
  const toggle = card.getByRole("radiogroup", { name: /Raw, cooked or dry/ })
  await expect(toggle.getByRole("radio", { name: "Cooked" })).toHaveAttribute("aria-checked", "true")
  await expectTapTargets(page)

  await toggle.getByRole("radio", { name: "Dry" }).click()
  await expect(toggle.getByRole("radio", { name: "Dry" })).toHaveAttribute("aria-checked", "true")
  await expect(card.getByText("577 cal · 11.2 g protein", { exact: true })).toBeVisible()

  await toggle.getByRole("radio", { name: "Raw" }).click()
  await expect(card.getByText("No raw entry found. Kept as it was.")).toBeVisible()
  await expect(toggle.getByRole("radio", { name: "Dry" })).toHaveAttribute("aria-checked", "true")
})

test("the log bar: leading search, barcode until the user types, then send", async ({ page }, info) => {
  await signInWithCode(page, `e2e-bar-${info.project.name}-${Date.now()}@example.test`)
  await stubSearch(page)
  const field = page.getByLabel("What did you eat?")
  await expect(page.getByRole("button", { name: "Search foods" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Scan a barcode" })).toBeVisible()
  await field.fill("2 eggs")
  // DESIGN_SYSTEM "Log bar": the leading search stays; barcode becomes send.
  await expect(page.getByRole("button", { name: "Search foods" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Log meal" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Scan a barcode" })).toHaveCount(0)
  // Escape closes the results and keeps what was typed.
  await field.press("Escape")
  await expect(page.getByRole("region", { name: "Food search results" })).toHaveCount(0)
  await expect(field).toHaveValue("2 eggs")
})

/** Stubs the barcode lookup for one code; the scan log id is fake, so outcomes are captured instead. */
async function stubBarcode(page: Page, result: object | null) {
  const outcomes: unknown[] = []
  await page.route("**/api/foods/barcode/0894700010045?*", (route) =>
    route.fulfill({ json: { scanId: "00000000-0000-4000-8000-0000000000aa", result, source: result ? "off" : null, gtin: "00894700010045", msToResult: null } })
  )
  await page.route("**/api/foods/barcode/scans/*", (route) => {
    outcomes.push(route.request().postDataJSON())
    route.fulfill({ json: { ok: true } })
  })
  return outcomes
}

test("a typed barcode is confirmed, then logs one serving, with attribution", async ({ page }, info) => {
  await signInWithCode(page, `e2e-barcode-${info.project.name}-${Date.now()}@example.test`)
  await stubSearch(page)
  const outcomes = await stubBarcode(page, yogurt)

  await page.getByRole("button", { name: "Scan a barcode" }).click()
  const scan = page.getByRole("dialog", { name: "Scan a barcode" })
  // Headless browsers have no camera: the sheet says so and the number works.
  await expect(scan.getByText("The camera is not available. Type the number under the barcode instead.")).toBeVisible()
  await expectNoAxeViolations(page)
  await expectTapTargets(page)

  // Acceptance 4: a number failing its check digit is never looked up.
  await scan.getByLabel("Barcode number").fill("0894700010046")
  await expect(scan.getByText("Those digits do not check out. Check the number under the barcode.")).toBeVisible()
  await expect(scan.getByRole("button", { name: "Look up" })).toBeDisabled()

  await scan.getByLabel("Barcode number").fill("0894700010045")
  await scan.getByRole("button", { name: "Look up" }).click()
  // Acceptance 5: every result asks first.
  await expect(scan.getByText("Fage Greek Yogurt Plain")).toBeVisible()
  await expect(scan.getByText("1 container (170 g), 165 kcal")).toBeVisible()
  await expect(scan.getByRole("link", { name: "Open Food Facts" })).toHaveAttribute("href", "https://openfoodfacts.org")
  await expectNoAxeViolations(page)
  await page.screenshot({ path: info.outputPath("barcode.png"), fullPage: true })
  await scan.getByRole("button", { name: "Log it" }).click()
  await expect(page.getByRole("list", { name: "Today's entries" })).toContainText("Greek Yogurt Plain")
  expect(outcomes).toEqual([{ outcome: "confirmed" }])
})

test("Not this opens search with the product's words and saves the pick as the correction", async ({ page }, info) => {
  await signInWithCode(page, `e2e-notthis-${info.project.name}-${Date.now()}@example.test`)
  await stubSearch(page)
  const outcomes = await stubBarcode(page, yogurt)

  await page.getByRole("button", { name: "Scan a barcode" }).click()
  const scan = page.getByRole("dialog", { name: "Scan a barcode" })
  await scan.getByLabel("Barcode number").fill("0894700010045")
  await scan.getByRole("button", { name: "Look up" }).click()
  await scan.getByRole("button", { name: "Not this" }).click()

  const find = page.getByRole("dialog", { name: "Find the right food" })
  await expect(find.getByLabel("Search foods")).toHaveValue("Fage Greek Yogurt Plain")
  await find.getByRole("button", { name: /Total 2% Greek Yogurt/ }).click()
  const card = page.getByRole("dialog", { name: "Your meal" })
  await expect(card.getByText("Total 2% Greek Yogurt")).toBeVisible()
  expect(outcomes).toEqual([
    { outcome: "not_this", chosenFoodItemId: null },
    { outcome: "not_this", chosenFoodItemId: "00000000-0000-4000-8000-000000000004" },
  ])
})

test("a barcode we do not have: scan the label, save it, and the next scan finds it", async ({ page }, info) => {
  await signInWithCode(page, `e2e-label-${info.project.name}-${Date.now()}@example.test`)
  await stubSearch(page)
  // A made up product (valid check digit); only this user's lookups find it once saved.
  const code = "999999800084"
  let stubbed = true
  await page.route(`**/api/foods/barcode/${code}?*`, (route) =>
    stubbed ? route.fulfill({ json: { scanId: null, result: null, source: null, gtin: `00${code}`, msToResult: null } }) : route.continue()
  )
  await page.route("**/api/foods/label", (route) =>
    route.fulfill({
      json: {
        label: { product_name: "Zzqx Protein Shake", brand: "Zzqx", serving_label: "1 bottle (325 ml)", serving_grams: null, serving_ml: 325, calories: 160, protein_g: 30, carbs_g: 5, fat_g: 2.5, confidence: 0.95 },
      },
    })
  )

  await page.getByRole("button", { name: "Scan a barcode" }).click()
  const sheet = page.getByRole("dialog", { name: "Scan a barcode" })
  await sheet.getByLabel("Barcode number").fill(code)
  await sheet.getByRole("button", { name: "Look up" }).click()
  await expect(sheet.getByText("We don’t have this barcode yet.")).toBeVisible()
  await expect(sheet.getByRole("button", { name: "Scan the label" })).toBeVisible()
  await expect(sheet.getByRole("button", { name: "Search" })).toBeVisible()
  await expect(sheet.getByRole("button", { name: "Enter it yourself" })).toBeVisible()
  await expectTapTargets(page)
  await sheet.getByRole("button", { name: "Scan the label" }).click()

  const label = page.getByRole("dialog", { name: "Scan the label" })
  await label.getByLabel("Take a photo of the label").setInputFiles({ name: "label.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64") })
  await expect(label.getByLabel("Food", { exact: true })).toHaveValue("Zzqx Protein Shake")
  await expect(label.getByLabel("Serving size")).toHaveValue("325")
  await expect(label.getByLabel("Unit")).toHaveValue("ml")
  await expect(label.getByLabel(/Barcode/)).toHaveValue(code)
  await expectNoAxeViolations(page)
  await label.getByRole("button", { name: "Save and add" }).click()

  const card = page.getByRole("dialog", { name: "Your meal" })
  await expect(card.getByText("160 cal · 30 g protein", { exact: true })).toBeVisible()
  await card.getByRole("button", { name: "Log it" }).click()
  await expect(page.getByRole("list", { name: "Today's entries" })).toContainText("Zzqx Protein Shake")

  // Acceptance 6: the next scan of that barcode is an instant hit, from the user's own food.
  stubbed = false
  await page.getByRole("button", { name: "Scan a barcode" }).click()
  await sheet.getByLabel("Barcode number").fill(`0${code}`)
  await sheet.getByRole("button", { name: "Look up" }).click()
  await expect(sheet.getByText("Zzqx Zzqx Protein Shake")).toBeVisible()
  await expect(sheet.getByText("1 bottle (325 ml), 160 kcal")).toBeVisible()
})
