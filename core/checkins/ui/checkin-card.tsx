import Link from "next/link"
import type { SupabaseClient } from "@supabase/supabase-js"
import { checkinState, isDue, isOverdue, lastOpenDay } from "../state"

/**
 * Today's check-in card (DESIGN_SYSTEM "Today" 5, PRD F5): while the week's
 * check-in is open and unsent, a paid client sees it here. An unread coach
 * reply shows here too until it is read on the Coach tab.
 */
export async function CheckinCard({ supabase, userId, timezone }: { supabase: SupabaseClient; userId: string; timezone: string }) {
  const [state, { count: unread }] = await Promise.all([
    checkinState(supabase, userId),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("thread_user_id", userId).is("read_at", null),
  ])

  if (unread) {
    return (
      <Link href="/coach" className="flex min-h-11 items-center justify-between rounded-lg bg-surface px-4 py-3">
        <span className="text-headline">Your coach replied.</span>
        <span className="text-body text-accent-strong">Read</span>
      </Link>
    )
  }
  if (!isDue(state)) return null

  const late = isOverdue(state)
  return (
    <section aria-labelledby="checkin-card" className="flex flex-col gap-2 rounded-lg bg-surface px-4 py-3">
      <h2 id="checkin-card" className="text-headline">
        Weekly check-in
      </h2>
      <p className="text-body text-text-muted">
        {late ? `Overdue. Still open through ${lastOpenDay(state, timezone)}.` : "Takes under a minute."}
      </p>
      <Link href="/checkin" className="inline-flex h-12 items-center justify-center rounded-md bg-accent px-6 text-body font-semibold text-on-accent">
        Start check-in
      </Link>
    </section>
  )
}
