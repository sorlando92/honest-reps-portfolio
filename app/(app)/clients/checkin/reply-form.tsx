"use client"

import { useId, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

/** The coach's reply to a check-in (PRD F5). Sent as a push to the client. */
export function ReplyForm({ checkinId, name }: { checkinId: string; name: string }) {
  const id = useId()
  const router = useRouter()
  const form = useRef<HTMLFormElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState("")
  const [pending, startTransition] = useTransition()

  // A form action: a reply typed and sent before the page hydrates still goes out.
  function send(data: FormData) {
    const body = String(data.get("body") ?? "").trim()
    setError(null)
    setStatus("")
    if (!body) {
      setError("Write a reply first.")
      return
    }
    startTransition(async () => {
      const res = await fetch(`/api/checkins/${checkinId}/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      }).catch(() => null)
      if (!res?.ok) {
        setError("Not sent. Try again.")
        return
      }
      form.current?.reset()
      setStatus("Reply sent.")
      router.refresh()
    })
  }

  return (
    <form ref={form} action={send} className="flex flex-col gap-2">
      <label htmlFor={id} className="text-label text-text-muted uppercase">
        {`Reply to ${name}`}
      </label>
      <textarea id={id} name="body" rows={6} maxLength={4000} required className="rounded-md border border-border bg-surface p-3 text-body" />
      {error && (
        <p role="alert" className="text-body text-caution">
          {error}
        </p>
      )}
      <p role="status" className="text-caption text-text-muted">
        {status}
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending" : "Send reply"}
      </Button>
    </form>
  )
}
