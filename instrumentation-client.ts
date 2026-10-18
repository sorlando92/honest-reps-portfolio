import * as Sentry from "@sentry/nextjs"
import { sentryOptions } from "@/lib/monitoring/options"

Sentry.init({
  ...sentryOptions,
  // No Session Replay: it would record what people log.
  integrations: (defaults) => defaults.filter((i) => i.name !== "Replay"),
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
