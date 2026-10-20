import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { CHECK_VIOLATION, createCast, deleteCast, PERMISSION_DENIED, type Cast } from "./fixtures"

let cast: Cast
beforeAll(async () => {
  cast = await createCast()
})
afterAll(async () => {
  await deleteCast(cast)
})

describe("profiles RLS", () => {
  it("signup trigger creates a profile", async () => {
    const { data } = await cast.a.client.from("profiles").select("id, tier").eq("id", cast.a.id).single()
    expect(data).toEqual({ id: cast.a.id, tier: "free" })
  })

  it("a user reads only their own profile", async () => {
    const { data } = await cast.a.client.from("profiles").select("id")
    expect(data?.map((r) => r.id)).toEqual([cast.a.id])
  })

  it("the coach reads every assigned user, free and paid, and nobody else", async () => {
    await cast.admin.from("profiles").update({ tier: "paid", billing_source: "comped" }).eq("id", cast.b.id)
    const { data } = await cast.coach.client.from("profiles").select("id")
    const ids = data?.map((r) => r.id).sort()
    expect(ids).toEqual([cast.a.id, cast.b.id, cast.coach.id].sort())
    expect(ids).not.toContain(cast.outsider.id)
    expect(ids).not.toContain(cast.otherMember.id)
  })

  it("ai_enabled starts off, and neither the member nor their coach can set it under RLS", async () => {
    const { data } = await cast.a.client.from("profiles").select("ai_enabled").eq("id", cast.a.id).single()
    expect(data?.ai_enabled).toBe(false)
    for (const patch of [{ ai_enabled: true }, { ai_enabled_changed_by: cast.a.id }, { ai_enabled_changed_at: new Date().toISOString() }]) {
      const own = await cast.a.client.from("profiles").update(patch).eq("id", cast.a.id)
      expect(own.error?.code).toBe(PERMISSION_DENIED)
    }
    // The coach turns it on through /api/clients/[id]/ai, which writes with the service role.
    const byCoach = await cast.coach.client.from("profiles").update({ ai_enabled: true }).eq("id", cast.a.id)
    expect(byCoach.error?.code).toBe(PERMISSION_DENIED)
    const { data: after } = await cast.admin.from("profiles").select("ai_enabled").eq("id", cast.a.id).single()
    expect(after?.ai_enabled).toBe(false)
  })

  it("a member cannot make themselves the coach", async () => {
    const { error } = await cast.a.client.from("profiles").update({ role: "coach" }).eq("id", cast.a.id)
    expect(error?.code).toBe(PERMISSION_DENIED)
  })

  it("a user cannot change tier, billing, coach, medical flag or date of birth", async () => {
    for (const patch of [
      { tier: "paid" },
      { billing_source: "comped" },
      { coach_id: cast.otherCoach.id },
      { medical_flag: true },
      { date_of_birth: "1990-01-01" },
    ]) {
      const { error } = await cast.a.client.from("profiles").update(patch).eq("id", cast.a.id)
      expect(error?.code, JSON.stringify(patch)).toBe(PERMISSION_DENIED)
    }
  })

  it("a user can update their own display name, units and timezone", async () => {
    const { data, error } = await cast.a.client
      .from("profiles")
      .update({ display_name: "A", units: "metric", timezone: "America/Chicago" })
      .eq("id", cast.a.id)
      .select("display_name, units, timezone")
    expect(error).toBeNull()
    expect(data).toEqual([{ display_name: "A", units: "metric", timezone: "America/Chicago" }])
  })

  it("a user cannot set an unknown timezone", async () => {
    const { error } = await cast.a.client.from("profiles").update({ timezone: "Mars/Olympus" }).eq("id", cast.a.id)
    expect(error?.code).toBe("22023")
  })

  it("role is only member or coach; client is not a stored role", async () => {
    const { error } = await cast.admin.from("profiles").update({ role: "client" }).eq("id", cast.a.id)
    expect(error?.code).toBe(CHECK_VIOLATION)
  })

  it("a user cannot update someone else's profile", async () => {
    const { data } = await cast.a.client.from("profiles").update({ display_name: "x" }).eq("id", cast.b.id).select()
    expect(data).toEqual([])
  })

  it("the coach cannot write a client's profile from the client side", async () => {
    const { data } = await cast.coach.client.from("profiles").update({ display_name: "x" }).eq("id", cast.a.id).select()
    expect(data).toEqual([])
  })

  it("nobody inserts or deletes profiles from the client", async () => {
    const insert = await cast.a.client.from("profiles").insert({ id: cast.a.id })
    expect(insert.error?.code).toBe(PERMISSION_DENIED)
    const del = await cast.a.client.from("profiles").delete().eq("id", cast.a.id)
    expect(del.error?.code).toBe(PERMISSION_DENIED)
  })

  it("anonymous visitors read nothing", async () => {
    const { data } = await cast.anon.from("profiles").select("id")
    expect(data ?? []).toEqual([])
  })

  it("RLS helper functions are not callable anonymously", async () => {
    const { error } = await cast.anon.rpc("is_coach")
    expect(error).not.toBeNull()
  })
})
