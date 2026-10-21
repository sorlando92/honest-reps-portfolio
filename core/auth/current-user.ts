import "server-only"
import { cache } from "react"
import { redirect } from "next/navigation"
import * as Sentry from "@sentry/nextjs"
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
  /** PRD F1: set once the user finishes onboarding. */
  onboardingCompleted: boolean
  /** Set by the coach (core/auth/ai-access.ts). The UI hides AI entry points when off; the AI routes check it themselves. */
  aiEnabled: boolean
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

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, tier, timezone, onboarding_completed_at, ai_enabled")
    .eq("id", claims.sub)
    .single()

  // A valid token with no profile row (PGRST116): the account was deleted. Clear the
  // session, or sign in and Today would bounce. Any other failure is an error, not a sign out.
  if (!profile) {
    if (error?.code === "PGRST116") redirect("/auth/signout")
    throw new Error(`Profile lookup failed: ${error?.code ?? "no row"}`)
  }

  // Server errors in this request carry the user id only (lib/monitoring).
  Sentry.setUser({ id: claims.sub })

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    role: profile.role as Role,
    tier: profile.tier as "free" | "paid",
    timezone: profile.timezone as string,
    onboardingCompleted: profile.onboarding_completed_at !== null,
    aiEnabled: profile.ai_enabled === true,
  }
})
