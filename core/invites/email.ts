import "server-only"

// The invite email (PM 2026-10-18, QUESTIONS.md Q75), sent through the Resend
// API from the same sender as sign in, with replies going to the coach.

export interface InviteEmail {
  to: string
  firstName: string | null
  coach: string
  coachEmail: string | null
  productName: string
  link: string
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

export function inviteEmailContent(e: InviteEmail) {
  const greeting = e.firstName ? `Hi ${e.firstName},` : "Hi,"
  const subject = `${e.coach} invited you to ${e.productName}`
  const lines = [
    `I set you up on ${e.productName}. It's where you'll log food and send your weekly check-in.`,
    "Tap below to join. It takes about three minutes.",
  ]
  const text = [greeting, "", ...lines, "", `Join ${e.productName}: ${e.link}`, "", "This invite expires in 14 days.", "", e.coach].join("\n")
  // eslint-disable-next-line honest-reps/copy-rules -- the doctype, not copy
  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;font-size:16px;line-height:1.5;color:#111;max-width:480px;margin:0 auto;padding:24px">
<p>${escape(greeting)}</p>
${lines.map((l) => `<p>${escape(l)}</p>`).join("\n")}
<p><a href="${escape(e.link)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#111;color:#fff;text-decoration:none;font-weight:600">Join ${escape(e.productName)}</a></p>
<p>This invite expires in 14 days.</p>
<p>${escape(e.coach)}</p>
</body></html>`
  return { subject, text, html }
}

/** True when Resend accepted the email. Without RESEND_API_KEY nothing is sent. */
export async function sendInviteEmail(e: InviteEmail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.error("[invite] RESEND_API_KEY missing; email not sent")
    return false
  }
  const { subject, text, html } = inviteEmailContent(e)
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: `${e.productName} <auth@mail.honestreps.app>`,
      to: [e.to],
      reply_to: e.coachEmail ?? undefined,
      subject,
      text,
      html,
    }),
  }).catch(() => null)
  if (!res?.ok) console.error("[invite] Resend refused", { status: res?.status })
  return Boolean(res?.ok)
}
