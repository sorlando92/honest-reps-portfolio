import "server-only"
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import { entryItem } from "./save"

export const editEntryBody = z.object({
  items: z.array(entryItem).min(1).max(30),
})

export type EditEntryBody = z.infer<typeof editEntryBody>

export type EditResult = { ok: true; props: Record<string, number> } | { ok: false; status: 400 | 404 }

/**
 * Replaces a logged entry's items as the signed in user (RLS applies). Saving
 * from the editor is the user confirming the entry (PRD F2 "Flagged"), so the
 * client sends the flags it still wants, normally none.
 */
export async function editEntry(supabase: SupabaseClient, entryId: string, body: EditEntryBody): Promise<EditResult> {
  const { data: before } = await supabase
    .from("food_entry_items")
    .select("calories, flagged")
    .eq("entry_id", entryId)
  if (!before?.length) return { ok: false, status: 404 }

  const { error } = await supabase.rpc("replace_food_entry_items", {
    p_entry_id: entryId,
    p_items: body.items.map((i) => ({
      food_item_id: i.foodItemId,
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
      flag_reason: i.flagReason,
    })),
  })
  if (error) return { ok: false, status: error.code === "42501" ? 404 : 400 }

  const kcal = (rows: { calories: number | string }[]) => Math.round(rows.reduce((s, r) => s + Number(r.calories), 0))
  return {
    ok: true,
    // food_entry_corrected: how much the correction moved the entry.
    props: {
      items_before: before.length,
      items_after: body.items.length,
      calories_delta: kcal(body.items) - kcal(before),
      flags_before: before.filter((r) => r.flagged).length,
      flags_after: body.items.filter((i) => i.flagReason !== null).length,
    },
  }
}

/** Deletes an entry and its items (cascade) as the signed in user. */
export async function deleteEntry(supabase: SupabaseClient, entryId: string): Promise<{ ok: boolean; method?: string }> {
  const { data } = await supabase.from("food_entries").delete().eq("id", entryId).select("method")
  return data?.length ? { ok: true, method: data[0].method } : { ok: false }
}
