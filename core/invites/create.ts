import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { coachName } from "@/core/people"
import { getPublicConfig } from "@/core/settings/public-config"
import { sendInviteEmail } from "./email"
import { hashInviteToken, newInviteToken } from "./token"

export interface IssuedInvite {
  id: string
  link: string
  emailed: boolean
}

export function inviteLink(token: string): string {
  const base = (process.env.APP_URL ?? "https://app.honestreps.app").replace(/\/$/, "")
  return `${base}/invite/${token}`
}

/** Stores a new invite (token hash only), emails the link and returns it once for Copy link. */
export async function issueInvite(
  admin: SupabaseClient,
  coach: { id: string; email: string | null },
  input: { email: string; firstName: string | null; billingSource: "comped" | "external" }
): Promise<IssuedInvite | null> {
  const token = newInviteToken()
  const { data, error } = await admin
    .from("invites")
    .insert({ coach_id: coach.id, email: input.email, first_name: input.firstName, billing_source: input.billingSource, token_hash: hashInviteToken(token) })
    .select("id")
    .single()
  if (error || !data) {
    console.error("[invite] insert failed", { code: error?.code })
    return null
  }
  const link = inviteLink(token)
  const [{ productName }, name] = await Promise.all([getPublicConfig(), coachName(admin, coach.id)])
  const emailed = await sendInviteEmail({
    to: input.email,
    firstName: input.firstName,
    coach: name,
    coachEmail: coach.email,
    productName,
    link,
  })
  if (emailed) await admin.from("invites").update({ emailed_at: new Date().toISOString() }).eq("id", data.id)
  return { id: data.id as string, link, emailed }
}
