// The custom food request body, checked by the API. Kept apart from custom.ts
// so the form, which imports custom.ts, does not ship zod.

import { z } from "zod"
import { SERVING_UNITS } from "./custom"

export const customFoodInput = z.object({
  name: z.string().trim().min(1).max(300),
  brand: z.string().trim().max(200).nullable(),
  /** Any barcode form; stored as the canonical GTIN-14. Must pass its check digit. */
  gtin: z.string().trim().max(20).nullable(),
  /** The label's words for one serving ("1 scoop"); optional. */
  servingLabel: z.string().trim().max(100).nullable(),
  servingSize: z.number().positive().max(5000),
  servingUnit: z.enum(SERVING_UNITS),
  calories: z.number().min(0).max(5000),
  proteinG: z.number().min(0).max(1000),
  carbsG: z.number().min(0).max(1000),
  fatG: z.number().min(0).max(1000),
})

export type CustomFoodInput = z.infer<typeof customFoodInput>
