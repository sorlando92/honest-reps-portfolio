import "server-only"
import { z } from "zod"
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"
import { aiModel, anthropic, EXTRACTION_SAFETY_RULES, supportsServerFallback, type AiCallRecord } from "./client.ts"

// AI_PROMPTS.md P1. Bump the version whenever the locked text or schema
// changes; it is logged with every call in ai_calls.
const P1_VERSION = "p1-2026-10-14.3"

// Locked layer, verbatim from AI_PROMPTS.md P1, after the safety rules.
const P1_SYSTEM = `${EXTRACTION_SAFETY_RULES}

You extract foods from a meal description for a nutrition tracker.
Return every distinct food or drink as a separate item.
For each item give: a short generic name suited to searching a food database, the quantity as a number, the unit (g, oz, ml, fl_oz, cup, tbsp, tsp, piece, slice, serving), an estimated weight in grams, and your confidence from 0 to 1.
If the user gives no amount, use the standard serving for a packaged or chain restaurant product (amount_source label), the typical size for a counted item such as an egg, an apple or a banana (measured), and otherwise a typical single adult serving with confidence at most 0.6 (estimated).
If the description includes a brand or restaurant, put it in "brand".
For each item also return amount_source: weighed when the user gives a weight in g, oz, or lb or says they weighed it; label for a packaged or chain restaurant product with a standard serving; measured for volume, spoons, fluid ounces, or counts with a known size; hand for palm, fist, cupped hand, thumb, or handful; estimated otherwise. Weight ounces and fluid ounces are different: '6 oz chicken' is weighed, '12 oz almond milk' is measured. For weighed items use the exact stated weight. For meat, fish, grains, and pasta return state as raw, cooked, or dry when stated, otherwise null. Never treat a nutrient amount like '42g protein' as a serving weight.
Do not invent foods that are not described. Ignore non-food text.
Output only JSON that matches the schema.`

export const AMOUNT_SOURCES = ["weighed", "label", "measured", "hand", "estimated"] as const
export type AmountSource = (typeof AMOUNT_SOURCES)[number]
export type FoodState = "raw" | "cooked" | "dry"

const P1Item = z.object({
  name: z.string(),
  brand: z.string().nullable(),
  quantity: z.number(),
  unit: z.string(),
  grams: z.number(),
  amount_source: z.enum(AMOUNT_SOURCES),
  state: z.enum(["raw", "cooked", "dry"]).nullable(),
  confidence: z.number(),
})

export const P1Output = z.object({
  items: z.array(P1Item),
  unparsed_text: z.string(),
})

export type P1Item = z.infer<typeof P1Item>

// AI_PROMPTS.md P1 "Confidence caps by amount source", applied in code.
const CONFIDENCE_CAPS: Record<AmountSource, number> = {
  estimated: 0.6,
  hand: 0.75,
  measured: 0.9,
  weighed: 1,
  label: 1,
}

function capConfidence(item: P1Item): P1Item {
  const capped = Math.min(Math.max(item.confidence, 0), CONFIDENCE_CAPS[item.amount_source])
  return { ...item, confidence: capped }
}

/** Grams must be a positive, finite number; the schema alone cannot say so. */
function isUsable(output: z.infer<typeof P1Output>): boolean {
  return output.items.every((i) => Number.isFinite(i.grams) && i.grams > 0 && i.name.trim() !== "")
}

export interface P1Result {
  /** Null when both attempts failed: the caller shows manual search (fallback). */
  output: { items: P1Item[]; unparsed_text: string } | null
  record: AiCallRecord
}

/**
 * P1: meal text to items. Validates with Zod, retries once on invalid
 * output, then gives up so logging never blocks. Never throws.
 */
export async function runP1(
  text: string,
  ctx: { units: "imperial" | "metric"; localTime: string; model?: string }
): Promise<P1Result> {
  const model = ctx.model ?? aiModel()
  const started = Date.now()
  const tokens = { input: 0, output: 0 }
  let servedBy = model
  let lastError: string | null = null

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await anthropic().beta.messages.parse({
        model,
        max_tokens: 8000,
        // Refused requests rerun on a fallback model inside the same call.
        ...(supportsServerFallback(model)
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
          : {}),
        // Extraction is simple; low effort keeps a log under the 20 second target.
        output_config: { effort: "low", format: betaZodOutputFormat(P1Output) },
        system: P1_SYSTEM,
        messages: [
          { role: "user", content: `${text}\n\n${JSON.stringify({ units: ctx.units, local_time: ctx.localTime })}` },
        ],
      })
      tokens.input += response.usage.input_tokens
      tokens.output += response.usage.output_tokens
      servedBy = response.model

      if (response.stop_reason === "refusal") {
        lastError = `refusal: ${response.stop_details?.category ?? "unknown"}`
        break
      }
      const parsed = response.parsed_output
      if (parsed && isUsable(parsed)) {
        return {
          output: { items: parsed.items.map(capConfidence), unparsed_text: parsed.unparsed_text },
          record: record(attempt === 1 ? "ok" : "retried", attempt === 1 ? "passed" : "failed_then_passed", null),
        }
      }
      lastError = `invalid output (stop_reason ${response.stop_reason})`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }

  return { output: null, record: record("fallback", "failed", lastError) }

  function record(outcome: AiCallRecord["outcome"], validation: AiCallRecord["validation"], error: string | null): AiCallRecord {
    return {
      promptId: "P1",
      promptVersion: P1_VERSION,
      model: servedBy,
      latencyMs: Date.now() - started,
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      outcome,
      validation,
      error,
    }
  }
}
