import { describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { withinRateLimit } from "./rate-limit"

const client = (rpc: () => unknown) => ({ rpc }) as unknown as SupabaseClient

describe("withinRateLimit", () => {
  it("allows only when the database answers true", async () => {
    expect(await withinRateLimit(client(async () => ({ data: true, error: null })), "k", 1, 60)).toBe(true)
    expect(await withinRateLimit(client(async () => ({ data: false, error: null })), "k", 1, 60)).toBe(false)
  })

  it("fails closed on an error, no answer or a throw", async () => {
    expect(await withinRateLimit(client(async () => ({ data: null, error: { message: "down" } })), "k", 1, 60)).toBe(false)
    expect(await withinRateLimit(client(async () => ({ data: null, error: null })), "k", 1, 60)).toBe(false)
    expect(
      await withinRateLimit(
        client(async () => {
          throw new Error("network")
        }),
        "k",
        1,
        60
      )
    ).toBe(false)
  })
})
