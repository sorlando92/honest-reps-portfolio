import { createHash, randomBytes } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createCast, deleteCast, type Cast } from "./fixtures"

let cast: Cast
const hash = (token: string) => createHash("sha256").update(token).digest("hex")
const token = () => randomBytes(32).toString("base64url")

async function invite(overrides: Record<string, unknown> = {}) {
  const raw = token()
  const { data, error } = await cast.admin
    .from("invites")
    .insert({ coach_id: cast.coach.id, email: "invited@example.test", billing_source: "comped", token_hash: hash(raw), ...overrides })
    .select("id")
    .single()
  if (error) throw error
  return { raw, id: data.id as string }
}

beforeAll(async () => {
  cast = await createCast()
  // Coach in Chicago with the seeded cycle: Friday 6:00am open, overdue 24h, review Sunday.
  await cast.admin.from("profiles").update({ timezone: "America/Chicago" }).eq("id", cast.coach.id)
  await cast.admin.from("profiles").update({ timezone: "America/New_York", tier: "paid", billing_source: "comped" }).eq("id", cast.a.id)
  const settings = await cast.admin.from("coach_settings").insert({
    coach_id: cast.coach.id,
    checkin_day: 5,
    review_day: 0,
    weekly_cycle: { checkin_opens_at: "06:00", overdue_after_hours: 24 },
    reminder_defaults: { checkin_reminder: "08:00", checkin_followup: "19:00" },
  })
  if (settings.error) throw settings.error
  const q = await cast.admin.from("checkin_questions").insert([
    { coach_id: cast.coach.id, position: 1, type: "weight", prompt: "This week's weight" },
    { coach_id: cast.coach.id, position: 2, type: "scale", prompt: "Energy this week", low_label: "Drained", high_label: "Strong", report_tag: "energy" },
  ])
  if (q.error) throw q.error
})
afterAll(async () => {
  await deleteCast(cast)
})

describe("invites RLS and claim_invite", () => {
  it("the coach reads their own invites; nobody else does; nobody writes directly", async () => {
    const { id } = await invite()
    expect((await cast.coach.client.from("invites").select("id").eq("id", id)).data).toEqual([{ id }])
    for (const user of [cast.a, cast.outsider, cast.otherCoach]) {
      expect((await user.client.from("invites").select("id").eq("id", id)).data).toEqual([])
    }
    const insert = await cast.coach.client
      .from("invites")
      .insert({ coach_id: cast.coach.id, email: "x@example.test", billing_source: "comped", token_hash: hash(token()) })
    expect(insert.error).not.toBeNull()
    expect((await cast.coach.client.from("invites").update({ revoked_at: new Date().toISOString() }).eq("id", id).select()).error).not.toBeNull()
  })

  it("binds whoever signs in, whatever their email, and sets the coach and paid flag once", async () => {
    const { raw, id } = await invite({ email: "someone-else@example.test", billing_source: "external" })
    expect((await cast.outsider.client.rpc("claim_invite", { p_token: raw })).data).toBe("claimed")
    const { data: profile } = await cast.admin.from("profiles").select("coach_id, tier, billing_source").eq("id", cast.outsider.id).single()
    expect(profile).toEqual({ coach_id: cast.coach.id, tier: "paid", billing_source: "external" })
    const { data: row } = await cast.admin.from("invites").select("claimed_by, claimed_email").eq("id", id).single()
    expect(row).toEqual({ claimed_by: cast.outsider.id, claimed_email: cast.outsider.email })
    expect((await cast.outsider.client.rpc("claim_invite", { p_token: raw })).data).toBe("yours")
    expect((await cast.b.client.rpc("claim_invite", { p_token: raw })).data).toBe("used")
  })

  it("refuses expired, revoked, unknown tokens, coaches and signed out callers", async () => {
    const expired = await invite({ expires_at: new Date(Date.now() - 1000).toISOString() })
    expect((await cast.b.client.rpc("claim_invite", { p_token: expired.raw })).data).toBe("expired")
    const revoked = await invite({ revoked_at: new Date().toISOString() })
    expect((await cast.b.client.rpc("claim_invite", { p_token: revoked.raw })).data).toBe("revoked")
    expect((await cast.b.client.rpc("claim_invite", { p_token: token() })).data).toBe("invalid")
    const live = await invite()
    expect((await cast.otherCoach.client.rpc("claim_invite", { p_token: live.raw })).data).toBe("coach")
    expect((await cast.anon.rpc("claim_invite", { p_token: live.raw })).error).not.toBeNull()
    const { data: b } = await cast.admin.from("profiles").select("tier").eq("id", cast.b.id).single()
    expect(b?.tier).toBe("free")
  })
})

describe("check-in tables RLS", () => {
  let checkinId: string
  beforeAll(async () => {
    const { data, error } = await cast.admin
      .from("checkins")
      .insert({ user_id: cast.a.id, coach_id: cast.coach.id, week_of: "2026-10-16", weight_kg: 80, answers: { x: 3 } })
      .select("id")
      .single()
    if (error) throw error
    checkinId = data.id
    await cast.admin.from("checkin_photos").insert({ checkin_id: checkinId, user_id: cast.a.id, position: 1, storage_path: `${cast.a.id}/${checkinId}/1.jpg` })
    await cast.admin.from("messages").insert({ thread_user_id: cast.a.id, sender_id: cast.coach.id, checkin_id: checkinId, body: "Nice week." })
  })

  it("questions are read by the coach and their members only", async () => {
    expect((await cast.a.client.from("checkin_questions").select("position").order("position")).data).toEqual([{ position: 1 }, { position: 2 }])
    expect((await cast.coach.client.from("checkin_questions").select("position")).data).toHaveLength(2)
    expect((await cast.otherMember.client.from("checkin_questions").select("position").eq("coach_id", cast.coach.id)).data).toEqual([])
    expect((await cast.a.client.from("checkin_questions").insert({ coach_id: cast.coach.id, position: 9, type: "text", prompt: "x" })).error).not.toBeNull()
  })

  it("the owner and the assigned coach read check-ins, photos and replies; others see nothing", async () => {
    for (const user of [cast.a, cast.coach]) {
      expect((await user.client.from("checkins").select("id").eq("id", checkinId)).data).toEqual([{ id: checkinId }])
      expect((await user.client.from("checkin_photos").select("position").eq("checkin_id", checkinId)).data).toEqual([{ position: 1 }])
      expect((await user.client.from("messages").select("body").eq("checkin_id", checkinId)).data).toEqual([{ body: "Nice week." }])
    }
    for (const user of [cast.b, cast.outsider, cast.otherCoach]) {
      expect((await user.client.from("checkins").select("id").eq("id", checkinId)).data).toEqual([])
      expect((await user.client.from("checkin_photos").select("id").eq("checkin_id", checkinId)).data).toEqual([])
      expect((await user.client.from("messages").select("id").eq("checkin_id", checkinId)).data).toEqual([])
    }
  })

  it("nobody writes check-ins or messages directly; the client only marks a reply read", async () => {
    expect((await cast.a.client.from("checkins").insert({ user_id: cast.a.id, week_of: "2026-10-09" })).error).not.toBeNull()
    expect((await cast.a.client.from("checkins").update({ on_time: true }).eq("id", checkinId).select()).error).not.toBeNull()
    expect((await cast.coach.client.from("messages").insert({ thread_user_id: cast.a.id, body: "x" })).error).not.toBeNull()
    expect((await cast.a.client.from("messages").update({ body: "edited" }).eq("checkin_id", checkinId)).error).not.toBeNull()
    const read = await cast.a.client.from("messages").update({ read_at: new Date().toISOString() }).eq("checkin_id", checkinId).select("read_at")
    expect(read.data?.[0]?.read_at).toBeTruthy()
    expect((await cast.coach.client.from("messages").update({ read_at: null }).eq("checkin_id", checkinId).select()).data).toEqual([])
  })

  it("notifications_sent and the photo bucket are server only", async () => {
    expect((await cast.a.client.from("notifications_sent").select("*")).error).not.toBeNull()
    const upload = await cast.admin.storage.from("checkin-photos").upload(`${cast.a.id}/${checkinId}/1.jpg`, new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }), { upsert: true })
    expect(upload.error).toBeNull()
    for (const user of [cast.a, cast.coach, cast.b]) {
      expect((await user.client.storage.from("checkin-photos").download(`${cast.a.id}/${checkinId}/1.jpg`)).error).not.toBeNull()
      expect(
        (await user.client.storage.from("checkin-photos").upload(`${user.id}/x/1.jpg`, new Blob([new Uint8Array([1])], { type: "image/jpeg" }))).error
      ).not.toBeNull()
    }
    await cast.admin.storage.from("checkin-photos").remove([`${cast.a.id}/${checkinId}/1.jpg`])
  })
})

describe("check-in window, state and reminders", () => {
  it("opens Friday 6:00am coach time, overdue 24 hours later, closes when Sunday starts", async () => {
    const before = await cast.a.client.rpc("checkin_state", { p_user: cast.a.id, p_now: "2026-10-23T10:59:00Z" })
    expect(before.data?.[0]).toMatchObject({ eligible: true, week_of: "2026-10-16", is_open: false })
    const open = await cast.a.client.rpc("checkin_state", { p_user: cast.a.id, p_now: "2026-10-23T11:00:00Z" })
    expect(open.data?.[0]).toMatchObject({ week_of: "2026-10-23", is_open: true, checkin_id: null })
    expect(new Date(open.data![0].overdue_at).toISOString()).toBe("2026-10-24T11:00:00.000Z")
    expect(new Date(open.data![0].closes_at).toISOString()).toBe("2026-10-25T05:00:00.000Z")
    const sunday = await cast.a.client.rpc("checkin_state", { p_user: cast.a.id, p_now: "2026-10-25T05:00:00Z" })
    expect(sunday.data?.[0]).toMatchObject({ week_of: "2026-10-23", is_open: false })
  })

  it("the coach reads a client's state; other people get nothing", async () => {
    expect((await cast.coach.client.rpc("checkin_state", { p_user: cast.a.id, p_now: "2026-10-23T12:00:00Z" })).data).toHaveLength(1)
    for (const user of [cast.b, cast.outsider, cast.otherCoach]) {
      expect((await user.client.rpc("checkin_state", { p_user: cast.a.id, p_now: "2026-10-23T12:00:00Z" })).data ?? []).toEqual([])
    }
    // b is free: a state, but not eligible.
    expect((await cast.b.client.rpc("checkin_state", { p_user: cast.b.id, p_now: "2026-10-23T12:00:00Z" })).data?.[0]?.eligible).toBe(false)
  })

  it("reminders are due on the check-in day at the client's local times, once each, until they submit", async () => {
    const due = async (at: string) =>
      ((await cast.admin.rpc("due_checkin_reminders", { p_now: at })).data ?? []).filter((r: { user_id: string }) => r.user_id === cast.a.id)
    expect(await due("2026-10-23T11:30:00Z")).toEqual([]) // 7:30am New York
    expect(await due("2026-10-23T12:05:00Z")).toEqual([{ user_id: cast.a.id, kind: "checkin_open", week_of: "2026-10-23", coach_id: cast.coach.id }])
    await cast.admin.from("notifications_sent").insert({ user_id: cast.a.id, kind: "checkin_open", ref: "2026-10-23" })
    expect(await due("2026-10-23T13:00:00Z")).toEqual([])
    expect((await due("2026-10-23T23:05:00Z")).map((r: { kind: string }) => r.kind)).toEqual(["checkin_followup"])
    await cast.admin.from("checkins").insert({ user_id: cast.a.id, coach_id: cast.coach.id, week_of: "2026-10-23", submitted_at: "2026-10-23T22:00:00Z", on_time: true })
    expect(await due("2026-10-23T23:05:00Z")).toEqual([])
    // Members and coaches cannot ask for the list.
    expect((await cast.coach.client.rpc("due_checkin_reminders", { p_now: "2026-10-23T12:05:00Z" })).error).not.toBeNull()
  })
})
