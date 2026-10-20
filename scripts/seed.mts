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

// PRD F1 target formula (ARCHITECTURE "Target formula defaults", Q29, Q54).
// Each coach's copy lives in coach_settings; app_config keeps the platform
// copy that onboarding falls back to when a user has no coach (bug 2026-10-16).
const TARGET_DEFAULTS = {
  activity_multipliers: { sedentary: 1.2, light: 1.375, moderate: 1.55, very_active: 1.725, extra_active: 1.9 },
  goal_calorie_adjustment_pct: { lose_fat: -20, maintain: 0, build_muscle: 10, performance: 5 },
  protein_g_per_lb_goal_weight: { lose_fat: 1.0, maintain: 0.8, build_muscle: 1.0, performance: 0.9 },
  protein_cap_g: 220,
  calorie_floor: "bmr",
  // Q54: fat as a share of calories by goal, a floor per lb of goal weight,
  // carbs fill the rest with a minimum (fat gives way first, then calories).
  fat_pct_of_calories: { lose_fat: 30, maintain: 30, build_muscle: 25, performance: 25 },
  fat_min_g_per_lb_goal_weight: 0.3,
  carbs_min_g: 50,
}

// Defaults from the PRD, ARCHITECTURE "Target formula defaults" and the PM
// decisions on QUESTIONS.md Q17 and Q29. All editable in Coach settings.
// Days are 0 = Sunday through 6 = Saturday.
const APP_CONFIG: Record<string, unknown> = {
  target_defaults: TARGET_DEFAULTS,
  product_name: "Honest Reps",
  // Q55: legal documents stay "draft-2026-10" until Sean approves the final text.
  // Q73: the state disclosure is a draft too until Sean verifies the statute.
  consent_versions: { coach_visibility: "2026-10-12", terms: "draft-2026-10", privacy: "draft-2026-10", disclaimer: "draft-2026-10", mo_disclosure: "draft-2026-10" },
  adherence: { calorie_tolerance_pct: 10, protein_hit_pct: 90 },
  weight_trend: { method: "ewma", alpha: 0.1 },
  // QUESTIONS.md Q11: food match score below this flags the item.
  parsing: { match_threshold: 0.5 },
  // docs/TODAY_SPEC.md 6: local hour windows, start inclusive, end exclusive; the rest is snack.
  meal_windows: { breakfast: [4, 11], lunch: [11, 16], dinner: [16, 22] },
  // Q52: a log on a past day with a chosen meal is stamped at its anchor (local time).
  meal_anchors: { breakfast: "08:00", lunch: "12:30", dinner: "18:30", snack: "15:00" },
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
  target_defaults: TARGET_DEFAULTS,
  reminder_defaults: { evening_nudge: "19:00", checkin_reminder: "08:00", checkin_followup: "19:00" },
}

// PM 2026-10-18 (Q73). Seeded as version draft-2026-10.
const DISCLOSURE = {
  title: "About your coaching",
  body: [
    "Sean Orlando provides general nutrition coaching. This is not medical nutrition therapy.",
    "Sean is not a dietitian licensed by the state.",
    "The information and advice you receive may be considered alternative care by licensed practitioners in the state.",
    "Qualifications: Certified Strength and Conditioning Specialist (CSCS), Certified Special Population Specialist (CSPS), NSCA Certified Personal Trainer (NSCA-CPT), CrossFit Level 3 Trainer (CF-L3), BA in Mathematics and BA in Economics. Head coach since 2019 and co-owner of a CrossFit gym. Coaching and personal training since 2012.",
    "If you have a medical condition, talk with your doctor before changing how you eat.",
  ].join("\n\n"),
}

// PM 2026-10-18 (Q72), with the Q18 report tags.
const CHECKIN_QUESTIONS = [
  { type: "weight", prompt: "This week's weight" },
  { type: "photos", prompt: "Progress photos. Optional. Front, side and back in the same spot and light each week.", optional: true },
  { type: "scale", prompt: "Energy this week", low_label: "Drained", high_label: "Strong", report_tag: "energy" },
  { type: "scale", prompt: "Sleep quality", low_label: "Poor", high_label: "Great", report_tag: "sleep" },
  { type: "scale", prompt: "Hunger", low_label: "Rarely hungry", high_label: "Always hungry", report_tag: "hunger" },
  { type: "text", prompt: "How did training feel? Any wins or rough days?", report_tag: "performance" },
  { type: "text", prompt: "Anything you want me to know?", optional: true },
]

async function main() {
  for (const [key, value] of Object.entries(APP_CONFIG)) {
    check(await admin.from("app_config").upsert({ key, value }, { onConflict: "key", ignoreDuplicates: true }))
    await addMissingKeys("app_config", "key", key, "value", value)
  }

  const coachId = await ensureUser(admin, coachEmail)
  check(await admin.from("profiles").update({ role: "coach", coach_id: null, ai_enabled: true }).eq("id", coachId))
  check(
    await admin
      .from("coach_settings")
      .upsert({ coach_id: coachId, ...COACH_SETTINGS }, { onConflict: "coach_id", ignoreDuplicates: true })
  )
  await addMissingKeys("coach_settings", "coach_id", coachId, "target_defaults", COACH_SETTINGS.target_defaults)
  check(await admin.from("app_config").upsert({ key: "default_coach_id", value: coachId }, { onConflict: "key" }))
  console.log(`Coach: ${coachEmail} (${coachId})`)

  // State disclosure (PRD F16, Q73); never overwrite coach edits.
  check(
    await admin
      .from("coach_settings")
      .update({ disclosure_title: DISCLOSURE.title, disclosure_text: DISCLOSURE.body })
      .eq("coach_id", coachId)
      .is("disclosure_text", null)
  )

  // Check-in steps (PRD F5, Q72), only when the coach has none.
  const { count: questionCount } = await admin.from("checkin_questions").select("id", { count: "exact", head: true }).eq("coach_id", coachId)
  if (!questionCount) {
    check(await admin.from("checkin_questions").insert(CHECKIN_QUESTIONS.map((q, i) => ({ coach_id: coachId, position: i + 1, low_label: null, high_label: null, report_tag: null, ...q, optional: q.optional ?? false }))))
    console.log(`Check-in questions: ${CHECKIN_QUESTIONS.length}`)
  }

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
      check(await admin.from("profiles").update({ coach_id: coachId, ai_enabled: true }).eq("id", id))
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

/**
 * Settings that already exist keep every value the coach set; keys added to
 * the defaults since (new settings) are filled in. Never overwrites.
 */
async function addMissingKeys(table: string, idColumn: string, id: string, column: string, defaults: unknown) {
  if (!defaults || typeof defaults !== "object" || Array.isArray(defaults)) return
  const { data } = await admin.from(table).select(column).eq(idColumn, id).maybeSingle()
  const current = (data as Record<string, unknown> | null)?.[column]
  if (!current || typeof current !== "object" || Array.isArray(current)) return
  const missing = Object.keys(defaults).filter((k) => !(k in current))
  if (!missing.length) return
  const merged = { ...(defaults as Record<string, unknown>), ...(current as Record<string, unknown>) }
  check(await admin.from(table).update({ [column]: merged }).eq(idColumn, id))
  console.log(`Added to ${table}.${column} (${id}): ${missing.join(", ")}`)
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
