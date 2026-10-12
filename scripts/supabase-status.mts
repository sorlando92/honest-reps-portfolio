import { execSync } from "node:child_process"

export interface LocalSupabase {
  url: string
  anonKey: string
  serviceRoleKey: string
  mailUrl: string
}

/** Reads URLs and keys from the running local Supabase stack. */
export function readLocalSupabase(): LocalSupabase {
  let out: string
  try {
    out = execSync("pnpm exec supabase status -o env", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
  } catch {
    throw new Error(
      "Local Supabase is not running. Start Docker Desktop, then run: pnpm db:start && pnpm db:reset"
    )
  }

  const env = Object.fromEntries(
    out
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => [m[1], m[2]])
  )

  const url = env.API_URL
  const anonKey = env.ANON_KEY ?? env.PUBLISHABLE_KEY
  const serviceRoleKey = env.SERVICE_ROLE_KEY ?? env.SECRET_KEY
  const mailUrl = env.MAILPIT_URL ?? env.INBUCKET_URL ?? "http://127.0.0.1:54324"
  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error(`Could not read keys from supabase status. Got: ${Object.keys(env).join(", ")}`)
  }
  return { url, anonKey, serviceRoleKey, mailUrl }
}
