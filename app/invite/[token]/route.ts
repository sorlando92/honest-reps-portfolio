import { NextResponse, type NextRequest } from "next/server"
import { redirectTo } from "@/core/invites/redirect"
import { hashInviteToken, INVITE_COOKIE, looksLikeInviteToken } from "@/core/invites/token"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

/**
 * The invite link (PRD F12, Q69). Signed out: the token waits in a cookie
 * while the person signs in by any method with any email, then
 * /invite/accept claims it. Signed in with the invited email: claimed now.
 * Signed in as someone else: asked to sign out first.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/invite/[token]">) {
  const { token } = await params
  const to = redirectTo
  if (!looksLikeInviteToken(token)) return to("/invite/status?s=expired")

  const { data: invite } = await createAdminClient()
    .from("invites")
    .select("email, expires_at, claimed_by, claimed_at, revoked_at")
    .eq("token_hash", hashInviteToken(token))
    .maybeSingle()

  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub ?? null
  const email = typeof data?.claims?.email === "string" ? data.claims.email.toLowerCase() : null

  if (!invite || invite.revoked_at || new Date(invite.expires_at as string) <= new Date()) {
    return invite?.claimed_at ? claimedOutcome(invite.claimed_by as string, userId, to) : to("/invite/status?s=expired")
  }
  if (invite.claimed_at) return claimedOutcome(invite.claimed_by as string, userId, to)

  if (!userId) {
    const res = to("/sign-in")
    res.cookies.set(INVITE_COOKIE, token, {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      expires: new Date(invite.expires_at as string),
    })
    return res
  }
  if (email !== (invite.email as string).toLowerCase()) return to(`/invite/status?s=other&t=${token}`)

  const { data: status } = await supabase.rpc("claim_invite", { p_token: token })
  return status === "claimed" || status === "yours" ? to("/today") : to(`/invite/status?s=${status === "used" ? "used" : "expired"}`)
}

function claimedOutcome(claimedBy: string, userId: string | null, to: (path: string) => NextResponse) {
  return claimedBy === userId ? to("/today") : to("/invite/status?s=used")
}
