import * as Sentry from "@sentry/nextjs"
import { sentryOptions } from "@/lib/monitoring/options"

export function register() {
  Sentry.init(sentryOptions)
}

// Server component, route handler and server action errors.
export const onRequestError = Sentry.captureRequestError
