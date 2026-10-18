"use client"

import { useRef, useState } from "react"
import { Camera } from "lucide-react"
import { Button } from "@/components/ui/button"
import { track } from "@/core/events/client"
import { shrinkImage } from "@/lib/shrink-image"
import type { FoodResult } from "../foods/hits"
import { CustomFoodForm, EMPTY_FOOD, editedCount, type CustomFoodValues } from "./custom-food-form"

/** Claude reads images up to 1568 px on the long side without downscaling. */
const MAX_SIDE = 1568

interface LabelRead {
  product_name: string | null
  brand: string | null
  serving_label: string | null
  serving_grams: number | null
  serving_ml: number | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  confidence: number
}

type State =
  | { kind: "photo" }
  | { kind: "reading" }
  | { kind: "form"; values: CustomFoodValues; check: (keyof CustomFoodValues)[]; note?: string; read: boolean }


const fmt = (n: number | null) => (n === null ? "" : String(Math.round(n * 10) / 10))

/** The label read as form values, and the fields to double check. */
function fromRead(read: LabelRead, gtin: string): { values: CustomFoodValues; check: (keyof CustomFoodValues)[] } {
  const words = read.serving_label?.replace(/\s*\([^)]*\)\s*$/, "").trim() ?? ""
  const values: CustomFoodValues = {
    ...EMPTY_FOOD,
    name: read.product_name ?? "",
    brand: read.brand ?? "",
    gtin,
    servingLabel: /^\d+(\.\d+)?\s*(g|ml)$/i.test(words) ? "" : words,
    servingSize: fmt(read.serving_grams ?? read.serving_ml),
    servingUnit: read.serving_grams === null && read.serving_ml !== null ? "ml" : "g",
    calories: fmt(read.calories),
    proteinG: fmt(read.protein_g),
    carbsG: fmt(read.carbs_g),
    fatG: fmt(read.fat_g),
  }
  const unsure = read.confidence < 0.7
  const check = (["name", "servingSize", "calories", "proteinG", "carbsG", "fatG"] as const).filter((k) => unsure || values[k] === "")
  return { values, check }
}

/**
 * Scan the label (docs/FOOD_LOOKUP_SPEC.md 3): photograph the Nutrition
 * Facts panel, AI reads it (P2 label mode), the user confirms or edits, and
 * it is saved as a custom food on the GTIN so the next scan is instant.
 */
export function LabelScan({ gtin, onSaved, onCancel }: { gtin: string | null; onSaved: (result: FoodResult) => void; onCancel: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<State>({ kind: "photo" })
  const [error, setError] = useState<string | null>(null)
  const [opened, setOpened] = useState<CustomFoodValues | null>(null)
  const typed = gtin ? gtin.replace(/^0+(?=\d{12,13}$)/, "") : ""

  async function read(file: File) {
    setError(null)
    setState({ kind: "reading" })
    const body = new FormData()
    try {
      body.append("photo", await shrinkImage(file, MAX_SIDE), "label.jpg")
    } catch {
      body.append("photo", file)
    }
    if (gtin) body.append("gtin", gtin)
    const res = await fetch("/api/foods/label", { method: "POST", body }).catch(() => null)
    if (!res || res.status === 429) {
      setState({ kind: "photo" })
      return setError(!res ? (navigator.onLine ? "That did not work. Try again." : "You're offline. Label scans work when you're back online.") : "Too many label scans in an hour. Enter it yourself for now.")
    }
    const { label } = res.ok ? ((await res.json()) as { label: LabelRead | null }) : { label: null }
    const success = Boolean(label && label.calories !== null && (label.serving_grams !== null || label.serving_ml !== null))
    if (!label || !success) {
      track("label_scanned", { success: false, edited_fields_count: 0 })
      const values = { ...EMPTY_FOOD, gtin: typed, ...(label ? fromRead(label, typed).values : {}) }
      setOpened(values)
      return setState({ kind: "form", values, check: [], note: "We could not read that label. Try another photo or enter it yourself.", read: false })
    }
    const { values, check } = fromRead(label, typed)
    setOpened(values)
    setState({ kind: "form", values, check, read: true })
  }

  if (state.kind === "form") {
    return (
      <div className="flex flex-col gap-3">
        <CustomFoodForm
          initial={state.values}
          check={state.check}
          note={state.note ?? "Check the numbers against the label, then save."}
          source="label"
          showBarcode={Boolean(gtin)}
          submitLabel="Save and add"
          onSaved={(result, values) => {
            if (state.read) track("label_scanned", { success: true, edited_fields_count: opened ? editedCount(opened, values) : 0 })
            onSaved(result)
          }}
          onCancel={onCancel}
        />
        {!state.read && (
          <Button variant="secondary" onClick={() => input.current?.click()}>
            Take another photo
          </Button>
        )}
        <input ref={input} type="file" aria-hidden accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 pb-4">
      <p className="text-body">Take a photo of the Nutrition Facts panel. Fill the frame and keep it flat and in focus.</p>
      {state.kind === "reading" && (
        <p role="status" className="text-body text-text-muted">
          Reading the label.
        </p>
      )}
      {error && (
        <p role="alert" className="text-body">
          {error}
        </p>
      )}
      {/* The file input sits inside its label so the label shows keyboard focus. */}
      <label
        aria-disabled={state.kind === "reading"}
        className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-md bg-accent px-6 text-headline text-on-accent focus-within:ring-2 focus-within:ring-accent-strong focus-within:ring-offset-2 aria-disabled:pointer-events-none aria-disabled:opacity-50"
      >
        <Camera aria-hidden className="size-5" />
        Take a photo of the label
        <input
          ref={input}
          type="file"
          accept="image/*"
          capture="environment"
          disabled={state.kind === "reading"}
          className="sr-only"
          onChange={(e) => e.target.files?.[0] && read(e.target.files[0])}
        />
      </label>
      <Button variant="text" onClick={onCancel} disabled={state.kind === "reading"}>
        Cancel
      </Button>
    </div>
  )
}
