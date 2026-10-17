"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/screen"
import { servingText, type FoodResult } from "@/modules/nutrition/foods/hits"
import { CustomFoodForm, valuesFromFood } from "@/modules/nutrition/ui/custom-food-form"

/** The custom food list: Edit opens the form in place, Delete asks once. */
export function MyFoods({ initial }: { initial: FoodResult[] }) {
  const [foods, setFoods] = useState(initial)
  const [editing, setEditing] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [status, setStatus] = useState("")

  async function remove(food: FoodResult) {
    const res = await fetch(`/api/foods/custom/${food.foodItemId}`, { method: "DELETE" }).catch(() => null)
    setConfirming(null)
    if (!res?.ok) return setStatus("Not deleted. Try again.")
    setFoods(foods.filter((f) => f.foodItemId !== food.foodItemId))
    setStatus(`Deleted ${food.name}.`)
  }

  return (
    <>
      <p role="status" aria-live="polite" className={status ? "text-body text-text-muted" : "sr-only"}>
        {status}
      </p>
      {foods.length === 0 && <EmptyState>No custom foods yet. Foods you scan from a label or enter yourself show up here.</EmptyState>}
      <ul className="flex flex-col gap-2">
        {foods.map((food) => (
          <li key={food.foodItemId} className="flex flex-col gap-2 rounded-lg bg-surface p-4">
            {editing === food.foodItemId ? (
              <CustomFoodForm
                initial={valuesFromFood(food)}
                source={null}
                editId={food.foodItemId}
                showBarcode
                onSaved={(saved) => {
                  setFoods(foods.map((f) => (f.foodItemId === saved.foodItemId ? saved : f)))
                  setEditing(null)
                  setStatus(`Saved ${saved.name}.`)
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <>
                <div className="flex flex-col gap-0.5">
                  <span className="text-headline break-words">{food.name}</span>
                  <span className="text-caption text-text-muted tabular-nums">
                    {[food.brand, food.serving ? `${servingText(food.serving)}, ${Math.round(food.serving.kcal)} cal` : null, food.barcode ? "Barcode saved" : null].filter(Boolean).join(" · ")}
                  </span>
                </div>
                {confirming === food.foodItemId ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-body">Delete {food.name}? Meals you logged keep their numbers.</p>
                    <Button variant="danger" onClick={() => remove(food)}>
                      Delete
                    </Button>
                    <Button variant="text" onClick={() => setConfirming(null)}>
                      Keep it
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="secondary" className="flex-1 bg-bg" onClick={() => setEditing(food.foodItemId)} aria-label={`Edit ${food.name}`}>
                      Edit
                    </Button>
                    <Button variant="danger" className="flex-1 bg-bg" onClick={() => setConfirming(food.foodItemId)} aria-label={`Delete ${food.name}`}>
                      Delete
                    </Button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
