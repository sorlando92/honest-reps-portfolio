"use client"

import { useId, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

type Issued = { link: string; emailed: boolean }

/** Clients: invite a client by email with the paid flag comped or external (PRD F12). */
export function InviteForm() {
  const id = useId()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<Issued | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  function submit(form: FormData) {
    setError(null)
    setIssued(null)
    setCopied(false)
    startTransition(async () => {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: String(form.get("email") ?? "").trim(),
          firstName: String(form.get("firstName") ?? "").trim() || null,
          billingSource: form.get("billing") === "external" ? "external" : "comped",
        }),
      }).catch(() => null)
      if (!res?.ok) {
        setError(res?.status === 400 ? "Check the email address." : "The invite was not saved. Try again.")
        return
      }
      setIssued((await res.json()) as Issued)
      router.refresh()
    })
  }

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3 rounded-lg bg-surface px-4 py-3">
      <h2 id={`${id}-title`} className="text-headline">
        Invite a client
      </h2>
      <form action={submit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-email`} className="text-label text-text-muted uppercase">
            Email
          </label>
          <input id={`${id}-email`} name="email" type="email" required autoComplete="off" autoCapitalize="none" className="h-12 rounded-md border border-border bg-bg px-4 text-body" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-name`} className="text-label text-text-muted uppercase">
            First name (optional)
          </label>
          <input id={`${id}-name`} name="firstName" maxLength={40} autoComplete="off" className="h-12 rounded-md border border-border bg-bg px-4 text-body" />
        </div>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-label text-text-muted uppercase">Billing</legend>
          <label className="flex min-h-11 items-center gap-3 text-body">
            <input type="radio" name="billing" value="comped" defaultChecked className="size-11 shrink-0 accent-[var(--accent-strong)]" />
            Comped
          </label>
          <label className="flex min-h-11 items-center gap-3 text-body">
            <input type="radio" name="billing" value="external" className="size-11 shrink-0 accent-[var(--accent-strong)]" />
            Billed outside the app
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="text-body text-caution">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Sending" : "Send invite"}
        </Button>
      </form>
      {issued && <IssuedLink issued={issued} copied={copied} onCopy={() => setCopied(true)} />}
    </section>
  )
}

export function IssuedLink({ issued, copied, onCopy }: { issued: Issued; copied: boolean; onCopy: () => void }) {
  return (
    <div role="status" className="flex flex-col gap-2">
      <p className="text-body">{issued.emailed ? "Invite sent." : "The email did not go out. Copy the link and send it yourself."}</p>
      <Button
        type="button"
        variant="secondary"
        onClick={async () => {
          await navigator.clipboard.writeText(issued.link).catch(() => {})
          onCopy()
        }}
      >
        {copied ? "Link copied" : "Copy link"}
      </Button>
      {/* Q79: only the token's hash is stored, so the link cannot be shown again. */}
      <p className="text-caption text-text-muted">{"Copy this now. For security it won't be shown again."}</p>
    </div>
  )
}
