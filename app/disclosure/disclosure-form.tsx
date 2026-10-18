"use client"

import { useId, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { acceptDisclosure } from "./actions"

/** The checkbox is required, so the form cannot be sent until it is ticked, even before the page hydrates. */
export function DisclosureForm() {
  const id = useId()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="mt-2 flex flex-col gap-4"
      action={() => {
        setError(null)
        startTransition(async () => {
          const result = await acceptDisclosure()
          if (result?.error) setError(result.error)
        })
      }}
    >
      <label htmlFor={id} className="flex min-h-11 items-center gap-3 text-body">
        <input id={id} name="read" type="checkbox" required className="size-11 shrink-0 accent-[var(--accent-strong)]" />
        I have read and understand this.
      </label>
      {error && (
        <p role="alert" className="text-body text-caution">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving" : "Accept and continue"}
      </Button>
    </form>
  )
}
