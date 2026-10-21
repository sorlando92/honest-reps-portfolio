import { createHash, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createCast, deleteCast, PERMISSION_DENIED, type Cast } from "./fixtures"

// Invite-only signup (migration 20261020000002, security audit M1).
// outside.test is not on the local allowlist; example.test is.

let cast: Cast
beforeAll(async () => {
  cast = await createCast()
})
afterAll(async () => {
  await deleteCast(cast)
})

const event = (email: string) => ({ event: { user: { email } } })

describe("hook_before_user_created", () => {
  it("only Supabase Auth can call it, never the API roles", async () => {
    for (const client of [cast.anon, cast.a.client, cast.coach.client]) {
      const { error } = await client.rpc("hook_before_user_created", event("x@outside.test"))
      expect(error?.code).toBe(PERMISSION_DENIED)
    }
  })

  it("refuses a new email without an open invite", async () => {
    const { error } = await cast.anon.auth.signInWithOtp({ email: `rls-${randomUUID().slice(0, 8)}@outside.test`, options: { shouldCreateUser: true } })
    expect(error?.status).toBe(403)
    expect(error?.message).toBe("invite_required")
  })

  it("allows an email with an open invite, but not a revoked or expired one", async () => {
    const run = randomUUID().slice(0, 8)
    const invite = (email: string, extra: Record<string, unknown>) => ({
      coach_id: cast.coach.id,
      email,
      token_hash: createHash("sha256").update(`${run}-${email}`).digest("hex"),
      billing_source: "comped",
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      // One batch: every row needs every column, or PostgREST sends null.
      revoked_at: null,
      created_at: new Date().toISOString(),
      ...extra,
    })
    const open = `rls-${run}-open@outside.test`
    const revoked = `rls-${run}-revoked@outside.test`
    const expired = `rls-${run}-expired@outside.test`
    const inserted = await cast.admin.from("invites").insert([
      invite(open, {}),
      invite(revoked, { revoked_at: new Date().toISOString() }),
      invite(expired, { expires_at: new Date(Date.now() - 1000).toISOString(), created_at: new Date(Date.now() - 86_400_000).toISOString() }),
    ])
    expect(inserted.error).toBeNull()

    const ok = await cast.anon.auth.signInWithOtp({ email: open.toUpperCase(), options: { shouldCreateUser: true } })
    expect(ok.error).toBeNull()
    for (const email of [revoked, expired]) {
      const { error } = await cast.anon.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
      expect(error?.message, email).toBe("invite_required")
    }

    const { data } = await cast.admin.auth.admin.listUsers({ perPage: 1000 })
    for (const u of data.users.filter((u) => u.email?.startsWith(`rls-${run}`))) await cast.admin.auth.admin.deleteUser(u.id)
    await cast.admin.from("invites").delete().like("email", `rls-${run}-%`)
  })
})
