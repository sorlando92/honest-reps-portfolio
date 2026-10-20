"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

/** AI logging on or off for one client; only their coach sees it (POST /api/clients/[id]/ai). */
export function AiToggle({ clientId, name, enabled }: { clientId: string; name: string; enabled: boolean }) {
  const router = useRouter()
  const [on, setOn] = useState(enabled)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function toggle() {
    const next = !on
    setError(null)
    startTransition(async () => {
      const res = await fetch(`/api/clients/${clientId}/ai`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      }).catch(() => null)
      if (!res?.ok) {
        setError("Not saved. Try again.")
        return
      }
      setOn(((await res.json()) as { enabled: boolean }).enabled)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`AI logging for ${name}`}
        disabled={pending}
        onClick={toggle}
        className="flex min-h-11 min-w-11 items-center justify-end disabled:opacity-50"
      >
        <span aria-hidden className={`relative h-7 w-12 rounded-full transition-colors motion-reduce:transition-none ${on ? "bg-accent-strong" : "bg-border"}`}>
          <span className={`absolute top-1 size-5 rounded-full bg-bg transition-[left] motion-reduce:transition-none ${on ? "left-6" : "left-1"}`} />
        </span>
      </button>
      {error && (
        <p role="alert" className="text-caption text-caution">
          {error}
        </p>
      )}
    </div>
  )
}
