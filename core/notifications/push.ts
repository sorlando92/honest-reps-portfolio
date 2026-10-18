import "server-only"
import webpush from "web-push"
import type { SupabaseClient } from "@supabase/supabase-js"

export interface PushMessage {
  title: string
  body: string
  /** Opened on tap (public/sw.js). */
  url: string
}

let configured = false

function configure(): boolean {
  if (configured) return true
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) return false
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
  return true
}

/**
 * Sends a push to every device the user has subscribed (PRD F17). Devices the
 * push service no longer knows (404, 410) are removed. Returns how many
 * devices accepted it. Never throws.
 */
export async function pushToUser(admin: SupabaseClient, userId: string, message: PushMessage): Promise<number> {
  if (!configure()) {
    console.error("[push] VAPID keys missing; not sent", { userId })
    return 0
  }
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId)
  let sent = 0
  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint as string, keys: { p256dh: sub.p256dh as string, auth: sub.auth as string } },
        JSON.stringify(message),
        { TTL: 60 * 60 * 12 }
      )
      sent++
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) await admin.from("push_subscriptions").delete().eq("id", sub.id)
      else console.error("[push] send failed", { userId, status })
    }
  }
  return sent
}
