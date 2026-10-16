import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { CHECK_VIOLATION, createCast, deleteCast, PERMISSION_DENIED, type Cast } from "./fixtures"

let cast: Cast
beforeAll(async () => {
  cast = await createCast()
})
afterAll(async () => {
  await deleteCast(cast)
})

describe("day_notes RLS", () => {
  it("a user writes one note per local day and replaces it", async () => {
    expect((await cast.a.client.from("day_notes").insert({ user_id: cast.a.id, local_date: "2026-10-14", body: "Slept badly" })).error).toBeNull()
    expect((await cast.a.client.from("day_notes").insert({ user_id: cast.a.id, local_date: "2026-10-14", body: "again" })).error?.code).toBe("23505")
    const saved = await cast.a.client
      .from("day_notes")
      .upsert({ user_id: cast.a.id, local_date: "2026-10-14", body: "Slept badly, trained anyway" }, { onConflict: "user_id,local_date" })
      .select("body")
    expect(saved.data).toEqual([{ body: "Slept badly, trained anyway" }])
  })

  it("the assigned coach reads but cannot write; others see nothing", async () => {
    expect((await cast.coach.client.from("day_notes").select("body").eq("user_id", cast.a.id)).data).toEqual([{ body: "Slept badly, trained anyway" }])
    expect((await cast.coach.client.from("day_notes").insert({ user_id: cast.a.id, local_date: "2026-10-13", body: "x" })).error?.code).toBe(PERMISSION_DENIED)
    expect((await cast.coach.client.from("day_notes").update({ body: "edited" }).eq("user_id", cast.a.id).select()).data).toEqual([])
    expect((await cast.coach.client.from("day_notes").delete().eq("user_id", cast.a.id).select()).data).toEqual([])
    for (const user of [cast.b, cast.outsider, cast.otherCoach]) {
      expect((await user.client.from("day_notes").select("body").eq("user_id", cast.a.id)).data).toEqual([])
    }
    expect((await cast.anon.from("day_notes").select("body").eq("user_id", cast.a.id)).data ?? []).toEqual([])
  })

  it("the owner deletes; empty and over 1,000 characters are refused", async () => {
    expect((await cast.a.client.from("day_notes").insert({ user_id: cast.a.id, local_date: "2026-10-12", body: "" })).error?.code).toBe(CHECK_VIOLATION)
    expect((await cast.a.client.from("day_notes").insert({ user_id: cast.a.id, local_date: "2026-10-12", body: "x".repeat(1001) })).error?.code).toBe(CHECK_VIOLATION)
    expect((await cast.a.client.from("day_notes").delete().eq("user_id", cast.a.id).eq("local_date", "2026-10-14")).error).toBeNull()
  })
})
