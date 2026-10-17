import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { LABEL_MEDIA_TYPES, runP2Label, type LabelMediaType } from "@/lib/ai/p2-label"
import { candidates } from "@/modules/nutrition/foods/gtin"

// AI_PROMPTS.md P2 label mode: free for every user, so it is rate limited.
const LABELS_PER_HOUR = 20
// The phone resizes to 1568 px on the long side first; this is a backstop.
const MAX_BYTES = 5 * 1024 * 1024

/**
 * A Nutrition Facts photo to label values (docs/FOOD_LOOKUP_SPEC.md 3 "Scan
 * the label"). Nothing is saved but the ai_calls row: the user confirms the
 * values in the custom food form. The photo is not kept.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 })

  const form = await request.formData().catch(() => null)
  const photo = form?.get("photo")
  if (!(photo instanceof File) || !LABEL_MEDIA_TYPES.includes(photo.type as LabelMediaType) || photo.size === 0 || photo.size > MAX_BYTES) {
    return NextResponse.json({ error: "Invalid photo" }, { status: 400 })
  }
  const rawGtin = form?.get("gtin")
  const gtin = typeof rawGtin === "string" && rawGtin ? (candidates(rawGtin)[0] ?? null) : null

  const admin = createAdminClient()
  const { data: allowed } = await admin.rpc("hit_rate_limit", { p_key: `label:${userId}`, p_limit: LABELS_PER_HOUR, p_window_seconds: 3600 })
  if (allowed === false) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

  const result = await runP2Label({ data: Buffer.from(await photo.arrayBuffer()).toString("base64"), mediaType: photo.type as LabelMediaType })
  const call = result.record
  await admin.from("ai_calls").insert({
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
    input: gtin ? `label ${gtin}` : "label",
    output: result.output,
  })
  return NextResponse.json({ label: result.output })
}
