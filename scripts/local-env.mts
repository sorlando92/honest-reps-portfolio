// Writes .env.local for the running local Supabase stack. Keeps any other
// keys already in the file (API keys you added by hand).

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { readLocalSupabase } from "./supabase-status.mts"

const FILE = ".env.local"
const local = readLocalSupabase()

const managed: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: local.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: local.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: local.serviceRoleKey,
  APP_URL: "http://127.0.0.1:3000",
}

const existing = existsSync(FILE) ? readFileSync(FILE, "utf8").split(/\r?\n/) : []
const kept = existing.filter((line) => {
  const key = line.split("=")[0]
  return line.trim() !== "" && !(key in managed)
})
if (!kept.some((line) => line.startsWith("COACH_EMAIL="))) kept.push("COACH_EMAIL=coach@example.test")

const lines = [...Object.entries(managed).map(([k, v]) => `${k}=${v}`), ...kept]
writeFileSync(FILE, `${lines.join("\n")}\n`)
console.log(`Wrote ${FILE} for ${local.url}`)
