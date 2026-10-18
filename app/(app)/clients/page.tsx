import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getCurrentUser } from "@/core/auth/current-user"
import { InviteActions } from "@/core/invites/ui/invite-actions"
import { InviteForm } from "@/core/invites/ui/invite-form"
import { firstName } from "@/core/people"
import { createClient } from "@/lib/supabase/server"
import { EmptyState, Screen } from "@/components/screen"
import { tidyCase } from "@/modules/nutrition/foods/label"

export const metadata: Metadata = { title: "Clients" }

export default function ClientsPage() {
  return (
    <Suspense fallback={null}>
      <CoachOnly />
    </Suspense>
  )
}

async function CoachOnly() {
  const user = await getCurrentUser()
  if (user.role !== "coach") notFound()
  return (
    <Screen title="Clients">
      <WeekCheckins coachId={user.id} timezone={user.timezone} />
      <InviteForm />
      <Invites />
      <FoodLookups />
    </Screen>
  )
}

/** PRD F5: this week's submitted check-ins, unreplied first, each opening the reply screen. */
async function WeekCheckins({ coachId, timezone }: { coachId: string; timezone: string }) {
  const supabase = await createClient()
  const { data: latest } = await supabase.from("checkins").select("week_of").eq("coach_id", coachId).order("week_of", { ascending: false }).limit(1).maybeSingle()
  if (!latest) return <EmptyState>No check-ins yet. Invite clients below.</EmptyState>
  const { data: rows } = await supabase
    .from("checkins")
    // eslint-disable-next-line honest-reps/copy-rules
    .select("id, submitted_at, on_time, person:profiles!checkins_user_id_fkey(display_name), replies:messages(id)")
    .eq("coach_id", coachId)
    .eq("week_of", latest.week_of)
    .not("submitted_at", "is", null)
    .order("submitted_at")
  const list = (rows ?? []).map((r) => ({
    id: r.id as string,
    name: firstName((r.person as unknown as { display_name: string | null } | null)?.display_name) ?? "Client",
    late: r.on_time === false,
    replied: ((r.replies as unknown[] | null) ?? []).length > 0,
    at: r.submitted_at as string,
  }))
  list.sort((a, b) => Number(a.replied) - Number(b.replied))
  const day = new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: timezone })

  return (
    <section aria-labelledby="week-checkins" className="flex flex-col gap-2">
      <h2 id="week-checkins" className="text-headline">
        Check-ins this week
      </h2>
      {list.length === 0 ? (
        <EmptyState>No check-ins sent yet this week.</EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg bg-surface">
          {list.map((c) => (
            <li key={c.id}>
              <Link href={`/clients/checkin?id=${c.id}`} className="flex min-h-11 items-center justify-between gap-3 px-4 py-3">
                <span className="text-body">{c.name}</span>
                <span className="text-caption text-text-muted">
                  {[day.format(new Date(c.at)), c.late ? "Late" : null, c.replied ? "Replied" : "Needs reply"].filter(Boolean).join(", ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Not used, revoked or expired. */
function isPending(i: { claimed_at: unknown; revoked_at: unknown; expires_at: unknown }): boolean {
  return !i.claimed_at && !i.revoked_at && new Date(i.expires_at as string).getTime() > Date.now()
}

/** Pending invites with Resend and Revoke, then the last accepted ones with the email used (PRD F12). */
async function Invites() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("invites")
    .select("id, email, billing_source, expires_at, claimed_at, claimed_email, revoked_at")
    .order("created_at", { ascending: false })
    .limit(50)
  const pending = (data ?? []).filter(isPending)
  const accepted = (data ?? []).filter((i) => i.claimed_at).slice(0, 10)
  if (!pending.length && !accepted.length) return null
  const billing = (s: string) => (s === "external" ? "billed outside the app" : "comped")

  return (
    <section aria-labelledby="invites" className="flex flex-col gap-2">
      <h2 id="invites" className="text-headline">
        Invites
      </h2>
      <ul className="flex flex-col divide-y divide-border rounded-lg bg-surface">
        {/* Keyed by email: a resend replaces the row, and its new link stays on screen. */}
        {pending.map((i) => (
          <li key={`pending-${i.email}`} className="flex flex-col gap-1 px-4 py-3">
            <p className="text-body">{i.email as string}</p>
            <p className="text-caption text-text-muted">{`Pending, ${billing(i.billing_source as string)}`}</p>
            <InviteActions id={i.id as string} email={i.email as string} />
          </li>
        ))}
        {accepted.map((i) => (
          <li key={i.id as string} className="flex flex-col gap-1 px-4 py-3">
            <p className="text-body">{i.email as string}</p>
            <p className="text-caption text-text-muted">{`Joined as ${i.claimed_email ?? "unknown email"}, ${billing(i.billing_source as string)}`}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

interface LookupRow {
  id: string
  gtin: string | null
  raw_read: string
  result: "hit" | "miss"
  outcome: "confirmed" | "not_this" | null
  created_at: string
  person: { display_name: string | null } | null
  returned: { name: string; brand: string | null } | null
  chosen: { name: string; brand: string | null } | null
}

const food = (f: { name: string; brand: string | null } | null) => (f ? tidyCase([f.brand, f.name].filter(Boolean).join(" ")) : null)

/**
 * docs/FOOD_LOOKUP_SPEC.md "Admin view": the last 50 barcode misses and
 * mismatches across the coach's clients (and the coach's own scans), with
 * the product, who scanned it and what they chose instead. Read only; RLS
 * decides whose scans are visible.
 */
async function FoodLookups() {
  const supabase = await createClient()
  // The "!" in the select names a foreign key for PostgREST; it is not copy.
  const { data } = await supabase
    .from("barcode_scans")
    .select(
      // eslint-disable-next-line honest-reps/copy-rules
      "id, gtin, raw_read, result, outcome, created_at, person:profiles!barcode_scans_user_id_fkey(display_name), returned:food_items!barcode_scans_food_item_id_fkey(name, brand), chosen:food_items!barcode_scans_chosen_food_item_id_fkey(name, brand)"
    )
    .or("result.eq.miss,outcome.eq.not_this")
    .order("created_at", { ascending: false })
    .limit(50)
  const rows = (data ?? []) as unknown as LookupRow[]

  return (
    <section aria-labelledby="food-lookups" className="flex flex-col gap-2 pt-4">
      <h2 id="food-lookups" className="text-headline">
        Food lookups
      </h2>
      <p className="text-caption text-text-muted">Barcode misses and wrong products, newest first.</p>
      {rows.length === 0 ? (
        <EmptyState>No misses or wrong products yet.</EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg bg-surface px-4">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-0.5 py-3">
              <span className="text-body break-words">{r.result === "miss" ? "Not found" : `Wrong product: ${food(r.returned) ?? "unknown"}`}</span>
              <span className="text-caption text-text-muted tabular-nums">
                {[r.person?.display_name || "Client", r.gtin ?? r.raw_read, new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })].join(" · ")}
              </span>
              <span className="text-caption text-text-muted">{food(r.chosen) ? `Chose ${food(r.chosen)}` : "No replacement chosen"}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
