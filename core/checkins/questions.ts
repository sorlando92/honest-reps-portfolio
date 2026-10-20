// Check-in questions as the form and the server read them. No zod here: the
// check-in form imports this file. Submission checks live in submission.ts.

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
