import { redirectTo } from "@/core/invites/redirect"
import { createClient } from "@/lib/supabase/server"

/**
 * Clears a session whose account no longer exists (deleted by the under-18
 * stop or the manual runbook in ARCHITECTURE "Account deletion"), then opens
 * sign in. Without this, the proxy would send the still-valid token from
 * /sign-in back to /today, and /today back to /sign-in, until it expired.
 */
export async function GET() {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: "local" }).catch(() => {})
  return redirectTo("/sign-in")
}
