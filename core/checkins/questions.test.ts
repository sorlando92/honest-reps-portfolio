import { describe, expect, it } from "vitest"
import type { CheckinQuestion } from "./questions"
import { validateSubmission } from "./submission"
import { checkinFollowupPush, coachReplyPush } from "../notifications/copy"
import { inviteEmailContent } from "../invites/email"
import { hashInviteToken, looksLikeInviteToken, newInviteToken } from "../invites/token"

const q = (id: string, type: CheckinQuestion["type"], optional = false): CheckinQuestion => ({
  id,
  position: 1,
  type,
  prompt: id,
  lowLabel: type === "scale" ? "Low" : null,
  highLabel: type === "scale" ? "High" : null,
  optional,
  reportTag: null,
})
const questions = [q("w", "weight"), q("p", "photos", true), q("energy", "scale"), q("training", "text"), q("else", "text", true)]

describe("check-in submission", () => {
  it("keeps answered steps and trims text", () => {
    expect(validateSubmission(questions, { weightKg: 80.456, answers: { energy: 4, training: "  Good week ", else: "", extra: "x" } })).toEqual({
      ok: true,
      weightKg: 80.46,
      answers: { energy: 4, training: "Good week" },
    })
  })

  it("refuses missing required steps and wrong types", () => {
    expect(validateSubmission(questions, { weightKg: null, answers: { energy: 4, training: "x" } })).toEqual({ ok: false, error: "missing:w" })
    expect(validateSubmission(questions, { weightKg: 80, answers: { training: "x" } })).toEqual({ ok: false, error: "missing:energy" })
    expect(validateSubmission(questions, { weightKg: 80, answers: { energy: "4", training: "x" } })).toEqual({ ok: false, error: "invalid:energy" })
    expect(validateSubmission(questions, { weightKg: 80, answers: { energy: 6, training: "x" } })).toEqual({ ok: false, error: "invalid" })
    expect(validateSubmission(questions, { weightKg: 80, answers: { energy: 3, training: "   " } })).toEqual({ ok: false, error: "missing:training" })
  })
})

describe("client loop copy", () => {
  it("coach reply push carries the first 80 characters", () => {
    const push = coachReplyPush("Sean", `${"a".repeat(70)}\n\nbbbbbbbbbbbbbbbbbbbb`)
    expect(push.title).toBe("Sean replied to your check-in")
    expect(push.body).toHaveLength(80)
    expect(push.body.startsWith("a".repeat(70) + " ")).toBe(true)
    expect(checkinFollowupPush("Sean").body).toBe("A minute now and Sean can review your week.")
  })

  it("invite email follows Q75 and leaves the name out when unknown", () => {
    const e = inviteEmailContent({ to: "a@b.c", firstName: null, coach: "Sean", coachEmail: "s@x.y", productName: "Honest Reps", link: "https://app.honestreps.app/invite/t" })
    expect(e.subject).toBe("Sean invited you to Honest Reps")
    expect(e.text.startsWith("Hi,\n")).toBe(true)
    expect(e.text).toContain("This invite expires in 14 days.")
    expect(e.html).toContain('href="https://app.honestreps.app/invite/t"')
    for (const s of [e.subject, e.text]) expect(s).not.toMatch(/[!–—]/)
  })

  it("invite tokens are 43 URL safe characters and hash to hex", () => {
    const t = newInviteToken()
    expect(looksLikeInviteToken(t)).toBe(true)
    expect(looksLikeInviteToken("short")).toBe(false)
    expect(hashInviteToken(t)).toMatch(/^[0-9a-f]{64}$/)
  })
})
