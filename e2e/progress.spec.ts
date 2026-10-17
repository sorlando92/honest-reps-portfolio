import { randomUUID } from "node:crypto"
import { expect, test, type Page } from "@playwright/test"
import { admin, expectNoAxeViolations, expectTapTargets, signInWithCode, TEST_TARGETS } from "./helpers"

// Progress (docs/PROGRESS_SPEC.md) at 375px, light and dark, against the
// real API and database.
const TZ = "America/Chicago"
test.use({ timezoneId: TZ })

function localDate(offsetDays: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + offsetDays * 86_400_000))
}

async function userId(email: string) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  return data.users.find((u) => u.email === email)!.id
}

async function log(id: string, date: string, time: string, calories: number, protein: number, carbs: number, fat: number) {
  // Central daylight time is UTC-5 in this season; good enough for a fixture at midday.
  const { data: entry } = await admin
    .from("food_entries")
    .insert({ user_id: id, logged_at: new Date(`${date}T${time}:00-05:00`).toISOString(), meal: "lunch", method: "manual", title: "meal", client_uuid: randomUUID() })
    .select("id")
    .single()
  await admin.from("food_entry_items").insert({
    entry_id: entry!.id,
    user_id: id,
    name: "meal",
    amount: 1,
    unit: "g",
    grams: 300,
    amount_source: "weighed",
    calories,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
  })
}

async function seed(id: string) {
  await admin.from("profiles").update({ timezone: TZ }).eq("id", id)
  await admin.from("targets").insert({ user_id: id, ...TEST_TARGETS, set_by: "formula", effective_from: new Date(Date.now() - 60 * 86_400_000).toISOString() })
  for (let d = 1; d <= 20; d++) {
    if (d % 5 === 0) continue
    await log(id, localDate(-d), "12:00", 1900 + d * 10, 150, 200, 60)
  }
  // Today at 11:30 PM would be in the future; yesterday at 11:30 PM stays on yesterday.
  await log(id, localDate(-1), "23:30", 300, 20, 30, 10)
  for (let d = 0; d <= 20; d += 2) await admin.from("weights").insert({ user_id: id, date: localDate(-d), weight_kg: 82 + d * 0.05 })
}

const chart = (page: Page) => page.getByRole("region", { name: /^(This week|\w{3} \d+ to \w{3} \d+)$/ })

test("all sections populated; tiles match the database; weeks, range and long press", async ({ page }, info) => {
  const email = `e2e-progress-${info.project.name}-${Date.now()}@example.test`
  await signInWithCode(page, email)
  const id = await userId(email)
  await seed(id)
  await page.goto("/progress")

  await expect(page.getByRole("heading", { level: 1, name: /^Hi/ })).toBeVisible()
  await expect(chart(page).getByRole("heading", { name: "This week" })).toBeVisible()
  await expect(page.getByRole("region", { name: "Week averages" })).toBeVisible()
  await expect(page.getByRole("region", { name: "Consistency, 30 days" })).toContainText("days logged")
  await expect(page.getByRole("region", { name: "Weight trend" })).toContainText(/Trend \d+\.\d lb/)
  await expect(page.getByRole("region", { name: "Weight trend" })).toContainText(/(Down|Up) \d+\.\d lb in 30 days|No change in 30 days/)
  await expectNoAxeViolations(page)
  await expectTapTargets(page)

  // All 7 bars fit inside the card at 375px.
  const card = (await chart(page).boundingBox())!
  const bars = chart(page).getByRole("button", { name: /^\w+day, / })
  await expect(bars).toHaveCount(7)
  for (const box of await bars.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect))) {
    expect(box.left).toBeGreaterThanOrEqual(card.x)
    expect(box.right).toBeLessThanOrEqual(card.x + card.width)
  }

  // Spot check yesterday against the database, including the 11:30 PM log.
  const yesterday = localDate(-1)
  const { data: totals } = await admin.rpc("daily_totals", { p_user_id: id, p_from: yesterday, p_to: yesterday })
  const y = totals![0]
  const isMonday = new Date(`${localDate(0)}T12:00:00Z`).getUTCDay() === 1
  if (isMonday) await page.getByRole("button", { name: "Previous week" }).click()
  const [yy, ym, yd] = yesterday.split("-").map(Number)
  const longName = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(new Date(Date.UTC(yy, ym - 1, yd)))
  await chart(page).getByRole("button", { name: new RegExp(`^${longName}, `) }).click()
  const tiles = chart(page).getByRole("list", { name: `${longName} totals` })
  await expect(tiles).toContainText(`${Math.round(Number(y.calories)).toLocaleString("en-US")} of ${TEST_TARGETS.calories.toLocaleString("en-US")}`)
  await expect(tiles).toContainText(`${Math.round(Number(y.protein_g))} of ${TEST_TARGETS.protein_g}`)
  if (isMonday) await page.getByRole("button", { name: "Next week" }).click()

  // Back 12 weeks and forward again; no future weeks.
  await expect(page.getByRole("button", { name: "Next week" })).toBeDisabled()
  for (let i = 0; i < 12; i++) {
    await page.getByRole("button", { name: "Previous week" }).click()
    await expect(page.getByRole("button", { name: "Previous week" })).toBeEnabled()
  }
  await expect(chart(page).getByRole("heading", { name: / to / })).toBeVisible()
  await expect(page.getByText("No logs this week yet.")).toBeVisible()
  for (let i = 0; i < 12; i++) {
    await page.getByRole("button", { name: "Next week" }).click()
    await expect(page.getByRole("button", { name: "Previous week" })).toBeEnabled()
  }
  await expect(chart(page).getByRole("heading", { name: "This week" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Next week" })).toBeDisabled()

  // Range toggle, remembered on the device.
  const trend = page.getByRole("region", { name: "Weight trend" })
  await trend.getByRole("button", { name: "7 days" }).click()
  await expect(trend).toContainText("in 7 days")
  await page.reload()
  await expect(page.getByRole("region", { name: "Weight trend" }).getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("region", { name: "Weight trend" })).toContainText("in 7 days")

  // Long press a logged bar opens Today on that date.
  await page.getByRole("button", { name: "Previous week" }).click()
  await expect(chart(page).getByRole("heading", { name: / to / })).toBeVisible()
  const bar = chart(page).getByRole("button", { name: /calories/ }).first()
  await bar.dispatchEvent("pointerdown")
  await page.waitForURL(/\/today\?date=\d{4}-\d{2}-\d{2}$/)

  const { data: events } = await admin.from("events").select("name, props").eq("user_id", id)
  const names = new Set((events ?? []).map((e) => e.name))
  for (const name of ["progress_viewed", "progress_week_changed", "weight_range_changed"]) expect(names).toContain(name)
  expect(events!.find((e) => e.name === "progress_week_changed" && e.props.weeks_from_current === -12)).toBeTruthy()
})

test("a new user sees every empty state and no errors", async ({ page }, info) => {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  await signInWithCode(page, `e2e-progress-empty-${info.project.name}-${Date.now()}@example.test`)
  await page.goto("/progress")
  await expect(page.getByText("No logs this week yet.")).toBeVisible()
  await expect(page.getByText("No logs yet", { exact: true })).toBeVisible()
  await expect(page.getByText("No weigh-ins yet", { exact: true })).toBeVisible()
  await expect(page.getByText("Log a few more weigh-ins to see your trend.")).toBeVisible()
  await expectNoAxeViolations(page)
  expect(errors).toEqual([])
})

test("before targets, on target stats are hidden and tiles show grams only", async ({ page }, info) => {
  const email = `e2e-progress-notargets-${info.project.name}-${Date.now()}@example.test`
  await signInWithCode(page, email)
  const id = await userId(email)
  await admin.from("targets").delete().eq("user_id", id)
  await admin.from("profiles").update({ timezone: TZ }).eq("id", id)
  await log(id, localDate(0), "08:00", 500, 30, 50, 15)
  await page.goto("/progress")
  const averages = page.getByRole("region", { name: "Week averages" })
  await expect(averages).toContainText("Avg calories")
  await expect(averages).not.toContainText("Days on target")
  await expect(averages).not.toContainText("Protein days")
  await expect(chart(page).getByRole("list", { name: / totals$/ })).toContainText("30 g")
  await expect(chart(page).getByRole("list", { name: / totals$/ })).not.toContainText(" of ")
})
