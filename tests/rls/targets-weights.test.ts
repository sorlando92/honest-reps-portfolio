import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { CHECK_VIOLATION, createCast, deleteCast, PERMISSION_DENIED, type Cast, type TestUser } from "./fixtures"

let cast: Cast
beforeAll(async () => {
  cast = await createCast()
  // b is a paid client; a stays free.
  const { error } = await cast.admin.from("profiles").update({ tier: "paid", billing_source: "comped" }).eq("id", cast.b.id)
  if (error) throw error
})
afterAll(async () => {
  await deleteCast(cast)
})

const target = (user: TestUser, set_by: string, calories = 2200) => ({ user_id: user.id, calories, protein_g: 180, carbs_g: 220, fat_g: 70, set_by })

describe("targets RLS", () => {
  it("anyone saves formula targets; only free members save their own edits", async () => {
    expect((await cast.a.client.from("targets").insert(target(cast.a, "formula"))).error).toBeNull()
    expect((await cast.a.client.from("targets").insert(target(cast.a, "user", 2100))).error).toBeNull()
    expect((await cast.b.client.from("targets").insert(target(cast.b, "formula"))).error).toBeNull()
    expect((await cast.b.client.from("targets").insert(target(cast.b, "user"))).error?.code).toBe(PERMISSION_DENIED)
  })

  it("nobody writes coach targets for themselves or for others' members; the assigned coach does", async () => {
    expect((await cast.a.client.from("targets").insert(target(cast.a, "coach"))).error?.code).toBe(PERMISSION_DENIED)
    expect((await cast.a.client.from("targets").insert(target(cast.b, "formula"))).error?.code).toBe(PERMISSION_DENIED)
    expect((await cast.otherCoach.client.from("targets").insert(target(cast.b, "coach"))).error?.code).toBe(PERMISSION_DENIED)
    expect((await cast.coach.client.from("targets").insert(target(cast.b, "coach", 2000))).error).toBeNull()
  })

  it("the owner and the assigned coach read them; others do not", async () => {
    expect((await cast.a.client.from("targets").select("id").eq("user_id", cast.a.id)).data?.length).toBeGreaterThan(0)
    expect((await cast.coach.client.from("targets").select("id").eq("user_id", cast.a.id)).data?.length).toBeGreaterThan(0)
    for (const user of [cast.b, cast.outsider, cast.otherCoach]) {
      expect((await user.client.from("targets").select("id").eq("user_id", cast.a.id)).data).toEqual([])
    }
  })

  it("rows are history: never updated or deleted from a client", async () => {
    const upd = await cast.a.client.from("targets").update({ calories: 1 }).eq("user_id", cast.a.id)
    expect(upd.error?.code).toBe(PERMISSION_DENIED)
    const del = await cast.a.client.from("targets").delete().eq("user_id", cast.a.id)
    expect(del.error?.code).toBe(PERMISSION_DENIED)
  })

  it("rejects impossible numbers", async () => {
    expect((await cast.a.client.from("targets").insert(target(cast.a, "user", 100))).error?.code).toBe(CHECK_VIOLATION)
  })
})

describe("weights RLS", () => {
  it("a user logs, corrects and deletes their own weigh-ins, one per day", async () => {
    expect((await cast.a.client.from("weights").insert({ user_id: cast.a.id, date: "2026-10-14", weight_kg: 90.2 })).error).toBeNull()
    expect((await cast.a.client.from("weights").insert({ user_id: cast.a.id, date: "2026-10-14", weight_kg: 90 })).error?.code).toBe("23505")
    const fix = await cast.a.client.from("weights").upsert({ user_id: cast.a.id, date: "2026-10-14", weight_kg: 89.8 }, { onConflict: "user_id,date" }).select("weight_kg")
    expect(fix.data).toEqual([{ weight_kg: 89.8 }])
    expect((await cast.a.client.from("weights").delete().eq("user_id", cast.a.id).eq("date", "2026-10-14")).error).toBeNull()
  })

  it("only the owner writes; the owner and assigned coach read", async () => {
    await cast.a.client.from("weights").insert({ user_id: cast.a.id, date: "2026-10-13", weight_kg: 90.5 })
    expect((await cast.b.client.from("weights").insert({ user_id: cast.a.id, date: "2026-10-12", weight_kg: 50 })).error?.code).toBe(PERMISSION_DENIED)
    expect((await cast.coach.client.from("weights").update({ weight_kg: 50 }).eq("user_id", cast.a.id).select()).data).toEqual([])
    expect((await cast.coach.client.from("weights").select("date").eq("user_id", cast.a.id)).data).toEqual([{ date: "2026-10-13" }])
    for (const user of [cast.b, cast.outsider, cast.otherCoach]) {
      expect((await user.client.from("weights").select("id").eq("user_id", cast.a.id)).data).toEqual([])
    }
  })

  it("rejects impossible weights", async () => {
    expect((await cast.a.client.from("weights").insert({ user_id: cast.a.id, date: "2026-10-11", weight_kg: 5 })).error?.code).toBe(CHECK_VIOLATION)
  })
})
