import { expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { createClient } from "@supabase/supabase-js"
import { readLocalSupabase } from "../scripts/supabase-status.mts"

const local = readLocalSupabase()
export const admin = createClient(local.url, local.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

/** Starting targets for test users who skip onboarding. */
export const TEST_TARGETS = { calories: 2100, protein_g: 170, carbs_g: 200, fat_g: 65 }

/**
 * Signs in through the real UI, reading the code from the local mail catcher.
 * New users land on onboarding; unless `onboarded: false`, the helper marks
 * them onboarded with TEST_TARGETS and opens Today, so tests that are not
 * about onboarding start where users spend their time.
 */
export async function signInWithCode(page: Page, email: string, { onboarded = true }: { onboarded?: boolean } = {}) {
  const since = Date.now()
  await page.goto("/sign-in")
  await page.getByLabel("Email").fill(email)
  await page.getByRole("button", { name: "Send code" }).click()
  await expect(page.getByLabel("6 digit code")).toBeVisible()

  const code = await waitForCode(email, since)
  await page.getByLabel("6 digit code").fill(code)
  await page.getByRole("button", { name: "Sign in" }).click()
  // Sign in lands on Today; the app then sends new users on to onboarding.
  await page.waitForURL(/\/(today|onboarding)$/)
  if (!onboarded) {
    await page.waitForURL("**/onboarding")
    return
  }
  await markOnboarded(email)
  await page.goto("/today")
  await page.waitForURL("**/today")
}

async function markOnboarded(email: string) {
  // Local databases collect thousands of test accounts: look through every page.
  let user: { id: string } | undefined
  for (let page = 1; !user; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (data.users.length < 1000) break
  }
  if (!user) throw new Error(`No user ${email}`)
  const { data: profile } = await admin.from("profiles").select("onboarding_completed_at").eq("id", user.id).single()
  if (profile?.onboarding_completed_at) return
  const done = await admin.from("profiles").update({ onboarding_completed_at: new Date().toISOString() }).eq("id", user.id)
  if (done.error) throw done.error
  const targets = await admin.from("targets").insert({ user_id: user.id, ...TEST_TARGETS, set_by: "formula" })
  if (targets.error) throw targets.error
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
  expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.target.join(" ")}`)).toEqual([])
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
