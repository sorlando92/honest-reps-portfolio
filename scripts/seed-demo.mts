// Demo member with 35 days of realistic data, so the Progress tab can be
// tested with a full screen (docs/PROGRESS_SPEC.md "Demo data").
//
//   pnpm seed:demo            create (or recreate) the demo member
//   pnpm seed:demo --remove   delete the demo account and all its rows
//
// Hosted: node --env-file=.env.hosted scripts/seed-demo.mts [--remove]
// Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and COACH_EMAIL.
// The profile is marked is_test, so metrics and roster counts leave it out.

import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { addDays, localInstant, localToday } from "../core/time/local-day.ts"

const DEMO_EMAIL = "demo@example.test"
const TZ = "America/Chicago"
const DAYS = 35

const url = need("NEXT_PUBLIC_SUPABASE_URL")
const admin = createClient(url, need("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } })
const coachEmail = need("COACH_EMAIL").toLowerCase()

// Deterministic, so every run makes the same pattern.
let seed = 20261016
function random(): number {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(random() * xs.length)]

type Meal = "breakfast" | "lunch" | "dinner" | "snack"
interface Food {
  title: string
  calories: number
  protein: number
  carbs: number
  fat: number
  grams: number
}

const MENU: Record<Meal, Food[]> = {
  breakfast: [
    { title: "3 eggs and 2 slices toast", calories: 430, protein: 26, carbs: 30, fat: 22, grams: 230 },
    { title: "Greek yogurt with berries and granola", calories: 380, protein: 30, carbs: 48, fat: 8, grams: 320 },
    { title: "Oatmeal with whey and banana", calories: 450, protein: 35, carbs: 68, fat: 6, grams: 400 },
    { title: "Egg white omelet with spinach and feta", calories: 280, protein: 32, carbs: 6, fat: 13, grams: 300 },
  ],
  lunch: [
    { title: "Chicken rice bowl", calories: 640, protein: 52, carbs: 72, fat: 14, grams: 450 },
    { title: "Turkey sandwich and an apple", calories: 560, protein: 38, carbs: 70, fat: 13, grams: 380 },
    { title: "Chipotle chicken burrito bowl", calories: 690, protein: 50, carbs: 70, fat: 23, grams: 520 },
    { title: "Tuna salad wrap", calories: 520, protein: 40, carbs: 42, fat: 20, grams: 330 },
  ],
  dinner: [
    { title: "Salmon, potatoes and green beans", calories: 720, protein: 46, carbs: 58, fat: 32, grams: 520 },
    { title: "Lean beef tacos", calories: 680, protein: 48, carbs: 56, fat: 27, grams: 430 },
    { title: "Chicken stir fry with rice", calories: 650, protein: 50, carbs: 75, fat: 15, grams: 500 },
    { title: "Pasta with meat sauce", calories: 780, protein: 42, carbs: 96, fat: 24, grams: 480 },
  ],
  snack: [
    { title: "Protein shake", calories: 160, protein: 30, carbs: 5, fat: 2, grams: 350 },
    { title: "Apple and peanut butter", calories: 280, protein: 7, carbs: 30, fat: 16, grams: 200 },
    { title: "Cottage cheese", calories: 180, protein: 24, carbs: 8, fat: 5, grams: 225 },
    { title: "Beef jerky", calories: 160, protein: 26, carbs: 8, fat: 2, grams: 56 },
  ],
}
const ANCHOR: Record<Meal, [number, number]> = { breakfast: [7, 9], lunch: [12, 13], dinner: [18, 20], snack: [15, 21] }
const OTHER_SOURCES = ["measured", "label", "hand", "estimated"] as const

await removeDemo()
if (!process.argv.includes("--remove")) await createDemo()

async function removeDemo() {
  const id = await demoUserId()
  if (!id) return console.log(`No demo account on ${host()}.`)
  const { data: profile } = await admin.from("profiles").select("is_test").eq("id", id).single()
  if (!profile?.is_test) throw new Error(`${DEMO_EMAIL} exists but is not marked is_test; not deleting it.`)
  // Events keep rows with a null user on account deletion; demo events go entirely.
  await check(admin.from("events").delete().eq("user_id", id))
  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) throw error
  console.log(`Deleted the demo account and all its rows on ${host()}.`)
}

async function createDemo() {
  const { data: coach } = await admin.from("profiles").select("id").eq("role", "coach").eq("id", await userIdByEmail(coachEmail)).maybeSingle()
  if (!coach) throw new Error(`No coach profile for ${coachEmail}. Run pnpm db:seed first.`)

  const { data: created, error } = await admin.auth.admin.createUser({ email: DEMO_EMAIL, email_confirm: true, user_metadata: { coach_visibility_accepted: true } })
  if (error) throw error
  const id = created.user.id
  const today = localToday(TZ)
  const start = addDays(today, -(DAYS - 1))

  await check(
    admin
      .from("profiles")
      .update({ display_name: "Demo Member", coach_id: coach.id, is_test: true, ai_enabled: true, units: "imperial", timezone: TZ, date_of_birth: "1990-05-14", onboarding_completed_at: `${start}T14:00:00Z` })
      .eq("id", id)
  )
  await check(admin.from("nutrition_profiles").upsert({ user_id: id, goal: "lose_fat", sex: "male", height_cm: 180, activity_level: "moderate", goal_weight_kg: 82, has_scale: true }))
  await check(admin.from("targets").insert({ user_id: id, calories: 2200, protein_g: 180, carbs_g: 210, fat_g: 70, set_by: "formula", effective_from: localInstant(start, "08:00", TZ).toISOString() }))

  // One fully unlogged weekend: the Saturday and Sunday of 2 weeks ago.
  const skipped = new Set<string>()
  for (let i = 0; i < DAYS; i++) {
    const date = addDays(start, i)
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
    if (weekday === 6 && i >= DAYS - 21 && i < DAYS - 7 && skipped.size === 0) {
      skipped.add(date)
      skipped.add(addDays(date, 1))
    }
  }

  let entries = 0
  let items = 0
  let weighed = 0
  let loggedDays = 0
  let weighIns = 0
  for (let i = 0; i < DAYS; i++) {
    const date = addDays(start, i)
    const isToday = date === today
    // About 80% of days logged, counting the weekend.
    const logged = !skipped.has(date) && (isToday || random() > 0.17)
    if (logged) {
      loggedDays++
      // Some days well over target, never more than a normal day otherwise.
      const scale = random() < 0.18 ? 1.2 + random() * 0.15 : 0.9 + random() * 0.15
      const meals: Meal[] = isToday ? ["breakfast", "lunch"] : ["breakfast", "lunch", "dinner"]
      if (!isToday) for (let s = 0, n = Math.floor(random() * 3); s < n; s++) meals.push("snack")
      for (const meal of meals) {
        const food = pick(MENU[meal])
        const [h0, h1] = ANCHOR[meal]
        const time = `${String(h0 + Math.floor(random() * (h1 - h0 + 1))).padStart(2, "0")}:${String(Math.floor(random() * 60)).padStart(2, "0")}`
        const k = meal === "snack" ? 1 : scale
        const source = random() < 0.5 ? "weighed" : pick(OTHER_SOURCES)
        const { data: entry } = await check(
          admin
            .from("food_entries")
            .insert({ user_id: id, logged_at: localInstant(date, time, TZ).toISOString(), meal, method: "manual", title: food.title, client_uuid: randomUUID() })
            .select("id")
            .single()
        )
        await check(
          admin.from("food_entry_items").insert({
            entry_id: entry!.id,
            user_id: id,
            position: 0,
            name: food.title,
            amount: Math.round(food.grams * k),
            unit: "g",
            grams: Math.round(food.grams * k),
            amount_source: source,
            calories: Math.round(food.calories * k),
            protein_g: Math.round(food.protein * k * 10) / 10,
            carbs_g: Math.round(food.carbs * k * 10) / 10,
            fat_g: Math.round(food.fat * k * 10) / 10,
          })
        )
        entries++
        items++
        if (source === "weighed") weighed++
      }
    }
    // Weigh-ins on about 60% of days: a slow drop with daily noise.
    if (random() < 0.6 || isToday) {
      const kg = 88 - i * 0.06 + (random() - 0.5) * 0.9
      await check(admin.from("weights").insert({ user_id: id, date, weight_kg: Math.round(kg * 100) / 100 }))
      weighIns++
    }
  }

  console.log(
    `Created ${DEMO_EMAIL} on ${host()}: ${loggedDays} of ${DAYS} days logged, ${entries} entries, ` +
      `${Math.round((weighed / items) * 100)}% weighed, ${weighIns} weigh-ins, skipped weekend ${[...skipped].join(" and ")}.`
  )
}

async function demoUserId(): Promise<string | null> {
  return userIdByEmail(DEMO_EMAIL)
}

async function userIdByEmail(email: string): Promise<string | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (user) return user.id
    if (data.users.length < 1000) return null
  }
}

async function check<T extends { error: unknown }>(query: PromiseLike<T>): Promise<T> {
  const result = await query
  if (result.error) throw result.error
  return result
}

function host(): string {
  return new URL(url).host
}

function need(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

