// Seeds business settings and the coach account. Safe to rerun: existing
// settings are never overwritten, so edits made in Coach settings survive.
//
//   pnpm db:seed            settings and coach (local or hosted)
//   pnpm db:seed --sample   also two sample members (local only)
//
// Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and COACH_EMAIL.

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { CURATED_CHAINS, curatedSourceId } from "../modules/nutrition/data/chains/index.ts"
import { DEFAULT_HAND_PORTIONS } from "../modules/nutrition/parsing/hand.ts"

const url = need("NEXT_PUBLIC_SUPABASE_URL")
const serviceKey = need("SUPABASE_SERVICE_ROLE_KEY")
const coachEmail = need("COACH_EMAIL").toLowerCase()
const withSample = process.argv.includes("--sample")
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

// Defaults from the PRD, ARCHITECTURE "Target formula defaults" and the PM
// decisions on QUESTIONS.md Q17 and Q29. All editable in Coach settings.
// Days are 0 = Sunday through 6 = Saturday.
const APP_CONFIG: Record<string, unknown> = {
  product_name: "Honest Reps",
  consent_versions: { coach_visibility: "2026-10-12" },
  adherence: { calorie_tolerance_pct: 10, protein_hit_pct: 90 },
  weight_trend: { method: "ewma", alpha: 0.1 },
  // QUESTIONS.md Q11: food match score below this flags the item.
  parsing: { match_threshold: 0.5 },
  // docs/TODAY_SPEC.md 6: local hour windows, start inclusive, end exclusive; the rest is snack.
  meal_windows: { breakfast: [4, 11], lunch: [11, 16], dinner: [16, 22] },
}

const COACH_SETTINGS = {
  checkin_day: 5, // Friday
  review_day: 0, // Sunday
  weekly_cycle: {
    checkin_opens_at: "06:00",
    overdue_after_hours: 24, // Saturday 6:00am
    review_prep_day: 6, // Saturday
    review_prep_at: "22:00",
  },
  target_defaults: {
    activity_multipliers: { sedentary: 1.2, light: 1.375, moderate: 1.55, very_active: 1.725, extra_active: 1.9 },
    goal_calorie_adjustment_pct: { lose_fat: -20, maintain: 0, build_muscle: 10, performance: 5 },
    protein_g_per_lb_goal_weight: { lose_fat: 1.0, maintain: 0.8, build_muscle: 1.0, performance: 0.9 },
    protein_cap_g: 220,
    calorie_floor: "bmr",
  },
  reminder_defaults: { evening_nudge: "19:00", checkin_reminder: "08:00", checkin_followup: "19:00" },
}

async function main() {
  for (const [key, value] of Object.entries(APP_CONFIG)) {
    check(await admin.from("app_config").upsert({ key, value }, { onConflict: "key", ignoreDuplicates: true }))
  }

  const coachId = await ensureUser(admin, coachEmail)
  check(await admin.from("profiles").update({ role: "coach", coach_id: null }).eq("id", coachId))
  check(
    await admin
      .from("coach_settings")
      .upsert({ coach_id: coachId, ...COACH_SETTINGS }, { onConflict: "coach_id", ignoreDuplicates: true })
  )
  check(await admin.from("app_config").upsert({ key: "default_coach_id", value: coachId }, { onConflict: "key" }))
  console.log(`Coach: ${coachEmail} (${coachId})`)

  // Nutrition module settings (QUESTIONS.md Q33); never overwrite coach edits.
  check(
    await admin
      .from("nutrition_coach_settings")
      .upsert({ coach_id: coachId, hand_portions: DEFAULT_HAND_PORTIONS }, { onConflict: "coach_id", ignoreDuplicates: true })
  )

  // Curated chain items (Q36): the JSON files are the source of truth, so
  // these rows are replaced on every seed.
  for (const chain of CURATED_CHAINS) {
    const rows = chain.items.map((item) => {
      const f = item.serving_grams ? 100 / item.serving_grams : null
      return {
        source: "custom",
        source_id: curatedSourceId(chain, item),
        name: item.name,
        brand: chain.chain,
        data_type: "Curated",
        // Servings published without a weight have no per 100 g values.
        per_100g: f ? { kcal: item.kcal * f, protein_g: item.protein_g * f, carbs_g: item.carbs_g * f, fat_g: item.fat_g * f } : {},
        serving: { label: item.serving_label ?? "1 serving", grams: item.serving_grams, kcal: item.kcal, protein_g: item.protein_g, carbs_g: item.carbs_g, fat_g: item.fat_g },
        source_url: chain.source_url,
        verified_on: chain.verified_on,
      }
    })
    check(await admin.from("food_items").upsert(rows, { onConflict: "source,source_id" }))
    console.log(`Chain items: ${chain.chain} (${rows.length})`)
  }

  if (withSample) {
    if (!isLocal) throw new Error("Sample users are only seeded into a local database.")
    for (const email of ["member1@example.test", "member2@example.test"]) {
      const id = await ensureUser(admin, email)
      check(await admin.from("profiles").update({ coach_id: coachId }).eq("id", id))
      console.log(`Sample member: ${email}`)
    }
  }

  console.log("Seed complete.")
}

async function ensureUser(client: SupabaseClient, email: string): Promise<string> {
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const found = data.users.find((u) => u.email?.toLowerCase() === email)
    if (found) return found.id
    if (data.users.length < 200) break
  }
  const { data, error } = await client.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { coach_visibility_accepted: true },
  })
  if (error) throw error
  return data.user.id
}

function check(result: { error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message)
}

function need(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`Missing ${name}. Run pnpm env:local for local, or set it for the hosted project.`)
    process.exit(1)
  }
  return value
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
