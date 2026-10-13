import { randomUUID } from "node:crypto"
import { inject } from "vitest"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export interface TestUser {
  id: string
  email: string
  client: SupabaseClient
}

/**
 * The cast every RLS suite uses (ARCHITECTURE.md "two users and the coach"):
 *   coach       coach of a and b
 *   a, b        members assigned to coach
 *   outsider    member with no coach
 *   otherCoach  a second coach, with otherMember assigned to them
 */
export interface Cast {
  admin: SupabaseClient
  anon: SupabaseClient
  coach: TestUser
  a: TestUser
  b: TestUser
  outsider: TestUser
  otherCoach: TestUser
  otherMember: TestUser
}

export async function createCast(): Promise<Cast> {
  const { url, anonKey, serviceRoleKey } = inject("supabase")
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const run = randomUUID().slice(0, 8)

  async function user(label: string, role: "member" | "coach", coachId: string | null): Promise<TestUser> {
    const email = `rls-${run}-${label}@example.test`
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { coach_visibility_accepted: true },
    })
    if (error) throw error
    const id = data.user.id
    const update = await admin.from("profiles").update({ role, coach_id: coachId }).eq("id", id)
    if (update.error) throw update.error
    return { id, email, client: await signIn(url, anonKey, admin, email) }
  }

  const coach = await user("coach", "coach", null)
  const otherCoach = await user("other-coach", "coach", null)
  const [a, b, outsider, otherMember] = await Promise.all([
    user("a", "member", coach.id),
    user("b", "member", coach.id),
    user("outsider", "member", null),
    user("other-member", "member", otherCoach.id),
  ])

  return { admin, anon, coach, a, b, outsider, otherCoach, otherMember }
}

/** Signs in through the same email OTP path the app uses. */
async function signIn(url: string, anonKey: string, admin: SupabaseClient, email: string): Promise<SupabaseClient> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email })
  if (error) throw error
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const verified = await client.auth.verifyOtp({ type: "magiclink", token_hash: data.properties.hashed_token })
  if (verified.error) throw verified.error
  return client
}

export async function deleteCast(cast: Cast) {
  const ids = [cast.a, cast.b, cast.outsider, cast.otherMember, cast.coach, cast.otherCoach].map((u) => u.id)
  for (const id of ids) await cast.admin.auth.admin.deleteUser(id)
}

/** Postgres "insufficient_privilege": blocked by a column or table grant. */
export const PERMISSION_DENIED = "42501"

/** Postgres "check_violation": a check constraint refused the row. */
export const CHECK_VIOLATION = "23514"
