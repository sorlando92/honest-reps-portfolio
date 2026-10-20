import { randomUUID } from "node:crypto"
import { expect, test, type Page } from "@playwright/test"
import { admin, expectNoAxeViolations, expectTapTargets, signInWithCode, TEST_TARGETS } from "./helpers"

// The journal (docs/SCREENS_V2.md Today, docs/TODAY_SPEC.md) at 375px:
// header and day switching, week strip, macro card, sticky header, weight,
// day note, and logging to a past day. /api/parse is stubbed; everything
// else goes through the real API and database.
const TZ = "America/Chicago"
test.use({ timezoneId: TZ })

const parsed = {
  aiCallId: null,
  fallback: false,
  unparsedText: "",
  items: [
    {
      name: "oatmeal",
      brand: null,
      quantity: 1,
      unit: "cup",
      grams: 240,
      amountSource: "measured",
      state: "cooked",
      confidence: 0.9,
      match: { source: "usda", sourceId: "9", name: "Oatmeal", brand: null, dataType: "Survey (FNDDS)", state: "cooked", per100g: { kcal: 62.5, protein_g: 2.5, carbs_g: 11, fat_g: 1.4 } },
      matchScore: 0.9,
      calories: 150,
      proteinG: 6,
      carbsG: 27,
      fatG: 3,
      flagged: false,
      flagReason: null,
      alternatives: [],
      foodItemId: null,
    },
  ],
}

function localDate(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d)
}

/** A user with targets from a month ago, one entry yesterday and a weigh-in 8 days ago. */
async function seed(email: string) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const id = data.users.find((u) => u.email === email)!.id
  await admin.from("profiles").update({ timezone: TZ }).eq("id", id)
  await admin.from("targets").insert({ user_id: id, ...TEST_TARGETS, set_by: "formula", effective_from: new Date(Date.now() - 30 * 86_400_000).toISOString() })
  const { data: entry } = await admin
    .from("food_entries")
    .insert({ user_id: id, logged_at: new Date(Date.now() - 86_400_000).toISOString(), meal: "lunch", method: "manual", title: "chicken and rice", client_uuid: randomUUID() })
    .select("id")
    .single()
  await admin.from("food_entry_items").insert({
    entry_id: entry!.id,
    user_id: id,
    name: "chicken and rice",
    amount: 400,
    unit: "g",
    grams: 400,
    amount_source: "weighed",
    calories: 620,
    protein_g: 50,
    carbs_g: 70,
    fat_g: 12,
  })
  await admin.from("weights").insert({ user_id: id, date: localDate(-8), weight_kg: 83 })
  return id
}

const rings = (page: Page) => page.getByRole("region", { name: "Macros" })

test("journal: rings, mode, week strip, past day logging, copy, weight, note", { tag: "@a11y" }, async ({ page }, info) => {
  const email = `e2e-today-${info.project.name}-${Date.now()}@example.test`
  await signInWithCode(page, email)
  const userId = await seed(email)
  await page.route("**/api/parse", (route) => route.fulfill({ json: parsed }))
  await page.reload()

  // Header and 4 rings in order, each with a text label.
  await expect(page.getByRole("heading", { level: 1, name: /^Today, / })).toBeVisible()
  const labels = await rings(page).getByRole("img").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")).filter((l) => l && /^(Protein|Carbs|Fat|Calories),/.test(l)))
  expect(labels).toEqual(["Protein, 0 of 170 grams", "Carbs, 0 of 200 grams", "Fat, 0 of 65 grams", "Calories, 0 of 2,100"])
  await expectNoAxeViolations(page)
  await expectTapTargets(page)

  // Tap switches to Left and the choice survives a reload.
  await page.getByRole("button", { name: /Macros, showing eaten/ }).click()
  await expect(rings(page)).toContainText("left")
  await page.reload()
  await expect(page.getByRole("button", { name: /Macros, showing left/ })).toBeVisible()
  await page.getByRole("button", { name: /Macros, showing left/ }).click()

  // Week strip: yesterday's ring is labeled with its calories; tapping loads that day.
  const yesterday = localDate(-1)
  const strip = page.getByRole("group", { name: "Week" })
  const isMonday = new Date(`${localDate(0)}T12:00:00Z`).getUTCDay() === 1
  if (isMonday) {
    await page.getByRole("button", { name: /^Previous day/ }).click()
  } else {
    await strip.getByRole("button", { name: /620 of 2,100 calories/ }).click()
  }
  await page.waitForURL(`**/today?date=${yesterday}`)
  await expect(page.getByRole("list", { name: "Lunch entries" })).toContainText("chicken and rice")
  await expect(page.getByRole("button", { name: "Today", exact: true })).toBeVisible()

  // Logging on a past day with a chosen meal stamps it at the meal's anchor (Q52).
  await page.getByRole("button", { name: "Add to Breakfast" }).click()
  await page.getByLabel("What did you eat?").fill("oatmeal")
  await page.getByRole("button", { name: "Log meal" }).click()
  await page.getByRole("dialog", { name: "Your meal" }).getByRole("button", { name: "Log it" }).click()
  await expect(page.getByRole("list", { name: "Breakfast entries" })).toContainText("oatmeal")
  const { data: oat } = await admin.from("food_entries").select("logged_at, meal").eq("user_id", userId).eq("meal", "breakfast").single()
  expect(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, dateStyle: "short", timeStyle: "short", hourCycle: "h23" }).format(new Date(oat!.logged_at))).toBe(`${yesterday}, 08:00`)

  // Day note saves on blur and survives a reload.
  const note = page.getByLabel("Note for this day")
  await note.fill("Long day at work")
  await note.blur()
  await expect(page.getByText("Saved.")).toBeVisible()
  await page.reload()
  await expect(page.getByLabel("Note for this day")).toHaveValue("Long day at work")

  // Copy to today, then back to today.
  await page.getByRole("button", { name: "More for Lunch" }).click()
  await page.getByRole("menuitem", { name: "Copy to today" }).click()
  await expect(page.getByText("Copied.")).toBeVisible()
  await page.getByRole("button", { name: "Today", exact: true }).click()
  await page.waitForURL(/\/today$/)
  await expect(page.getByRole("list", { name: "Lunch entries" })).toContainText("chicken and rice")
  await expect(rings(page).getByRole("img", { name: "Calories, 620 of 2,100" })).toBeVisible()

  // Weight: log today's weigh-in; the row shows it and the trend.
  await page.getByRole("button", { name: "Log weight" }).click()
  const sheet = page.getByRole("dialog", { name: "Weight" })
  await expect(sheet).toContainText("Last 7 days")
  await sheet.getByLabel("Weight in lb").fill("175.0")
  await sheet.getByRole("button", { name: "Save" }).click()
  const weight = page.getByRole("region", { name: "Weight" })
  await expect(weight).toContainText("175.0 lb")
  await expect(weight).toContainText(/Trend 18\d\.\d lb, down \d\.\d this week/)

  // Scrolling past the macro card pins the compact header.
  await page.mouse.wheel(0, 900)
  await expect(page.getByRole("list", { name: "Macros" })).toBeVisible()
  await expectNoAxeViolations(page)

  // Events recorded.
  const { data: events } = await admin.from("events").select("name").eq("user_id", userId)
  const names = new Set((events ?? []).map((e) => e.name))
  for (const name of ["day_switched", "macro_card_mode_changed", "day_note_saved", "weight_logged", "meal_copied", "food_logged"]) expect(names).toContain(name)
})

test("a future day in the URL falls back to today and the next day button is off", async ({ page }, info) => {
  await signInWithCode(page, `e2e-today-future-${info.project.name}-${Date.now()}@example.test`)
  await page.goto(`/today?date=${localDate(3)}`)
  await expect(page.getByRole("heading", { level: 1, name: /^Today, / })).toBeVisible()
  await expect(page.getByRole("button", { name: "Next day" })).toBeDisabled()
  await expect(page.getByRole("region", { name: "Weight" })).toContainText("Log weight")
})
