import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { track } from "@/core/events/track"

// The browser's PushSubscription.toJSON().
const subscription = z.object({
  endpoint: z.url().startsWith("https://").max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
})

/** Saves this device's push subscription (PRD F1 install step, F17). */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 })
  const parsed = subscription.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 })

  const { count } = await supabase.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", userId)
  // One phone, a different person signed in: the browser keeps its endpoint,
  // so the device moves to whoever is signed in now. RLS cannot do this
  // (the old row is someone else's), so the server removes it first.
  await createAdminClient().from("push_subscriptions").delete().eq("endpoint", parsed.data.endpoint).neq("user_id", userId)
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  )
  if (error) {
    console.error("[push] subscribe failed", { userId, code: error.code, message: error.message })
    return NextResponse.json({ error: "Not saved" }, { status: 500 })
  }
  // PRD section 5: push_enabled when the user first turns reminders on.
  if (!count) await track("push_enabled", { platform: platformOf(request.headers.get("user-agent")) })
  return NextResponse.json({ ok: true })
}

/** Removes this device's subscription (reminders off on this device). */
export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims?.sub) return NextResponse.json({ error: "Sign in required" }, { status: 401 })
  const endpoint = z.url().safeParse(new URL(request.url).searchParams.get("endpoint"))
  if (!endpoint.success) return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 })
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint.data)
  return NextResponse.json({ ok: true })
}

function platformOf(ua: string | null): string {
  if (!ua) return "other"
  if (/iPhone|iPad|iPod/.test(ua)) return "ios"
  if (/Android/.test(ua)) return "android"
  return "other"
}
