import "server-only"
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/admin"
import { AMOUNT_SOURCES } from "@/lib/ai/p1"
import { MEALS, mealFor, mealWindows, type Meal } from "./meals"

export const entryItem = z.object({
  name: z.string().trim().min(1).max(300),
  foodItemId: z.uuid().nullable(),
  amount: z.number().min(0).max(100000),
  unit: z.string().min(1).max(32),
  grams: z.number().min(0).max(20000),
  amountSource: z.enum(AMOUNT_SOURCES),
  state: z.enum(["raw", "cooked", "dry"]).nullable(),
  calories: z.number().min(0).max(20000),
  proteinG: z.number().min(0).max(2000),
  carbsG: z.number().min(0).max(2000),
  fatG: z.number().min(0).max(2000),
  /** Still unresolved when the user tapped Log it (PRD F2 "flagged"). */
  flagReason: z.enum(["match", "amount"]).nullable(),
  confidence: z.number().min(0).max(1).nullable(),
})

export const saveEntryBody = z.object({
  clientUuid: z.uuid(),
  loggedAt: z.iso.datetime({ offset: true }),
  method: z.enum(["text", "photo", "barcode", "search", "quick_add", "manual"]),
  /** Today v2: the meal the card shows; the server assigns one from the local time when missing. */
  meal: z.enum(MEALS).optional(),
  /** The parse that produced the card; its input and output become the audit trail. */
  aiCallId: z.uuid().nullable(),
  items: z.array(entryItem).min(1).max(30),
  /** Timeline title for entries that were not typed (a favorite's title). */
  title: z.string().trim().min(1).max(200).nullable().optional(),
  /** Quick add chips: a starred favorite or a frequent food (food_logged prop). */
  quickAddSource: z.enum(["favorite", "frequent"]).optional(),
  /** Barcode entries: the scan, whose GTIN and lookup become the audit trail. */
  scanId: z.uuid().nullable().optional(),
})

export type SaveEntryBody = z.infer<typeof saveEntryBody>

export type SaveResult = { ok: true; entryId: string; duplicate: boolean; meal: Meal } | { ok: false; error: string }

/**
 * Saves a confirmed card as the signed in user (RLS applies). The raw input
 * and model output are copied from the ai_calls row the server wrote, never
 * taken from the browser (CLAUDE.md rule 3).
 */
export async function saveEntry(supabase: SupabaseClient, userId: string, body: SaveEntryBody): Promise<SaveResult> {
  let audit: { input: string | null; output: unknown } = { input: null, output: null }
  if (body.aiCallId) {
    const { data } = await createAdminClient()
      .from("ai_calls")
      .select("user_id, input, output")
      .eq("id", body.aiCallId)
      .maybeSingle()
    if (!data || data.user_id !== userId) return { ok: false, error: "Unknown parse" }
    audit = { input: data.input, output: data.output }
  } else if (body.scanId) {
    // CLAUDE.md rule 3 for barcodes: the GTIN, what the scanner read, and where the product came from.
    const { data } = await supabase.from("barcode_scans").select("gtin, raw_read, source, food_item_id").eq("id", body.scanId).eq("user_id", userId).maybeSingle()
    if (!data) return { ok: false, error: "Unknown scan" }
    audit = { input: data.gtin ?? data.raw_read, output: { scan_id: body.scanId, raw_read: data.raw_read, source: data.source, food_item_id: data.food_item_id } }
  }

  // A favorite can outlive a custom food the user deleted: log its numbers without the link.
  const ids = [...new Set(body.items.map((i) => i.foodItemId).filter((id): id is string => id !== null))]
  const { data: known } = ids.length ? await supabase.from("food_items").select("id").in("id", ids) : { data: [] }
  const existing = new Set((known ?? []).map((r) => r.id as string))

  const meal = body.meal ?? (await defaultMeal(supabase, userId, body.loggedAt))
  const confidences = body.items.map((i) => i.confidence).filter((c): c is number => c !== null)
  const { data: entry, error } = await supabase
    .from("food_entries")
    .insert({
      user_id: userId,
      logged_at: body.loggedAt,
      meal,
      method: body.method,
      title: body.title ?? null,
      raw_input: audit.input,
      model_output: audit.output,
      confidence: confidences.length ? Math.min(...confidences) : null,
      status: "final",
      client_uuid: body.clientUuid,
      ai_call_id: body.aiCallId,
    })
    .select("id")
    .single()

  // Offline sync can send the same entry twice: the first save wins.
  if (error?.code === "23505") {
    const { data: existing } = await supabase
      .from("food_entries")
      .select("id")
      .eq("user_id", userId)
      .eq("client_uuid", body.clientUuid)
      .single()
    return existing ? { ok: true, entryId: existing.id, duplicate: true, meal } : { ok: false, error: "Save failed" }
  }
  if (error || !entry) return { ok: false, error: "Save failed" }

  const { error: itemsError } = await supabase.from("food_entry_items").insert(
    body.items.map((i, position) => ({
      entry_id: entry.id,
      user_id: userId,
      position,
      food_item_id: i.foodItemId && existing.has(i.foodItemId) ? i.foodItemId : null,
      name: i.name,
      amount: i.amount,
      unit: i.unit,
      grams: i.grams,
      amount_source: i.amountSource,
      state: i.state,
      calories: i.calories,
      protein_g: i.proteinG,
      carbs_g: i.carbsG,
      fat_g: i.fatG,
      flagged: i.flagReason !== null,
      flag_reason: i.flagReason,
    }))
  )
  if (itemsError) {
    await supabase.from("food_entries").delete().eq("id", entry.id)
    return { ok: false, error: "Save failed" }
  }
  return { ok: true, entryId: entry.id, duplicate: false, meal }
}

/** The meal for an entry by its local time in the user's timezone (docs/TODAY_SPEC.md 6). */
export async function defaultMeal(supabase: SupabaseClient, userId: string, loggedAt: string): Promise<Meal> {
  const [{ data: profile }, { data: config }] = await Promise.all([
    supabase.from("profiles").select("timezone").eq("id", userId).single(),
    supabase.from("app_config").select("value").eq("key", "meal_windows").maybeSingle(),
  ])
  return mealFor(loggedAt, profile?.timezone ?? "UTC", mealWindows(config?.value))
}

/** food_logged props (PRD section 5), including counts per amount source. */
export function foodLoggedProps(body: SaveEntryBody & { meal: Meal }, offline: boolean): Record<string, string | number | boolean> {
  const counts = Object.fromEntries(AMOUNT_SOURCES.map((s) => [`source_${s}`, body.items.filter((i) => i.amountSource === s).length]))
  const confidences = body.items.map((i) => i.confidence).filter((c): c is number => c !== null)
  return {
    method: body.method,
    meal: body.meal,
    confidence: confidences.length ? Math.min(...confidences) : 1,
    offline,
    items: body.items.length,
    ...(body.quickAddSource ? { quick_add_source: body.quickAddSource } : {}),
    ...counts,
  }
}
