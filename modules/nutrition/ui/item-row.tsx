"use client"

import { useId, useRef } from "react"
import { Minus, Plus, X } from "lucide-react"
import { ToggleGroup } from "radix-ui"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import type { DraftItem } from "../parsing/service"
import { fromUnit, swapped, toUnit, weighed, withServings, type WeightUnit } from "./amounts"

const STATE_LABEL = { raw: "Raw", cooked: "Cooked", dry: "Dry" } as const

/** One food on the confirmation card (DESIGN_SYSTEM.md "Confirmation card"). */
export function ItemRow({
  item,
  unit,
  onUnitChange,
  onChange,
  onRemove,
  onChangeFood,
}: {
  item: DraftItem
  unit: WeightUnit
  onUnitChange: (unit: WeightUnit) => void
  onChange: (item: DraftItem) => void
  onRemove: () => void
  /** Opens food search to pick a different food for this row. */
  onChangeFood?: () => void
}) {
  const id = useId()
  const amountRef = useRef<HTMLInputElement>(null)
  const shown = toUnit(item.grams, unit)
  const step = unit === "g" ? 10 : 0.5
  const setAmount = (value: number) => onChange(weighed(item, fromUnit(Math.max(0, value), unit)))

  return (
    <li className="flex flex-col gap-3 rounded-lg bg-surface p-4">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-headline break-words">{item.name}</span>
          {item.match && item.match.name.toLowerCase() !== item.name.toLowerCase() && (
            <span className="text-caption text-text-muted break-words">{item.match.name}</span>
          )}
        </div>
        <Button variant="text" size="icon" aria-label={`Remove ${item.name}`} onClick={onRemove} className="-mt-2 -mr-2">
          <X aria-hidden />
        </Button>
      </div>

      <Signal item={item} onWeigh={() => amountRef.current?.focus()} />

      <div className="flex flex-wrap items-end gap-3">
        {item.serving ? (
          // PRD F2 (PM 2026-10-15): label items step in their published serving.
          <>
            <Stepper id={`${id}-amount`} label="Servings" name={item.name} value={item.quantity} step={0.5} onSet={(n) => onChange(withServings(item, n))} />
            <span className="pb-3 text-caption text-text-muted tabular-nums">
              {item.serving.label}
              {item.serving.grams ? `, ${toUnit(item.grams, unit)} ${unit}` : ""}
            </span>
          </>
        ) : (
          <>
            <Stepper id={`${id}-amount`} inputRef={amountRef} label="Amount" name={item.name} value={shown} step={step} onSet={setAmount} />
            <ToggleGroup.Root
              type="single"
              value={unit}
              onValueChange={(value) => value && onUnitChange(value as WeightUnit)}
              aria-label="Weight unit"
              className="flex rounded-md border border-border"
            >
              {(["g", "oz"] as const).map((u) => (
                <ToggleGroup.Item
                  key={u}
                  value={u}
                  className="h-11 min-w-11 px-3 text-body text-text-muted first:rounded-l-md last:rounded-r-md data-[state=on]:bg-accent data-[state=on]:text-on-accent"
                >
                  {u}
                </ToggleGroup.Item>
              ))}
            </ToggleGroup.Root>
          </>
        )}
        {item.state && <span className="pb-3 text-caption text-text-muted">{STATE_LABEL[item.state]}</span>}
      </div>

      <p className="text-caption text-text-muted tabular-nums">
        {item.calories} cal · {item.proteinG} g protein · {item.carbsG} g carbs · {item.fatG} g fat
      </p>

      {onChangeFood && (
        <Button variant="text" onClick={onChangeFood} aria-label={`Change food for ${item.name}`} className="h-11 self-start px-0 text-accent-strong">
          Change food
        </Button>
      )}

      {item.flagReason === "match" && item.alternatives.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-label text-text-muted uppercase">Did you mean</span>
          <ul className="flex flex-col gap-1">
            {item.alternatives.map((alt) => (
              <li key={`${alt.source}:${alt.sourceId}`}>
                <button
                  type="button"
                  onClick={() => onChange(swapped(item, alt))}
                  className="flex min-h-11 w-full items-center rounded-md bg-bg px-3 text-left text-body"
                >
                  {alt.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}

/** Minus, a typed number, plus. Each control is at least 44 by 44. */
function Stepper({
  id,
  inputRef,
  label,
  name,
  value,
  step,
  onSet,
}: {
  id: string
  inputRef?: React.Ref<HTMLInputElement>
  label: string
  name: string
  value: number
  step: number
  onSet: (value: number) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-label text-text-muted uppercase">
        {label}
      </label>
      <div className="flex items-center gap-1">
        <Button variant="secondary" size="icon" aria-label={`Less ${name}`} onClick={() => onSet(Math.max(0, value - step))} className="bg-bg">
          <Minus aria-hidden />
        </Button>
        <input
          ref={inputRef}
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={value}
          onChange={(e) => {
            const next = Number(e.target.value)
            if (Number.isFinite(next)) onSet(Math.max(0, next))
          }}
          className="h-11 w-20 rounded-md border border-border bg-bg px-2 text-center text-body tabular-nums text-text"
        />
        <Button variant="secondary" size="icon" aria-label={`More ${name}`} onClick={() => onSet(value + step)} className="bg-bg">
          <Plus aria-hidden />
        </Button>
      </div>
    </div>
  )
}

/** QUESTIONS.md Q34: one signal per row, by cause. */
function Signal({ item, onWeigh }: { item: DraftItem; onWeigh: () => void }) {
  if (item.flagReason === "match") {
    return (
      <p className="flex items-center gap-2 text-body">
        <span aria-hidden className="size-2 rounded-full bg-caution" />
        Check this
      </p>
    )
  }
  if (item.flagReason === "amount") {
    return (
      <p className="flex flex-wrap items-center gap-x-3 text-body text-text-muted">
        Estimated
        <Button variant="text" onClick={onWeigh} className={cn("h-11 px-0 text-accent-strong")}>
          Weigh it
        </Button>
      </p>
    )
  }
  if (item.amountSource === "hand") return <p className="text-caption text-text-muted">Hand portion</p>
  return null
}
