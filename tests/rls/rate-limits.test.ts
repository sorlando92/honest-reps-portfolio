import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createCast, deleteCast, PERMISSION_DENIED, type Cast } from "./fixtures"

let cast: Cast
beforeAll(async () => {
  cast = await createCast()
})
afterAll(async () => {
  await deleteCast(cast)
})

// private.rate_limits is in a schema the API does not expose; the only way
// in is hit_rate_limit(), which only the service role may call.
describe("rate limits", () => {
  const args = () => ({ p_key: `test:${randomUUID()}`, p_limit: 2, p_window_seconds: 60 })

  it("anonymous visitors and signed in users cannot call it", async () => {
    for (const client of [cast.anon, cast.a.client, cast.coach.client]) {
      const { error } = await client.rpc("hit_rate_limit", args())
      expect(error?.code).toBe(PERMISSION_DENIED)
    }
  })

  it("the table is not reachable through the API", async () => {
    const { error } = await cast.a.client.schema("private").from("rate_limits").select("key")
    expect(error).not.toBeNull()
  })

  it("allows up to the limit in a window, then refuses", async () => {
    const call = args()
    const results = []
    for (let i = 0; i < 3; i++) results.push((await cast.admin.rpc("hit_rate_limit", call)).data)
    expect(results).toEqual([true, true, false])
  })
})
