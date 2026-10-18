"use client"

import { useEffect } from "react"
import * as Sentry from "@sentry/nextjs"
import { Button } from "@/components/ui/button"
import "./globals.css"

/** Last resort when the root layout itself fails; reports the error (user id only). */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body>
        <main className="mx-auto flex min-h-dvh max-w-[720px] flex-col justify-center gap-4 px-4">
          <h1 className="text-title">Something went wrong.</h1>
          <p className="text-text-muted">Try again. If it keeps happening, tell your coach.</p>
          <Button type="button" onClick={reset}>
            Try again
          </Button>
        </main>
      </body>
    </html>
  )
}
