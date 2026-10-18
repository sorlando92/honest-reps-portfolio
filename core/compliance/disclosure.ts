import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"

/** The current State disclosure version (app_config consent_versions; Q73 draft). */
export async function disclosureVersion(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase.from("app_config").select("value").eq("key", "consent_versions").maybeSingle()
  const version = (data?.value as Record<string, string> | undefined)?.mo_disclosure
  return version ?? "draft-2026-10"
}

/**
 * PRD F16: a paid client accepts the disclosure before using coaching. Invited
 * clients skip the upgrade screen, so the app asks here, once per version
 * (Q69: also for an existing account an invite binds).
 */
export async function needsDisclosure(supabase: SupabaseClient, user: { id: string; tier: "free" | "paid"; role: string }): Promise<boolean> {
  if (user.role === "coach" || user.tier !== "paid") return false
  const version = await disclosureVersion(supabase)
  const { count } = await supabase
    .from("consents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("kind", "mo_disclosure")
    .eq("version", version)
  return !count
}
