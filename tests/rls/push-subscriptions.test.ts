import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { CHECK_VIOLATION, createCast, deleteCast, PERMISSION_DENIED, type Cast, type TestUser } from "./fixtures"

let cast: Cast
beforeAll(async () => {
  cast = await createCast()
})
afterAll(async () => {
  await deleteCast(cast)
})

const sub = (user: TestUser, n: number) => ({ user_id: user.id, endpoint: `https://push.example.test/${user.id}/${n}`, p256dh: "key", auth: "secret" })

describe("push_subscriptions RLS", () => {
  it("a user saves, reads, refreshes and removes their own subscriptions", async () => {
    expect((await cast.a.client.from("push_subscriptions").insert(sub(cast.a, 1))).error).toBeNull()
    expect((await cast.a.client.from("push_subscriptions").select("endpoint").eq("user_id", cast.a.id)).data).toHaveLength(1)
    const seen = await cast.a.client.from("push_subscriptions").update({ last_seen_at: new Date().toISOString() }).eq("endpoint", sub(cast.a, 1).endpoint).select("id")
    expect(seen.data).toHaveLength(1)
    expect((await cast.a.client.from("push_subscriptions").delete().eq("endpoint", sub(cast.a, 1).endpoint)).error).toBeNull()
  })

  it("nobody else, not even the coach, reads or writes them", async () => {
    await cast.a.client.from("push_subscriptions").insert(sub(cast.a, 2))
    for (const user of [cast.b, cast.coach, cast.outsider]) {
      expect((await user.client.from("push_subscriptions").select("id").eq("user_id", cast.a.id)).data).toEqual([])
    }
    expect((await cast.b.client.from("push_subscriptions").insert(sub(cast.a, 3))).error?.code).toBe(PERMISSION_DENIED)
    expect((await cast.anon.from("push_subscriptions").select("id")).data ?? []).toEqual([])
  })

  it("only https endpoints", async () => {
    const bad = await cast.a.client.from("push_subscriptions").insert({ ...sub(cast.a, 4), endpoint: "http://insecure.example.test/x" })
    expect(bad.error?.code).toBe(CHECK_VIOLATION)
  })
})
