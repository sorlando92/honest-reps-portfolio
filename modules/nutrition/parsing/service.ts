import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/admin"
import { DEFAULT_HAND_PORTIONS, type HandPortions } from "./hand"
import { DEFAULT_MATCH_THRESHOLD, parseMeal, type MatchedFood, type ParsedItem } from "./parse-meal"

/** A food the user can swap to, with its food_items row. */
export type DraftAlternative = MatchedFood & { foodItemId: string | null }

/** One row of the confirmation card (a draft until the user taps Log it). */
export interface DraftItem extends Omit<ParsedItem, "alternatives"> {
  /** food_items row for the match, so the saved item can reference it. */
  foodItemId: string | null
  alternatives: DraftAlternative[]
}

export interface DraftResult {
  aiCallId: string | null
  fallback: boolean
  items: DraftItem[]
  unparsedText: string
}

/**
 * Parses meal text for a signed in user: their units, their coach's hand
 * portion conversions and the app's match threshold. Logs the call in
 * ai_calls with its input and output (the saved entry copies them from
 * there) and caches every matched USDA food in food_items.
 */
export async function parseForUser(
  supabase: SupabaseClient,
  userId: string,
  text: string,
  localTime: string
): Promise<DraftResult> {
  const [{ data: profile }, { data: config }] = await Promise.all([
    supabase.from("profiles").select("units, coach_id").eq("id", userId).single(),
    supabase.from("app_config").select("value").eq("key", "parsing").maybeSingle(),
  ])
  const { data: nutrition } = profile?.coach_id
    ? await supabase.from("nutrition_coach_settings").select("hand_portions").eq("coach_id", profile.coach_id).maybeSingle()
    : { data: null }

  const result = await parseMeal(text, {
    units: profile?.units === "metric" ? "metric" : "imperial",
    localTime,
    matchThreshold: Number(config?.value?.match_threshold) || DEFAULT_MATCH_THRESHOLD,
    handPortions: { ...DEFAULT_HAND_PORTIONS, ...(nutrition?.hand_portions as Partial<HandPortions> | undefined) },
  })

  const admin = createAdminClient()
  const call = result.aiCall
  const { data: logged } = await admin
    .from("ai_calls")
    .insert({
      user_id: userId,
      prompt_id: call.promptId,
      prompt_version: call.promptVersion,
      model: call.model,
      latency_ms: call.latencyMs,
      input_tokens: call.inputTokens,
      output_tokens: call.outputTokens,
      outcome: call.outcome,
      validation: call.validation,
      error: call.error,
      input: text,
      output: result.modelOutput,
    })
    .select("id")
    .single()

  const ids = await cacheMatches(admin, result.items)
  return {
    aiCallId: logged?.id ?? null,
    fallback: result.fallback,
    unparsedText: result.unparsedText,
    items: result.items.map((item) => ({
      ...item,
      foodItemId: item.match ? (ids.get(key(item.match)) ?? null) : null,
      alternatives: item.alternatives.map((a) => ({ ...a, foodItemId: ids.get(key(a)) ?? null })),
    })),
  }
}

const key = (m: { source: string; sourceId: string }) => `${m.source}:${m.sourceId}`

/** Upserts matched USDA foods and their alternatives; curated chain items are already seeded. */
async function cacheMatches(admin: SupabaseClient, items: ParsedItem[]): Promise<Map<string, string>> {
  const matches = items.flatMap((i) => [...(i.match ? [i.match] : []), ...i.alternatives])
  const usda = [...new Map(matches.filter((m) => m.source === "usda").map((m) => [m.sourceId, m])).values()]
  if (usda.length) {
    await admin.from("food_items").upsert(
      usda.map((m) => ({
        source: "usda",
        source_id: m.sourceId,
        name: m.name,
        brand: m.brand,
        data_type: m.dataType,
        state: m.state,
        per_100g: m.per100g,
        fetched_at: new Date().toISOString(),
      })),
      { onConflict: "source,source_id" }
    )
  }
  const ids = new Map<string, string>()
  for (const source of ["usda", "custom"] as const) {
    const sourceIds = matches.filter((m) => m.source === source).map((m) => m.sourceId)
    if (!sourceIds.length) continue
    const { data } = await admin.from("food_items").select("id, source_id").eq("source", source).in("source_id", sourceIds)
    for (const row of data ?? []) ids.set(`${source}:${row.source_id}`, row.id)
  }
  return ids
}
