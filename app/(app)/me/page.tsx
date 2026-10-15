import { Suspense } from "react"
import type { Metadata } from "next"
import { getCurrentUser } from "@/core/auth/current-user"
import { Screen } from "@/components/screen"
import { Button } from "@/components/ui/button"
import { signOut } from "./actions"

export const metadata: Metadata = { title: "Me" }

export default function MePage() {
  return (
    <Screen title="Me">
      <Suspense fallback={<div className="h-6" />}>
        <SignedInAs />
      </Suspense>
      <section aria-labelledby="about" className="flex flex-col gap-1 rounded-lg bg-surface p-4">
        <h2 id="about" className="text-label text-text-muted uppercase">
          About
        </h2>
        <p className="text-body">
          Food data from{" "}
          <a href="https://openfoodfacts.org" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-accent-strong underline">
            Open Food Facts
          </a>
        </p>
      </section>
      <form action={signOut}>
        <Button type="submit" variant="secondary" className="w-full">
          Sign out
        </Button>
      </form>
    </Screen>
  )
}

async function SignedInAs() {
  const user = await getCurrentUser()
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-surface p-4">
      <span className="text-label text-text-muted uppercase">Signed in as</span>
      <span className="text-body break-all">{user.email}</span>
    </div>
  )
}
