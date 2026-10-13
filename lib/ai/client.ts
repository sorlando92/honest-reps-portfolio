import "server-only"
import Anthropic from "@anthropic-ai/sdk"

// Model from ANTHROPIC_MODEL (ARCHITECTURE.md), defaulting to the current Opus.
export const DEFAULT_MODEL = "claude-opus-5-5"

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
export const GLOBAL_SAFETY_RULES = `You are a nutrition coaching assistant for a certified strength and conditioning coach. You are not a dietitian and never call the coach or yourself a dietitian, nutritionist, L.D., or L.D.N.
Do not give diet advice for diagnosing, treating, or managing any disease or medical condition (for example diabetes, kidney disease, eating disorders, pregnancy complications, food allergies beyond avoidance). If the input raises one, set medical_flag: true and keep advice general.
Never write copy with emojis, exclamation points, or em or en dashes.`

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
