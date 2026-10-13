import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { CHECK_VIOLATION, createCast, deleteCast, PERMISSION_DENIED, type Cast } from "./fixtures"
import { EVENT_NAMES, SERVER_ONLY_EVENTS } from "../../core/events/names"

let cast: Cast
beforeAll(async () => {
  cast = await createCast()
})
afterAll(async () => {
  await deleteCast(cast)
})

describe("consents RLS", () => {
  it("signup records the coach visibility consent with a server timestamp", async () => {
    const { data } = await cast.a.client.from("consents").select("kind, version, accepted_at")
    expect(data).toHaveLength(1)
    expect(data?.[0].kind).toBe("coach_visibility")
    expect(Date.parse(data?.[0].accepted_at)).not.toBeNaN()
  })

  it("the coach reads assigned users' consents only", async () => {
    const { data } = await cast.coach.client.from("consents").select("user_id")
    const ids = new Set(data?.map((r) => r.user_id))
    expect(ids.has(cast.a.id) && ids.has(cast.b.id)).toBe(true)
    expect(ids.has(cast.outsider.id) || ids.has(cast.otherMember.id)).toBe(false)
  })

  it("users cannot read each other's consents", async () => {
    const { data } = await cast.a.client.from("consents").select("user_id").eq("user_id", cast.b.id)
    expect(data).toEqual([])
  })

  it("users insert their own consent but cannot set accepted_at", async () => {
    const ok = await cast.a.client.from("consents").insert({ user_id: cast.a.id, kind: "terms", version: "t1" })
    expect(ok.error).toBeNull()
    const backdated = await cast.a.client
      .from("consents")
      .insert({ user_id: cast.a.id, kind: "terms", version: "t1", accepted_at: "2000-01-01T00:00:00Z" })
    expect(backdated.error?.code).toBe(PERMISSION_DENIED)
  })

  it("users cannot insert consent for someone else", async () => {
    const { error } = await cast.a.client.from("consents").insert({ user_id: cast.b.id, kind: "terms", version: "t1" })
    expect(error?.code).toBe(PERMISSION_DENIED)
  })

  it("consents cannot be edited or deleted", async () => {
    const update = await cast.a.client.from("consents").update({ version: "x" }).eq("user_id", cast.a.id)
    expect(update.error?.code).toBe(PERMISSION_DENIED)
    const del = await cast.a.client.from("consents").delete().eq("user_id", cast.a.id)
    expect(del.error?.code).toBe(PERMISSION_DENIED)
  })
})

describe("events RLS", () => {
  it("signup emits signup_completed", async () => {
    const { data } = await cast.a.client.from("events").select("name").eq("name", "signup_completed")
    expect(data).toEqual([{ name: "signup_completed" }])
  })

  it("users insert their own events", async () => {
    const { error } = await cast.a.client.from("events").insert({ user_id: cast.a.id, name: "weight_logged", props: {} })
    expect(error).toBeNull()
  })

  it("users cannot insert events for someone else or with no user", async () => {
    for (const user_id of [cast.b.id, null]) {
      const { error } = await cast.a.client.from("events").insert({ user_id, name: "weight_logged" })
      expect(error?.code).toBe(PERMISSION_DENIED)
    }
  })

  it("users cannot backdate events", async () => {
    const { error } = await cast.a.client
      .from("events")
      .insert({ user_id: cast.a.id, name: "weight_logged", created_at: "2000-01-01T00:00:00Z" })
    expect(error?.code).toBe(PERMISSION_DENIED)
  })

  it("the coach reads assigned users' events only", async () => {
    const { data } = await cast.coach.client.from("events").select("user_id")
    const ids = new Set(data?.map((r) => r.user_id))
    expect(ids.has(cast.a.id)).toBe(true)
    expect(ids.has(cast.outsider.id) || ids.has(cast.otherMember.id)).toBe(false)
  })

  it("users cannot read other users' events", async () => {
    const { data } = await cast.a.client.from("events").select("user_id").eq("user_id", cast.b.id)
    expect(data).toEqual([])
  })

  it("anonymous visitors cannot insert events directly", async () => {
    const { error } = await cast.anon.from("events").insert({ user_id: null, name: "signup_started" })
    expect(error?.code).toBe(PERMISSION_DENIED)
  })

  it("users cannot write server only events", async () => {
    for (const name of SERVER_ONLY_EVENTS) {
      const { error } = await cast.a.client.from("events").insert({ user_id: cast.a.id, name })
      expect(error?.code, name).toBe(PERMISSION_DENIED)
    }
  })

  it("the database accepts exactly the PRD event names in core/events/names.ts", async () => {
    const known = await cast.admin
      .from("events")
      .insert(EVENT_NAMES.map((name) => ({ user_id: null, name, props: { test: "names" } })))
      .select("id")
    expect(known.error).toBeNull()
    await cast.admin.from("events").delete().in("id", known.data?.map((r) => r.id) ?? [])

    const unknown = await cast.admin.from("events").insert({ user_id: null, name: "page_view" })
    expect(unknown.error?.code).toBe(CHECK_VIOLATION)
  })

  it("deleting an account keeps its events without the user id", async () => {
    const { data } = await cast.admin.auth.admin.createUser({ email: `rls-deleted-${Date.now()}@example.test` })
    const userId = data.user!.id
    const marker = `deleted-${userId}`
    await cast.admin.from("events").insert({ user_id: userId, name: "weight_logged", props: { marker } })

    await cast.admin.auth.admin.deleteUser(userId)
    const { data: kept } = await cast.admin.from("events").select("id, user_id").eq("props->>marker", marker)
    expect(kept).toHaveLength(1)
    expect(kept?.[0].user_id).toBeNull()
    await cast.admin.from("events").delete().eq("id", kept![0].id)
  })

  it("events cannot be edited or deleted", async () => {
    const update = await cast.a.client.from("events").update({ name: "x" }).eq("user_id", cast.a.id)
    expect(update.error?.code).toBe(PERMISSION_DENIED)
    const del = await cast.a.client.from("events").delete().eq("user_id", cast.a.id)
    expect(del.error?.code).toBe(PERMISSION_DENIED)
  })
})
