import { Suspense } from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getCurrentUser } from "@/core/auth/current-user"
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
      <EmptyState>No clients yet. Your roster and review queue show up here.</EmptyState>
      <FoodLookups />
    </Screen>
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
