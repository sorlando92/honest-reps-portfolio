// Module registry (ARCHITECTURE.md "Module boundaries"). Core never imports
// from /modules. Instead each module registers what it contributes to core
// features here, and core reads the registry. The contribution shapes are
// filled in by the milestones that need them (check-ins M3, reports M3,
// review prep M4, roster flags M4).

export type ModuleId = "nutrition"

export interface ModuleContribution {
  id: ModuleId
  /** Shown in logs and the coach view. */
  label: string
}

const registry = new Map<ModuleId, ModuleContribution>()

export function registerModule(contribution: ModuleContribution): void {
  registry.set(contribution.id, contribution)
}

export function registeredModules(): ModuleContribution[] {
  return [...registry.values()]
}
