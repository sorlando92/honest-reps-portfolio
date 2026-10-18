import { z } from "zod"

export type QuestionType = "weight" | "photos" | "scale" | "text"

export interface CheckinQuestion {
  id: string
  position: number
  type: QuestionType
  prompt: string
  lowLabel: string | null
  highLabel: string | null
  optional: boolean
  reportTag: string | null
}

export const TEXT_ANSWER_MAX = 1000
export const MAX_PHOTOS = 3

export function toQuestion(row: Record<string, unknown>): CheckinQuestion {
  return {
    id: row.id as string,
    position: row.position as number,
    type: row.type as QuestionType,
    prompt: row.prompt as string,
    lowLabel: (row.low_label as string | null) ?? null,
    highLabel: (row.high_label as string | null) ?? null,
    optional: Boolean(row.optional),
    reportTag: (row.report_tag as string | null) ?? null,
  }
}

const submission = z.object({
  weightKg: z.number().min(30).max(300).nullable(),
  answers: z.record(z.string(), z.union([z.number().int().min(1).max(5), z.string().max(TEXT_ANSWER_MAX)])),
})

export type CheckinSubmission = z.infer<typeof submission>

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
