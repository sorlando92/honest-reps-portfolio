"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Ellipsis, Plus } from "lucide-react"
import { DropdownMenu } from "radix-ui"
import { Button } from "@/components/ui/button"
import { SECTION_LABEL, type Meal } from "../entries/meals"

/** Sent by a section's "+" so the log bar opens on that meal. */
export const LOG_MEAL_EVENT = "hr:log-meal"

/**
 * A meal section's header actions (docs/TODAY_SPEC.md 6): "+" focuses the log
 * bar with this meal selected; the menu copies the meal from another day.
 */
export function MealSectionControls({ meal, copy }: { meal: Meal; copy: { fromDate: string; label: string } | null }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [status, setStatus] = useState("")
  const name = SECTION_LABEL[meal]

  function copyMeal() {
    if (!copy) return
    start(async () => {
      const res = await fetch("/api/meals/copy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fromDate: copy.fromDate, meal }),
      }).catch(() => null)
      if (!res?.ok) return setStatus("Not copied. Try again.")
      const { copied } = (await res.json()) as { copied: number }
      setStatus(copied > 0 ? "Copied." : "Nothing to copy.")
      router.refresh()
    })
  }

  return (
    <div className="flex items-center">
      <p role="status" aria-live="polite" className="mr-2 text-caption text-text-muted">
        {status}
      </p>
      {copy && (
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger asChild>
            <Button variant="text" size="icon" aria-label={`More for ${name}`} disabled={busy}>
              <Ellipsis aria-hidden />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-48 rounded-lg border border-border bg-bg p-1">
              <DropdownMenu.Item
                onSelect={copyMeal}
                className="flex min-h-11 cursor-pointer items-center rounded-md px-3 text-body outline-none data-[highlighted]:bg-surface"
              >
                {copy.label}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
      <Button
        variant="text"
        size="icon"
        aria-label={`Add to ${name}`}
        onClick={() => window.dispatchEvent(new CustomEvent<Meal>(LOG_MEAL_EVENT, { detail: meal }))}
      >
        <Plus aria-hidden />
      </Button>
    </div>
  )
}
