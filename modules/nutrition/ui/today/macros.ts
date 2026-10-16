// Macro names and color classes (DESIGN_SYSTEM.md macro tokens). Plain
// constants, so server components (meal cards) and client ones share them.

export type Macro = "protein" | "carbs" | "fat" | "calories"
export type MacroMode = "eaten" | "left"

export const MACRO_LABEL: Record<Macro, string> = { protein: "Protein", carbs: "Carbs", fat: "Fat", calories: "Calories" }
export const MACRO_LETTER: Record<Macro, string> = { protein: "P", carbs: "C", fat: "F", calories: "kcal" }

// Full class names, so Tailwind sees them.
export const MACRO_STROKE: Record<Macro, string> = {
  protein: "text-macro-protein",
  carbs: "text-macro-carbs",
  fat: "text-macro-fat",
  calories: "text-macro-calories",
}
export const MACRO_TEXT: Record<Macro, string> = {
  protein: "text-macro-protein-text",
  carbs: "text-macro-carbs-text",
  fat: "text-macro-fat-text",
  calories: "text-macro-calories-text",
}
export const MACRO_CHIP: Record<Macro, string> = {
  protein: "bg-macro-protein/15",
  carbs: "bg-macro-carbs/15",
  fat: "bg-macro-fat/15",
  calories: "bg-macro-calories/15",
}
