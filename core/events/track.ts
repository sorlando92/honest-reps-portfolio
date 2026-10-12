import "server-only"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isPreAuthEvent, type EventName, type EventProps } from "./names"

export type TrackResult = "recorded" | "rejected"

/**
 * Records an analytics event. Signed in users write through RLS as
 * themselves. Without a session, only pre auth events are accepted and they
 * are stored with no user id. Tracking never throws into the caller.
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

    const { error } = await createAdminClient().from("events").insert({ user_id: null, name, props })
    return error ? "rejected" : "recorded"
  } catch {
    return "rejected"
  }
}
