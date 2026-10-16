import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createCast, deleteCast, type Cast } from "./fixtures"

// complete_onboarding: one transaction, safe to retry, server only.
let cast: Cast
beforeAll(async () => {
  cast = await createCast()
})
afterAll(async () => {
  await deleteCast(cast)
})

const answers = (overrides: Record<string, unknown> = {}) => ({
  units: "imperial",
  date_of_birth: "1990-05-01",
  medical: false,
  goal: "lose_fat",
  sex: "male",
  height_cm: 180,
  activity_level: "moderate",
  goal_weight_kg: 82,
  has_scale: true,
  weight_kg: 90,
  local_date: "2026-10-16",
  targets: { calories: 2300, protein_g: 181, carbs_g: 220, fat_g: 77, note: null },
  consent_versions: { terms: "draft-2026-10", privacy: "draft-2026-10", disclaimer: "draft-2026-10" },
  ...overrides,
})

async function counts(userId: string) {
  const [targets, weights, consents] = await Promise.all([
    cast.admin.from("targets").select("id", { count: "exact", head: true }).eq("user_id", userId),
    cast.admin.from("weights").select("id", { count: "exact", head: true }).eq("user_id", userId),
    cast.admin.from("consents").select("id", { count: "exact", head: true }).eq("user_id", userId).neq("kind", "coach_visibility"),
  ])
  return { targets: targets.count, weights: weights.count, consents: consents.count }
}

describe("complete_onboarding", () => {
  it("saves everything once and a retry with the same answers duplicates nothing", async () => {
    const first = await cast.admin.rpc("complete_onboarding", { p_user_id: cast.a.id, p: answers() })
    expect(first).toMatchObject({ error: null, data: true })
    expect(await counts(cast.a.id)).toEqual({ targets: 1, weights: 1, consents: 3 })

    const retry = await cast.admin.rpc("complete_onboarding", { p_user_id: cast.a.id, p: answers() })
    expect(retry).toMatchObject({ error: null, data: false })
    expect(await counts(cast.a.id)).toEqual({ targets: 1, weights: 1, consents: 3 })

    const { data: profile } = await cast.admin.from("profiles").select("units, date_of_birth, onboarding_completed_at").eq("id", cast.a.id).single()
    expect(profile).toMatchObject({ units: "imperial", date_of_birth: "1990-05-01" })
    expect(profile?.onboarding_completed_at).not.toBeNull()
  })

  it("finishes a save that failed part way without duplicating what got through", async () => {
    // As if an earlier attempt stored the weigh-in and one consent, then failed.
    await cast.admin.from("weights").insert({ user_id: cast.b.id, date: "2026-10-16", weight_kg: 91 })
    await cast.admin.from("consents").insert({ user_id: cast.b.id, kind: "terms", version: "draft-2026-10" })
    const { error } = await cast.admin.rpc("complete_onboarding", { p_user_id: cast.b.id, p: answers() })
    expect(error).toBeNull()
    expect(await counts(cast.b.id)).toEqual({ targets: 1, weights: 1, consents: 3 })
    const { data: weight } = await cast.admin.from("weights").select("weight_kg").eq("user_id", cast.b.id).single()
    expect(weight).toEqual({ weight_kg: 90 })
  })

  it("works for a coach account with no coach of its own", async () => {
    const { data: coach } = await cast.admin.from("profiles").select("coach_id, role").eq("id", cast.coach.id).single()
    expect(coach).toEqual({ coach_id: null, role: "coach" })
    const { error } = await cast.admin.rpc("complete_onboarding", { p_user_id: cast.coach.id, p: answers({ medical: true }) })
    expect(error).toBeNull()
    expect(await counts(cast.coach.id)).toEqual({ targets: 1, weights: 1, consents: 3 })
  })

  it("adds a targets row only when the targets change, keeps the date of birth and a medical yes", async () => {
    await cast.admin.rpc("complete_onboarding", { p_user_id: cast.coach.id, p: answers({ medical: false, date_of_birth: "2001-01-01", targets: { calories: 2400, protein_g: 181, carbs_g: 245, fat_g: 77, note: null } }) })
    const { data: targets } = await cast.admin.from("targets").select("calories").eq("user_id", cast.coach.id).order("created_at")
    expect(targets).toEqual([{ calories: 2300 }, { calories: 2400 }])
    const { data: profile } = await cast.admin.from("profiles").select("date_of_birth, medical_flag").eq("id", cast.coach.id).single()
    expect(profile).toEqual({ date_of_birth: "1990-05-01", medical_flag: true })
  })

  it("rolls back everything when any part fails", async () => {
    const bad = answers({ goal: "bulk_forever", local_date: "2026-10-15" })
    const { error } = await cast.admin.rpc("complete_onboarding", { p_user_id: cast.outsider.id, p: bad })
    expect(error).not.toBeNull()
    expect(await counts(cast.outsider.id)).toEqual({ targets: 0, weights: 0, consents: 0 })
    const { data: profile } = await cast.admin.from("profiles").select("onboarding_completed_at, date_of_birth").eq("id", cast.outsider.id).single()
    expect(profile).toEqual({ onboarding_completed_at: null, date_of_birth: null })
  })

  it("only the server can call it", async () => {
    for (const client of [cast.a.client, cast.anon]) {
      const { error } = await client.rpc("complete_onboarding", { p_user_id: cast.a.id, p: answers() })
      expect(error).not.toBeNull()
    }
  })
})
