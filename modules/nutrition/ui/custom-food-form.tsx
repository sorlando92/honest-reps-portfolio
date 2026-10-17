"use client"

import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { SERVING_UNITS, servingGrams, type CustomFoodInput, type ServingUnit } from "../foods/custom"
import type { FoodResult } from "../foods/hits"
import { qualityIssue } from "../foods/label"

export interface CustomFoodValues {
  name: string
  brand: string
  gtin: string
  servingLabel: string
  servingSize: string
  servingUnit: ServingUnit
  calories: string
  proteinG: string
  carbsG: string
  fatG: string
}

const NUMBER_FIELDS = ["servingSize", "calories", "proteinG", "carbsG", "fatG"] as const

export const EMPTY_FOOD: CustomFoodValues = { name: "", brand: "", gtin: "", servingLabel: "", servingSize: "", servingUnit: "g", calories: "", proteinG: "", carbsG: "", fatG: "" }

/** Fields that differ from what the form opened with (label_scanned edited_fields_count). */
export function editedCount(a: CustomFoodValues, b: CustomFoodValues): number {
  return (Object.keys(a) as (keyof CustomFoodValues)[]).filter((k) => String(a[k]).trim() !== String(b[k]).trim()).length
}

/**
 * A custom food (docs/FOOD_LOOKUP_SPEC.md 4): name, brand, optional barcode,
 * one serving and its calories and macros. Creates one (Enter it yourself,
 * label scan) or edits one (More, My foods). `check` marks fields the label
 * read was unsure of.
 */
export function CustomFoodForm({
  initial,
  check = [],
  note,
  source,
  editId,
  showBarcode,
  submitLabel = "Save food",
  onSaved,
  onCancel,
  cancelLabel = "Cancel",
}: {
  initial: CustomFoodValues
  check?: (keyof CustomFoodValues)[]
  note?: string
  /** How a new food was made; null when editing. */
  source: "label" | "manual" | null
  editId?: string
  showBarcode: boolean
  submitLabel?: string
  onSaved: (result: FoodResult, values: CustomFoodValues) => void
  onCancel: () => void
  cancelLabel?: string
}) {
  const id = useId()
  const [values, setValues] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const num = (s: string) => (s.trim() === "" ? 0 : Number(s))

  const size = Number(values.servingSize)
  const quality =
    size > 0 && values.calories.trim() !== ""
      ? qualityIssue({ grams: servingGrams(size, values.servingUnit), kcal: num(values.calories), protein_g: num(values.proteinG), carbs_g: num(values.carbsG), fat_g: num(values.fatG) })
      : null

  async function save() {
    setError(null)
    if (!values.name.trim()) return setError("Add a name for this food.")
    if (!(size > 0)) return setError("Add the serving size.")
    if (values.calories.trim() === "") return setError("Add the calories in one serving.")
    if (NUMBER_FIELDS.some((k) => !Number.isFinite(num(values[k])) || num(values[k]) < 0)) return setError("Use numbers of 0 or more.")
    const input: CustomFoodInput = {
      name: values.name.trim(),
      brand: values.brand.trim() || null,
      gtin: values.gtin.trim() || null,
      servingLabel: values.servingLabel.trim() || null,
      servingSize: size,
      servingUnit: values.servingUnit,
      calories: num(values.calories),
      proteinG: num(values.proteinG),
      carbsG: num(values.carbsG),
      fatG: num(values.fatG),
    }
    setSaving(true)
    const res = await fetch(editId ? `/api/foods/custom/${editId}` : "/api/foods/custom", {
      method: editId ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(editId ? input : { ...input, source }),
    }).catch(() => null)
    setSaving(false)
    if (!res) return setError(navigator.onLine ? "Not saved. Try again." : "You're offline. Save it when you're back online.")
    if (res.status === 409) return setError("You already have a food with this barcode. Find it in More, My foods.")
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      return setError(body?.error === "Invalid barcode" ? "That barcode number does not check out. Fix it or leave it empty." : "Not saved. Try again.")
    }
    const { result } = (await res.json()) as { result: FoodResult }
    onSaved(result, values)
  }

  const field = (key: keyof CustomFoodValues, label: string, opts: { numeric?: boolean; hint?: string } = {}) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`${id}-${key}`} className="text-label text-text-muted uppercase">
        {label}
        {check.includes(key) && values[key] === initial[key] && <span className="ml-2 normal-case text-caution">Check this</span>}
      </label>
      <input
        id={`${id}-${key}`}
        value={values[key]}
        onChange={(e) => setValues({ ...values, [key]: e.target.value })}
        type={opts.numeric ? "number" : "text"}
        inputMode={opts.numeric ? "decimal" : key === "gtin" ? "numeric" : undefined}
        min={opts.numeric ? 0 : undefined}
        step={opts.numeric ? "any" : undefined}
        maxLength={opts.numeric ? undefined : key === "gtin" ? 20 : key === "servingLabel" ? 100 : key === "brand" ? 200 : 300}
        placeholder={opts.hint}
        autoComplete="off"
        className="h-12 min-w-0 rounded-md border border-border bg-surface px-4 text-body text-text tabular-nums placeholder:text-text-muted"
      />
    </div>
  )

  return (
    <form
      aria-label={editId ? "Edit food" : "Enter a food"}
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      className="flex flex-col gap-3 pb-4"
    >
      {note && <p className="text-body text-text-muted">{note}</p>}
      {field("name", "Food")}
      {field("brand", "Brand (optional)")}
      {showBarcode && field("gtin", "Barcode (optional)")}
      {field("servingLabel", "Serving (optional)", { hint: "1 scoop" })}
      <div className="grid grid-cols-2 gap-3">
        {field("servingSize", "Serving size", { numeric: true })}
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-unit`} className="text-label text-text-muted uppercase">
            Unit
          </label>
          <select
            id={`${id}-unit`}
            value={values.servingUnit}
            onChange={(e) => setValues({ ...values, servingUnit: e.target.value as ServingUnit })}
            className="h-12 rounded-md border border-border bg-surface px-3 text-body text-text"
          >
            {SERVING_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        {field("calories", "Calories", { numeric: true })}
        {field("proteinG", "Protein (g)", { numeric: true })}
        {field("carbsG", "Carbs (g)", { numeric: true })}
        {field("fatG", "Fat (g)", { numeric: true })}
      </div>
      {quality === "calories_mismatch" && (
        <p role="status" className="text-body text-caution">
          Check this: the calories do not match the protein, carbs and fat.
        </p>
      )}
      {error && (
        <p role="alert" className="text-body">
          {error}
        </p>
      )}
      <Button type="submit" disabled={saving}>
        {saving ? "Saving" : submitLabel}
      </Button>
      <Button type="button" variant="text" onClick={onCancel} disabled={saving}>
        {cancelLabel}
      </Button>
    </form>
  )
}

/** A saved custom food back into form values, for editing. */
export function valuesFromFood(food: FoodResult): CustomFoodValues {
  const s = food.serving
  const label = s?.label ?? ""
  const words = label.replace(/\s*\([^)]*\)\s*$/, "").trim()
  const measured = /^\d/.test(words) && /\b(g|ml|oz)$/.test(words)
  return {
    name: food.name,
    brand: food.brand ?? "",
    gtin: food.barcode ? food.barcode.replace(/^0+(?=\d{12,13}$)/, "") : "",
    servingLabel: measured ? "" : words,
    servingSize: s?.grams ? String(s.grams) : "",
    servingUnit: "g",
    calories: s ? String(s.kcal) : "",
    proteinG: s ? String(s.protein_g) : "",
    carbsG: s ? String(s.carbs_g) : "",
    fatG: s ? String(s.fat_g) : "",
  }
}
