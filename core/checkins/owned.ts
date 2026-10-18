import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { checkinState } from "./state"

/**
 * The signed in user's own check-in for the open week, still unsubmitted, or
 * null. Every write to a check-in goes through this check.
 */
export async function openOwnCheckin(supabase: SupabaseClient, userId: string, checkinId: string) {
  const state = await checkinState(supabase, userId)
  if (!state?.eligible || !state.isOpen || state.submittedAt || state.checkinId !== checkinId) return null
  return state
}
