import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createCast, deleteCast, PERMISSION_DENIED, type Cast } from "./fixtures"

let cast: Cast
const testKey = `rls_test_${Date.now()}`

beforeAll(async () => {
  cast = await createCast()
  const res = await cast.admin.from("coach_settings").insert({ coach_id: cast.coach.id, checkin_day: 5 })
  if (res.error) throw res.error
})
afterAll(async () => {
  await cast.admin.from("app_config").delete().eq("key", testKey)
  await deleteCast(cast)
})

describe("app_config RLS", () => {
  it("signed in users read config", async () => {
    const { error, data } = await cast.a.client.from("app_config").select("key")
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it("anonymous visitors cannot read config", async () => {
    const { data, error } = await cast.anon.from("app_config").select("key")
    expect(error?.code === PERMISSION_DENIED || (data ?? []).length === 0).toBe(true)
  })

  it("members cannot write config", async () => {
    const { error } = await cast.a.client.from("app_config").insert({ key: testKey, value: 1 })
    expect(error?.code).toBe(PERMISSION_DENIED)
  })

  it("the coach writes config", async () => {
    const insert = await cast.coach.client.from("app_config").insert({ key: testKey, value: 1 })
    expect(insert.error).toBeNull()
    const update = await cast.coach.client.from("app_config").update({ value: 2 }).eq("key", testKey).select("value")
    expect(update.data).toEqual([{ value: 2 }])
  })
})

describe("coach_settings RLS", () => {
  it("a user reads their own coach's settings", async () => {
    const { data } = await cast.a.client.from("coach_settings").select("coach_id")
    expect(data).toEqual([{ coach_id: cast.coach.id }])
  })

  it("users of another coach, and users with no coach, read nothing", async () => {
    for (const user of [cast.outsider, cast.otherMember, cast.otherCoach]) {
      const { data } = await user.client.from("coach_settings").select("coach_id").eq("coach_id", cast.coach.id)
      expect(data).toEqual([])
    }
  })

  it("members cannot change settings", async () => {
    const { data } = await cast.a.client.from("coach_settings").update({ checkin_day: 1 }).eq("coach_id", cast.coach.id).select()
    expect(data).toEqual([])
  })

  it("the coach updates their own settings but not another coach's", async () => {
    const own = await cast.coach.client.from("coach_settings").update({ checkin_day: 4 }).eq("coach_id", cast.coach.id).select("checkin_day")
    expect(own.data).toEqual([{ checkin_day: 4 }])
    const insertOther = await cast.otherCoach.client.from("coach_settings").insert({ coach_id: cast.coach.id, checkin_day: 1 })
    expect(insertOther.error).not.toBeNull()
  })

  it("a member cannot create coach settings for themselves", async () => {
    const { error } = await cast.a.client.from("coach_settings").insert({ coach_id: cast.a.id, checkin_day: 1 })
    expect(error?.code).toBe(PERMISSION_DENIED)
  })

  it("nobody deletes coach settings from the client", async () => {
    const { error } = await cast.coach.client.from("coach_settings").delete().eq("coach_id", cast.coach.id)
    expect(error?.code).toBe(PERMISSION_DENIED)
  })
})
