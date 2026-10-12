import type { TestProject } from "vitest/node"
import { readLocalSupabase, type LocalSupabase } from "../../scripts/supabase-status.mts"

declare module "vitest" {
  export interface ProvidedContext {
    supabase: LocalSupabase
  }
}

export default function setup(project: TestProject) {
  project.provide("supabase", readLocalSupabase())
}
