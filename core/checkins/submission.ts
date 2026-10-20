// Server-side check of a check-in submission. Kept apart from questions.ts so
// the check-in form, which needs only the limits, does not ship zod.

import { z } from "zod"
import { TEXT_ANSWER_MAX, type CheckinQuestion } from "./questions"

const submission = z.object({
  weightKg: z.number().min(30).max(300).nullable(),
  answers: z.record(z.string(), z.union([z.number().int().min(1).max(5), z.string().max(TEXT_ANSWER_MAX)])),
})

/**
 * Checks a submission against the coach's questions: every required step is
 * answered, scales are 1 to 5, texts are text, and nothing else is kept.
 * Returns the cleaned answers or the first problem.
 */
export function validateSubmission(
  questions: CheckinQuestion[],
  input: unknown
): { ok: true; weightKg: number | null; answers: Record<string, number | string> } | { ok: false; error: string } {
  const parsed = submission.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid" }
  const answers: Record<string, number | string> = {}
  let weightKg: number | null = null
  for (const q of questions) {
    if (q.type === "photos") continue
    if (q.type === "weight") {
      weightKg = parsed.data.weightKg
      if (weightKg === null && !q.optional) return { ok: false, error: `missing:${q.id}` }
      continue
    }
    const value = parsed.data.answers[q.id]
    const empty = value === undefined || (typeof value === "string" && value.trim() === "")
    if (empty) {
      if (!q.optional) return { ok: false, error: `missing:${q.id}` }
      continue
    }
    if (q.type === "scale" && typeof value !== "number") return { ok: false, error: `invalid:${q.id}` }
    if (q.type === "text" && typeof value !== "string") return { ok: false, error: `invalid:${q.id}` }
    answers[q.id] = typeof value === "string" ? value.trim() : value
  }
  return { ok: true, weightKg: weightKg === null ? null : Math.round(weightKg * 100) / 100, answers }
}
