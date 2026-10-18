import { scrubBreadcrumb, scrubEvent } from "./scrub"

// Shared by the browser, Node and edge inits. Without a DSN (local, CI and
// tests) Sentry stays off. The release is injected at build from the Vercel
// commit, and source maps are uploaded when SENTRY_AUTH_TOKEN is set.
export const sentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
  sendDefaultPii: false,
  // Errors only on the free tier: no tracing, no replays, no logs.
  tracesSampleRate: 0,
  maxBreadcrumbs: 30,
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
}
