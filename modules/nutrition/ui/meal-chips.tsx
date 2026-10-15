"use client"

import { ToggleGroup } from "radix-ui"
import { MEAL_LABEL, MEALS, type Meal } from "../entries/meals"

/** Which meal an entry files under, on the card and in edit (DESIGN_SYSTEM "Meal chip row"). */
export function MealChips({ value, onChange }: { value: Meal; onChange: (meal: Meal) => void }) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(next) => next && onChange(next as Meal)}
      aria-label="Meal"
      className="flex flex-wrap gap-2 pb-3"
    >
      {MEALS.map((meal) => (
        <ToggleGroup.Item
          key={meal}
          value={meal}
          className="h-11 min-w-11 rounded-full bg-surface px-4 text-body text-text data-[state=on]:bg-accent data-[state=on]:text-on-accent"
        >
          {MEAL_LABEL[meal]}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
