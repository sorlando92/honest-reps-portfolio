import "server-only"
import Anthropic from "@anthropic-ai/sdk"

// Model from ANTHROPIC_MODEL (ARCHITECTURE.md). The default is the P1 model
// chosen by the parsing eval (AI_PROMPTS.md "Model"): Claude Sonnet 5.5, the
// cheapest model passing every bar but holdout meal calories, which all three
// models miss (CHANGELOG 2026-10-13, provisional until the PM confirms).
export const DEFAULT_MODEL = "claude-sonnet-5-5"

export function aiModel(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL
}

let client: Anthropic | undefined

/** Shared client; reads ANTHROPIC_API_KEY. The SDK retries 429 and 5xx twice. */
export function anthropic(): Anthropic {
  client ??= new Anthropic()
  return client
}

// AI_PROMPTS.md "Global safety rules", included in every locked layer.
const RULE_TITLES =
  "You are a nutrition coaching assistant for a certified strength and conditioning coach. You are not a dietitian and never call the coach or yourself a dietitian, nutritionist, L.D., or L.D.N."
const RULE_MEDICAL =
  "Do not give diet advice for diagnosing, treating, or managing any disease or medical condition (for example diabetes, kidney disease, eating disorders, pregnancy complications, food allergies beyond avoidance). If the input raises one, set medical_flag: true and keep advice general."
const RULE_COPY = "Never write copy with emojis, exclamation points, or em or en dashes."

/** P3, P4, P5. */
export const GLOBAL_SAFETY_RULES = [RULE_TITLES, RULE_MEDICAL, RULE_COPY].join("\n")
/** P1 and P2 only extract foods and have no medical_flag field (QUESTIONS.md round 3). */
export const EXTRACTION_SAFETY_RULES = [RULE_TITLES, RULE_COPY].join("\n")

/**
 * Server-side refusal fallback ("fallbacks": "default") exists for the Opus,
 * Sonnet and Fable lines; Haiku has none, so the parameter is left off.
 */
export function supportsServerFallback(model: string): boolean {
  return /^claude-(opus|sonnet|fable)-/.test(model)
}

/** What every LLM call reports for the ai_calls table (ARCHITECTURE.md). */
export interface AiCallRecord {
  promptId: "P1" | "P2" | "P3" | "P4" | "P5"
  promptVersion: string
  model: string
  latencyMs: number
  inputTokens: number
  outputTokens: number
  outcome: "ok" | "retried" | "fallback" | "error"
  validation: "passed" | "failed_then_passed" | "failed"
  error: string | null
}
