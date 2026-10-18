import type { SupabaseClient } from "@supabase/supabase-js"

/** Q63: the first word of the display name, else none. */
export function firstName(displayName: string | null | undefined): string | null {
  const first = displayName?.trim().split(/\s+/)[0]
  return first ? first : null
}

/** The coach's first name for push and email copy (Q74, Q75); "Your coach" when unset. */
export async function coachName(admin: SupabaseClient, coachId: string | null): Promise<string> {
  if (!coachId) return "Your coach"
  const { data } = await admin.from("profiles").select("display_name").eq("id", coachId).maybeSingle()
  return firstName(data?.display_name as string | null) ?? "Your coach"
}
