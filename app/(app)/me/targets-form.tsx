"use client"

import { useId, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

type Field = "calories" | "proteinG" | "carbsG" | "fatG"
const FIELDS: { key: Field; label: string; unit: string }[] = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "proteinG", label: "Protein", unit: "g" },
  { key: "carbsG", label: "Carbs", unit: "g" },
  { key: "fatG", label: "Fat", unit: "g" },
]

/**
 * A free user's own targets (PRD F1). Calories below the estimated BMR need
 * a confirmation, with a plain note.
 */
export function TargetsForm({ initial, floor }: { initial: Record<Field, number>; floor: number | null }) {
  const id = useId()
  const router = useRouter()
  const [values, setValues] = useState<Record<Field, string>>({
    calories: String(initial.calories),
    proteinG: String(initial.proteinG),
    carbsG: String(initial.carbsG),
    fatG: String(initial.fatG),
  })
  const [confirming, setConfirming] = useState(false)
  const [status, setStatus] = useState<{ kind: "saved" | "error"; text: string } | null>(null)
  const [saving, start] = useTransition()

  const numbers = Object.fromEntries(FIELDS.map((f) => [f.key, Number(values[f.key])])) as Record<Field, number>
  const valid = FIELDS.every((f) => /^\d+$/.test(values[f.key])) && numbers.calories >= 500
  const changed = FIELDS.some((f) => numbers[f.key] !== initial[f.key])
  const belowFloor = floor !== null && numbers.calories < floor
  const macroCalories = numbers.proteinG * 4 + numbers.carbsG * 4 + numbers.fatG * 9

  function save(belowFloorConfirmed: boolean) {
    setStatus(null)
    start(async () => {
      const res = await fetch("/api/targets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...numbers, belowFloorConfirmed }),
      }).catch(() => null)
      if (res?.status === 409) return setConfirming(true)
      if (!res?.ok) return setStatus({ kind: "error", text: "Not saved. Try again." })
      setConfirming(false)
      setStatus({ kind: "saved", text: "Saved." })
      router.refresh()
    })
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        if (belowFloor) setConfirming(true)
        else save(false)
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map((f) => (
          <div key={f.key} className="flex flex-col gap-1">
            <label htmlFor={`${id}-${f.key}`} className="text-label text-text-muted uppercase">
              {f.label} ({f.unit})
            </label>
            <input
              id={`${id}-${f.key}`}
              inputMode="numeric"
              value={values[f.key]}
              onChange={(e) => {
                setValues((v) => ({ ...v, [f.key]: e.target.value.replace(/\D/g, "") }))
                setConfirming(false)
                setStatus(null)
              }}
              className="h-12 rounded-md border border-border bg-bg px-3 text-body tabular-nums"
            />
          </div>
        ))}
      </div>
      <p className="text-caption text-text-muted tabular-nums">
        Protein, carbs and fat add up to {macroCalories.toLocaleString("en-US")} calories.
      </p>
      {confirming && floor !== null ? (
        <div role="alert" className="flex flex-col gap-2">
          <p className="text-body">
            {numbers.calories.toLocaleString("en-US")} calories is below your estimated resting burn of {floor.toLocaleString("en-US")}.
          </p>
          <Button type="button" onClick={() => save(true)} disabled={saving}>
            Save anyway
          </Button>
          <Button type="button" variant="text" onClick={() => setConfirming(false)} disabled={saving}>
            Change it
          </Button>
        </div>
      ) : (
        <Button type="submit" variant="secondary" disabled={!valid || !changed || saving}>
          {saving ? "Saving" : "Save targets"}
        </Button>
      )}
      <p role="status" aria-live="polite" className={status?.kind === "error" ? "text-body text-caution" : "text-caption text-text-muted"}>
        {status?.text ?? ""}
      </p>
    </form>
  )
}
