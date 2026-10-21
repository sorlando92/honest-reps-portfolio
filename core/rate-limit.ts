import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Counts one hit against `key` (public.hit_rate_limit, service role) and says
 * whether it is within `limit` per window. Fails closed (security audit L1):
 * an error, a missing answer or anything but true counts as over the limit.
 */
export async function withinRateLimit(admin: SupabaseClient, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("hit_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds })
    return !error && data === true
  } catch {
    return false
  }
}
