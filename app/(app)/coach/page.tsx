import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/core/auth/current-user"
import { checkinState, isDue } from "@/core/checkins/state"
import { createClient } from "@/lib/supabase/server"
import { EmptyState, Screen } from "@/components/screen"
import { MarkRepliesRead } from "./mark-replies-read"

export const metadata: Metadata = { title: "Coach" }

export default function CoachPage() {
  return (
    <Suspense fallback={null}>
      <MembersOnly />
    </Suspense>
  )
}

// The coach's tab bar has Clients in place of Coach (QUESTIONS.md Q22).
async function MembersOnly() {
  const user = await getCurrentUser()
  if (user.role === "coach") redirect("/clients")
  if (user.tier !== "paid") {
    return (
      <Screen title="Coach">
        <EmptyState>Your coach and messages show up here.</EmptyState>
      </Screen>
    )
  }
  return <ClientCoach userId={user.id} timezone={user.timezone} />
}

/** PRD F5: clients read their coach's check-in replies here, newest first. */
async function ClientCoach({ userId, timezone }: { userId: string; timezone: string }) {
  const supabase = await createClient()
  const [state, { data: replies }] = await Promise.all([
    checkinState(supabase, userId),
    supabase
      .from("messages")
      .select("id, body, created_at, read_at, checkin:checkins(week_of)")
      .eq("thread_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
  ])
  const unread = (replies ?? []).filter((r) => !r.read_at).map((r) => r.id as string)
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: timezone })

  return (
    <Screen title="Coach">
      {isDue(state) && (
        <Link href="/checkin" className="inline-flex h-12 items-center justify-center rounded-md bg-accent px-6 text-body font-semibold text-on-accent">
          Start check-in
        </Link>
      )}
      {replies?.length ? (
        <ul aria-label="Replies from your coach" className="flex flex-col gap-3">
          {replies.map((r) => (
            <li key={r.id as string} className="flex flex-col gap-1 rounded-lg bg-surface px-4 py-3">
              <p className="text-caption text-text-muted">{`Check-in reply, ${day.format(new Date(r.created_at as string))}`}</p>
              <p className="text-body whitespace-pre-line">{r.body as string}</p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>{"Your coach's replies to your check-ins show up here."}</EmptyState>
      )}
      {unread.length > 0 && <MarkRepliesRead ids={unread} />}
    </Screen>
  )
}
