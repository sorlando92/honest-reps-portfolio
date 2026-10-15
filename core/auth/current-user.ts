import "server-only"
import { cache } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

// A "client" is a member with tier paid (QUESTIONS.md Q3), not a role.
export type Role = "member" | "coach"

export interface CurrentUser {
  id: string
  email: string | null
  role: Role
  tier: "free" | "paid"
  /** IANA name; local days and times use it (core/time/local-day.ts). */
  timezone: string
}

/**
 * Data access layer entry point: verifies the session and returns a narrow
 * user. Redirects to sign in when there is no valid session. Cached per
 * request so many components can call it.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims?.sub) redirect("/sign-in")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tier, timezone")
    .eq("id", claims.sub)
    .single()

  if (!profile) redirect("/sign-in")

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    role: profile.role as Role,
    tier: profile.tier as "free" | "paid",
    timezone: profile.timezone as string,
  }
})
