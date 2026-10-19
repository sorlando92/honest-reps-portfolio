/**
 * The app's public origin for links sent outside the app (invite emails).
 * APP_URL is set for Production and locally; a Vercel preview has none and
 * uses its own deployment host, VERCEL_URL (PM 2026-10-19).
 */
export function appBaseUrl(env: Record<string, string | undefined> = process.env): string {
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, "")
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`
  return "https://app.honestreps.app"
}
