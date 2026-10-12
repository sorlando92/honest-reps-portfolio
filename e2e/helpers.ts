import { expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { readLocalSupabase } from "../scripts/supabase-status.mts"

const local = readLocalSupabase()

/** Signs in through the real UI, reading the code from the local mail catcher. */
export async function signInWithCode(page: Page, email: string) {
  const since = Date.now()
  await page.goto("/sign-in")
  await page.getByLabel("Email").fill(email)
  await page.getByRole("button", { name: "Send code" }).click()
  await expect(page.getByLabel("6 digit code")).toBeVisible()

  const code = await waitForCode(email, since)
  await page.getByLabel("6 digit code").fill(code)
  await page.getByRole("button", { name: "Sign in" }).click()
  await page.waitForURL("**/today")
}

async function waitForCode(email: string, since: number): Promise<string> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const res = await fetch(`${local.mailUrl}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)
    if (res.ok) {
      const { messages } = (await res.json()) as { messages: { ID: string; Created: string }[] }
      const latest = messages.find((m) => Date.parse(m.Created) >= since - 1000)
      if (latest) {
        const msg = (await (await fetch(`${local.mailUrl}/api/v1/message/${latest.ID}`)).json()) as { Text: string; HTML: string }
        const match = (msg.Text || msg.HTML).match(/\b(\d{6})\b/)
        if (match) return match[1]
      }
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`No sign in email for ${email}`)
}

/** WCAG 2.2 AA scan; fails the test on any violation. */
export async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()
  expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([])
}

/** Every visible interactive element is at least 44 by 44 CSS pixels. */
export async function expectTapTargets(page: Page) {
  const small = await page.locator("a:visible, button:visible, input:visible").evaluateAll((els) =>
    els
      .map((el) => {
        const r = el.getBoundingClientRect()
        return { label: el.getAttribute("aria-label") || el.textContent?.trim() || el.tagName, w: r.width, h: r.height }
      })
      .filter((t) => t.w < 44 || t.h < 44)
  )
  expect(small).toEqual([])
}

export const coachEmail = process.env.COACH_EMAIL ?? "coach@example.test"
