import "server-only"
import { z } from "zod"
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"
import { aiModel, anthropic, EXTRACTION_SAFETY_RULES, supportsServerFallback, type AiCallRecord } from "./client.ts"

// AI_PROMPTS.md "P2 label mode". Bump the version whenever the locked text or
// schema changes; it is logged with every call in ai_calls.
const P2_LABEL_VERSION = "p2-label-2026-10-17.1"

// Locked layer, verbatim from AI_PROMPTS.md, after the safety rules.
const P2_LABEL_SYSTEM = `${EXTRACTION_SAFETY_RULES}

You read the Nutrition Facts panel in a photo of a packaged food for a nutrition tracker.
Return the serving size as printed (for example "1 scoop (34 g)"), the serving weight in grams or the serving volume in milliliters when printed, and per serving: calories, protein, total carbohydrate and total fat in grams.
If the panel has more than one column, use the per serving column for one serving as packaged.
Read only what is printed. Never estimate or calculate a number that is not legible; return null for it.
Return the product name and brand only if they are printed in the photo, otherwise null.
Set confidence to 0.9 or higher only when every number you return is clearly legible. Use 0.5 or lower if any number is blurry, cut off or uncertain.
If the photo does not show a Nutrition Facts panel, return null for every value and confidence 0.
Output only JSON that matches the schema.`

export const P2LabelOutput = z.object({
  product_name: z.string().nullable(),
  brand: z.string().nullable(),
  serving_label: z.string().nullable(),
  serving_grams: z.number().nullable(),
  serving_ml: z.number().nullable(),
  calories: z.number().nullable(),
  protein_g: z.number().nullable(),
  carbs_g: z.number().nullable(),
  fat_g: z.number().nullable(),
  confidence: z.number(),
})

export type P2LabelOutput = z.infer<typeof P2LabelOutput>

export const LABEL_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
export type LabelMediaType = (typeof LABEL_MEDIA_TYPES)[number]

/** Numbers must be finite and not negative; the schema alone cannot say so. */
function clean(o: P2LabelOutput): P2LabelOutput {
  const n = (v: number | null) => (v !== null && Number.isFinite(v) && v >= 0 && v < 10000 ? v : null)
  return {
    ...o,
    serving_grams: n(o.serving_grams),
    serving_ml: n(o.serving_ml),
    calories: n(o.calories),
    protein_g: n(o.protein_g),
    carbs_g: n(o.carbs_g),
    fat_g: n(o.fat_g),
    confidence: Math.min(Math.max(o.confidence, 0), 1),
  }
}

export interface P2LabelResult {
  /** Null when both attempts failed: the form opens with only the GTIN (fallback). */
  output: P2LabelOutput | null
  record: AiCallRecord
}

/** P2 label mode: a Nutrition Facts photo to label values. Retries once, never throws. */
export async function runP2Label(image: { data: string; mediaType: LabelMediaType }, ctx: { model?: string } = {}): Promise<P2LabelResult> {
  const model = ctx.model ?? aiModel()
  const started = Date.now()
  const tokens = { input: 0, output: 0 }
  let servedBy = model
  let lastError: string | null = null

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await anthropic().beta.messages.parse({
        model,
        max_tokens: 4000,
        ...(supportsServerFallback(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        output_config: { effort: "low", format: betaZodOutputFormat(P2LabelOutput) },
        system: P2_LABEL_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
              { type: "text", text: "Read this Nutrition Facts panel." },
            ],
          },
        ],
      })
      tokens.input += response.usage.input_tokens
      tokens.output += response.usage.output_tokens
      servedBy = response.model
      if (response.stop_reason === "refusal") {
        lastError = `refusal: ${response.stop_details?.category ?? "unknown"}`
        break
      }
      if (response.parsed_output) {
        return { output: clean(response.parsed_output), record: record(attempt === 1 ? "ok" : "retried", attempt === 1 ? "passed" : "failed_then_passed", null) }
      }
      lastError = `invalid output (stop_reason ${response.stop_reason})`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }
  return { output: null, record: record("fallback", "failed", lastError) }

  function record(outcome: AiCallRecord["outcome"], validation: AiCallRecord["validation"], error: string | null): AiCallRecord {
    return { promptId: "P2", promptVersion: P2_LABEL_VERSION, model: servedBy, latencyMs: Date.now() - started, inputTokens: tokens.input, outputTokens: tokens.output, outcome, validation, error }
  }
}
