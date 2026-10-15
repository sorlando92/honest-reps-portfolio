import type { DraftItem } from "../parsing/service"

/** A card row as the entries API expects it (modules/nutrition/entries/save.ts). */
export function toEntryItem(i: DraftItem, confidence: number | null = i.confidence) {
  return {
    name: i.name,
    foodItemId: i.foodItemId,
    amount: i.quantity,
    unit: i.unit,
    grams: i.grams,
    amountSource: i.amountSource,
    state: i.state,
    calories: i.calories,
    proteinG: i.proteinG,
    carbsG: i.carbsG,
    fatG: i.fatG,
    flagReason: i.flagReason,
    confidence,
  }
}
