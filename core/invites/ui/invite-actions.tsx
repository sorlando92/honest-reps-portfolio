"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { IssuedLink } from "./invite-form"

/** Resend (new token, the old one dies) and Revoke for a pending invite (Q69). */
export function InviteActions({ id, email }: { id: string; email: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [issued, setIssued] = useState<{ link: string; emailed: boolean } | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function act(action: "resend" | "revoke") {
    setError(null)
    startTransition(async () => {
      const res = await fetch(`/api/invites/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      }).catch(() => null)
      if (!res?.ok) {
        setError("Not saved. Try again.")
        return
      }
      if (action === "resend") setIssued((await res.json()) as { link: string; emailed: boolean })
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <Button type="button" variant="text" disabled={pending} onClick={() => act("resend")} aria-label={`Resend invite to ${email}`}>
          Resend
        </Button>
        <Button type="button" variant="text" disabled={pending} onClick={() => act("revoke")} aria-label={`Revoke invite to ${email}`}>
          Revoke
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-caption text-caution">
          {error}
        </p>
      )}
      {issued && <IssuedLink issued={issued} copied={copied} onCopy={() => setCopied(true)} />}
    </div>
  )
}
