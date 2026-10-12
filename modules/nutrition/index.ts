import { registerModule } from "@/core/modules"

// Nutrition is the first module. Its check-in metrics, report cards, review
// inputs and roster flags are registered here as later milestones build them.
registerModule({ id: "nutrition", label: "Nutrition" })
