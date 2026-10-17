import { randomUUID } from "node:crypto"
import { expect, test, type Page } from "@playwright/test"
import { admin, expectNoAxeViolations, expectTapTargets, signInWithCode, TEST_TARGETS } from "./helpers"

// Navigation and calendar (docs/NAV_SPEC.md) at 375px, light and dark.
const TZ = "America/Chicago"
test.use({ timezoneId: TZ })

function localDate(offsetDays: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + offsetDays * 86_400_000))
}

function longName(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(new Date(Date.UTC(y, m - 1, d))).replace(",", "")
}

async function userId(email: string) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  return data.users.find((u) => u.email === email)!.id
}

/** Targets from 60 days ago and a lunch on each of the last 20 days. */
async function seed(id: string) {
  await admin.from("profiles").update({ timezone: TZ }).eq("id", id)
  await admin.from("targets").insert({ user_id: id, ...TEST_TARGETS, set_by: "formula", effective_from: new Date(Date.now() - 60 * 86_400_000).toISOString() })
  for (let d = 1; d <= 20; d++) {
    const { data: entry } = await admin
      .from("food_entries")
      .insert({ user_id: id, logged_at: new Date(`${localDate(-d)}T12:30:00-05:00`).toISOString(), meal: "lunch", method: "manual", title: "chicken bowl", client_uuid: randomUUID() })
      .select("id")
      .single()
    await admin.from("food_entry_items").insert({ entry_id: entry!.id, user_id: id, name: "chicken bowl", amount: 400, unit: "g", grams: 400, amount_source: "weighed", calories: 640, protein_g: 52, carbs_g: 72, fat_g: 14 })
  }
}

const band = (page: Page) => page.locator("#today-band")
const week = (page: Page) => band(page).getByRole("group", { name: "Week" })

test("tab bar: order, labels, Today by default, active pill, Progress header and avatar", async ({ page }, info) => {
  await signInWithCode(page, `e2e-nav-${info.project.name}-${Date.now()}@example.test`)
  const tabs = page.getByRole("tablist", { name: "Main" }).getByRole("tab")
  await expect(tabs).toHaveText(["Progress", "Today", "Coach", "More"])
  await expect(page).toHaveURL(/\/today$/)
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true")
  await expect(page.getByRole("button", { name: "Quick actions" })).toBeVisible()
  await expectNoAxeViolations(page)
  await expectTapTargets(page)

  await tabs.nth(0).click()
  await page.waitForURL("**/progress")
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true")
  await expect(page.getByRole("heading", { level: 1, name: "Hi" })).toBeVisible()
  await page.getByRole("link", { name: "More" }).click()
  await page.waitForURL("**/more")
  await page.getByLabel("Name").fill("Sam Lee")
  await page.getByLabel("Name").blur()
  await expect(page.getByText("Saved.")).toBeVisible()
  await expectNoAxeViolations(page)
  await expectTapTargets(page)
  await tabs.nth(0).click()
  await expect(page.getByRole("heading", { level: 1, name: "Hi, Sam" })).toBeVisible()
  await expect(page.getByRole("link", { name: "More" })).toHaveText("S")

  // Old Me links land on More.
  await page.goto("/me")
  await page.waitForURL("**/more")
})

test("week strip slides by week without changing the day; month calendar selects and collapses", async ({ page }, info) => {
  const email = `e2e-nav-cal-${info.project.name}-${Date.now()}@example.test`
  await signInWithCode(page, email)
  const id = await userId(email)
  await seed(id)
  await page.reload()

  const today = localDate(0)
  await expect(week(page).getByRole("button", { name: new RegExp(`^${longName(today)}.*, selected$`) })).toBeVisible()
  // Never past the current week.
  await expect(band(page).getByRole("button", { name: "Next week" })).toBeDisabled()

  // Slide back a week: the selected day stays, and that week's rings load.
  const scroller = week(page)
  await scroller.evaluate((el) => el.scrollBy({ left: -el.clientWidth }))
  const lastWeekDay = localDate(-7)
  await expect(scroller.getByRole("button", { name: new RegExp(`^${longName(lastWeekDay)}, 640 of 2,100 calories$`) })).toBeInViewport()
  await expect(page).toHaveURL(/\/today$/)
  // Tapping a day selects it.
  await scroller.getByRole("button", { name: new RegExp(`^${longName(lastWeekDay)}, `) }).click()
  await page.waitForURL(`**/today?date=${lastWeekDay}`)
  await expect(page.getByRole("list", { name: "Lunch entries" })).toContainText("chicken bowl")

  // Title tap opens the month calendar; picking a day collapses to its week.
  const title = band(page).getByRole("button", { name: /month calendar/ })
  await title.click()
  await expect(title).toHaveAttribute("aria-expanded", "true")
  const month = band(page).getByRole("list", { name: "Month" })
  await expect(month).toBeVisible()
  await expectNoAxeViolations(page)
  await expectTapTargets(page)
  const pick = localDate(-15)
  if (pick.slice(0, 7) !== lastWeekDay.slice(0, 7)) await band(page).getByRole("button", { name: "Previous month" }).click()
  await month.getByRole("button", { name: new RegExp(`^${longName(pick)}, `) }).click()
  await page.waitForURL(`**/today?date=${pick}`)
  await expect(title).toHaveAttribute("aria-expanded", "false")
  await expect(week(page).getByRole("button", { name: new RegExp(`^${longName(pick)}.*, selected$`) })).toBeInViewport()

  // Tap outside collapses.
  await title.click()
  await expect(month).toBeVisible()
  // Below the open calendar, above the floating log bar.
  await page.mouse.click(180, 560)
  await expect(title).toHaveAttribute("aria-expanded", "false")

  const { data: events } = await admin.from("events").select("name").eq("user_id", id).eq("name", "calendar_expanded")
  expect(events!.length).toBeGreaterThanOrEqual(2)
})

test("scrolling swaps the week strip for the compact macro row and back", async ({ page }, info) => {
  await signInWithCode(page, `e2e-nav-scroll-${info.project.name}-${Date.now()}@example.test`)
  const compact = band(page).getByRole("list", { name: "Macros" })
  await expect(week(page)).toBeVisible()
  await expect(compact).not.toBeVisible()
  await page.mouse.wheel(0, 700)
  await expect(compact).toBeVisible()
  await expect(compact).toContainText(`0 of ${TEST_TARGETS.calories.toLocaleString("en-US")}`)
  await page.mouse.wheel(0, -2000)
  await expect(compact).not.toBeVisible()
  await expect(week(page)).toBeVisible()
})

test("quick actions on a past day act on that day; from Progress they switch to Today", async ({ page }, info) => {
  const email = `e2e-nav-qa-${info.project.name}-${Date.now()}@example.test`
  await signInWithCode(page, email)
  const id = await userId(email)
  await seed(id)
  const day = localDate(-3)
  await page.goto(`/today?date=${day}`)
  // A tap before hydration does nothing; wait for the app to be running.
  await page.locator("[data-hydrated]").waitFor()

  // Copy yesterday's {meal for the current window} into the selected day.
  await page.getByRole("button", { name: "Quick actions" }).click()
  const sheet = page.getByRole("dialog", { name: "Quick actions" })
  await expect(sheet).toContainText(/For \w{3}, \w{3} \d+/)
  await expectNoAxeViolations(page)
  await expectTapTargets(page)
  const copyRow = sheet.getByRole("button", { name: /^Copy yesterday's / })
  const meal = ((await copyRow.textContent()) ?? "").replace("Copy yesterday's ", "")
  await copyRow.click()
  await expect(page.getByRole("status").filter({ hasText: /Copied\.|Nothing in yesterday's/ })).toBeVisible()
  if (meal === "lunch") {
    // Yesterday (of the selected day) had lunch, so it was copied at the lunch anchor on that day.
    const { data } = await admin.from("food_entries").select("logged_at").eq("user_id", id).not("copied_from_entry_id", "is", null).single()
    expect(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, dateStyle: "short", timeStyle: "short", hourCycle: "h23" }).format(new Date(data!.logged_at))).toBe(`${day}, 12:30`)
  }

  // Log weight opens the sheet for the selected day.
  await page.getByRole("button", { name: "Quick actions" }).click()
  await sheet.getByRole("button", { name: "Log weight" }).click()
  await expect(page.getByRole("dialog", { name: "Weight" })).toBeVisible()
  await page.keyboard.press("Escape")

  // Day note focuses the note.
  await page.getByRole("button", { name: "Quick actions" }).click()
  await sheet.getByRole("button", { name: "Day note" }).click()
  await expect(page.getByLabel("Note for this day")).toBeFocused()
  // Bars hide while typing.
  await expect(page.getByRole("tablist", { name: "Main" })).toBeHidden()
  await expect(page.getByRole("button", { name: "Quick actions" })).toBeHidden()
  await expect(page.getByLabel("What did you eat?")).toBeHidden()
  await page.getByLabel("Note for this day").blur()
  await expect(page.getByRole("tablist", { name: "Main" })).toBeVisible()

  // From Progress: Search food switches to Today and opens the log bar's results
  // with the field focused (FOOD_LOOKUP_SPEC 1).
  await page.goto("/progress")
  await page.locator("[data-hydrated]").waitFor()
  await page.getByRole("button", { name: "Quick actions" }).click()
  await expect(sheet).toContainText("For today")
  await sheet.getByRole("button", { name: "Search food" }).click()
  await page.waitForURL(/\/today$/)
  await expect(page.getByRole("region", { name: "Food search results" })).toBeVisible()
  // Next keeps the Progress page mounted but hidden, with its own log bar.
  await expect(page.getByLabel("What did you eat?").filter({ visible: true })).toBeFocused()

  const { data: events } = await admin.from("events").select("props").eq("user_id", id).eq("name", "quick_action_used")
  expect(new Set(events!.map((e) => e.props.action))).toEqual(new Set(["copy", "weight", "note", "search"]))
})

test("the log bar on Progress logs to today and switches to Today", async ({ page }, info) => {
  await signInWithCode(page, `e2e-nav-progress-log-${info.project.name}-${Date.now()}@example.test`)
  await page.route("**/api/parse", (route) =>
    route.fulfill({
      json: {
        aiCallId: null,
        fallback: false,
        unparsedText: "",
        items: [
          {
            name: "banana",
            brand: null,
            quantity: 1,
            unit: "piece",
            grams: 118,
            amountSource: "measured",
            state: null,
            confidence: 0.9,
            match: { source: "usda", sourceId: "1", name: "Banana", brand: null, dataType: "Foundation", state: null, per100g: { kcal: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3 } },
            matchScore: 0.9,
            calories: 105,
            proteinG: 1.3,
            carbsG: 27,
            fatG: 0.4,
            flagged: false,
            flagReason: null,
            alternatives: [],
            foodItemId: null,
          },
        ],
      },
    })
  )
  await page.goto("/progress")
  await page.getByLabel("What did you eat?").fill("a banana")
  await page.getByRole("button", { name: "Log meal" }).click()
  await page.getByRole("dialog", { name: "Your meal" }).getByRole("button", { name: "Log it" }).click()
  await page.waitForURL(/\/today$/)
  await expect(page.getByRole("list", { name: "Today's entries" })).toContainText("banana")
})
