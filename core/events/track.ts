import "server-only"
import { createHmac } from "node:crypto"
import { headers } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isPreAuthEvent, type EventName, type EventProps } from "./names"

export type TrackResult = "recorded" | "rejected" | "limited"

// Events before sign in, per IP per hour. A gym on one wifi network signs up
// many people from one address, so this is generous: it stops scripted
// inflation of the signup funnel, not real visitors.
const PRE_AUTH_LIMIT = 60
const PRE_AUTH_WINDOW_SECONDS = 3600

/**
 * Records an analytics event. Signed in users write through RLS as
 * themselves. Without a session, only pre auth events are accepted, rate
 * limited per IP, and stored with no user id. Tracking never throws into the
 * caller.
 */
export async function track(name: EventName, props: EventProps = {}): Promise<TrackResult> {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getClaims()
    const userId = data?.claims?.sub

    if (userId) {
      const { error } = await supabase.from("events").insert({ user_id: userId, name, props })
      return error ? "rejected" : "recorded"
    }

    if (!isPreAuthEvent(name)) return "rejected"

    const admin = createAdminClient()
    const { data: allowed, error: limitError } = await admin.rpc("hit_rate_limit", {
      p_key: `events:${await hashedClientIp()}`,
      p_limit: PRE_AUTH_LIMIT,
      p_window_seconds: PRE_AUTH_WINDOW_SECONDS,
    })
    if (limitError) return "rejected"
    if (!allowed) return "limited"

    const { error } = await admin.from("events").insert({ user_id: null, name, props })
    return error ? "rejected" : "recorded"
  } catch {
    return "rejected"
  }
}

/** The caller's IP, hashed so raw addresses are never stored. */
async function hashedClientIp(): Promise<string> {
  const h = await headers()
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown"
  // The service role key is already a server secret; it doubles as the key.
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").update(ip).digest("hex").slice(0, 32)
}
