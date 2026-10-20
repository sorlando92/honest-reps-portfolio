import type { NextRequest } from "next/server"
import { redirectTo } from "@/core/invites/redirect"
import { INVITE_COOKIE, looksLikeInviteToken } from "@/core/invites/token"
import { createClient } from "@/lib/supabase/server"

/**
 * After any sign in, the proxy sends a person holding an invite cookie here.
 * The token binds whoever signed in (AUTH_SPEC), then the cookie is cleared.
 * Onboarding and the disclosure step follow from the app layout.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(INVITE_COOKIE)?.value
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims?.sub) return redirectTo("/sign-in")

  let path = "/today"
  if (looksLikeInviteToken(token)) {
    const { data: status, error } = await supabase.rpc("claim_invite", { p_token: token })
    if (error) console.error("[invite] claim failed", { code: error.code })
    else if (status === "used") path = "/invite/status?s=used"
    else if (status === "expired" || status === "revoked" || status === "invalid") path = "/invite/status?s=expired"
  }
  const res = redirectTo(path)
  res.cookies.delete(INVITE_COOKIE)
  return res
}
